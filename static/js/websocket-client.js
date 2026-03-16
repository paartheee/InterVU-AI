class InterviewWebSocket {
    constructor() {
        this.ws = null;
        this.mediaCapture = new MediaCapture();
        this.audioPlayer = new AudioPlayer();
        this.onSessionStarted = null;
        this.onInterviewEnded = null;
        this.onError = null;

        // Reconnection state
        this._systemPrompt = null;
        this._extraStartParams = {};
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 5;
        this._reconnectDelay = 1000;
        this._intentionalClose = false;
        this._isEnding = false;
        this._nativeAudio = false;
    }

    connect(systemPrompt, extraParams = {}) {
        this._systemPrompt = systemPrompt;
        this._extraStartParams = extraParams;
        this._intentionalClose = false;
        this._isEnding = false;
        this._openWebSocket();
    }

    _openWebSocket() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${location.host}/ws/interview`);

        this.ws.onopen = () => {
            if (this._reconnectAttempts > 0) {
                addLogEntry('WebSocket reconnected', 'info');
                showToast('Reconnected to interviewer', 'success');
            } else {
                addLogEntry('WebSocket connected', 'info');
            }
            this._reconnectAttempts = 0;

            this.ws.send(JSON.stringify({
                type: 'start',
                system_prompt: this._systemPrompt,
                ...this._extraStartParams,
            }));
        };

        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            switch (msg.type) {
                case 'session_started':
                    this._nativeAudio = !!msg.native_audio;
                    addLogEntry(`Session started: ${msg.session_id.slice(0, 8)}... (native_audio=${this._nativeAudio})`, 'info');
                    this._startMediaStreaming();
                    if (this.onSessionStarted) this.onSessionStarted(msg.session_id);
                    break;

                case 'audio': {
                    const pcmBytes = Uint8Array.from(
                        atob(msg.data), c => c.charCodeAt(0)
                    );
                    this.mediaCapture.setModelSpeaking(true);
                    this.audioPlayer.enqueue(pcmBytes);
                    updateStat('responses');
                    break;
                }

                case 'interrupted':
                    this.mediaCapture.setModelSpeaking(false);
                    this.audioPlayer.clearBuffer();
                    addLogEntry('AI INTERRUPTED (user speaking)', 'interrupt');
                    if (typeof finalizeWayneBubble === 'function') finalizeWayneBubble();
                    break;

                case 'turn_complete':
                    this.mediaCapture.setModelSpeaking(false);
                    addLogEntry('AI turn complete', 'ai');
                    if (typeof finalizeWayneBubble === 'function') finalizeWayneBubble();
                    break;

                case 'text':
                    addLogEntry(`AI text: ${msg.data.slice(0, 60)}...`, 'ai');
                    if (typeof addConversationBubble === 'function') addConversationBubble('wayne', msg.data);
                    break;

                case 'user_transcript':
                    if (typeof addConversationBubble === 'function') addConversationBubble('user', msg.data);
                    break;

                case 'interview_ended':
                    addLogEntry('Interview ended — generating report', 'info');
                    this._handleInterviewEnded(msg);
                    break;

                case 'timer_update':
                    if (typeof updateTimerFromServer === 'function') {
                        updateTimerFromServer(msg.remaining_seconds);
                    }
                    break;

                case 'time_up':
                    showToast('Time is up! Wayne is wrapping up...', 'warning');
                    addLogEntry('Interview time limit reached', 'info');
                    break;

                case 'confidence_update':
                    if (typeof updateConfidenceMeter === 'function') {
                        updateConfidenceMeter(msg.score);
                    }
                    break;

                case 'log':
                    addLogEntry(`[server] ${msg.data}`, msg.level || 'info');
                    break;

                case 'error':
                    addLogEntry(`Error: ${msg.data}`, 'interrupt');
                    showToast('Server error: ' + msg.data, 'error');
                    if (this.onError) this.onError(msg.data);
                    break;
            }
        };

        this.ws.onerror = (err) => {
            addLogEntry('WebSocket error', 'interrupt');
        };

        this.ws.onclose = (event) => {
            if (this._intentionalClose || this._isEnding) {
                addLogEntry('WebSocket closed', 'info');
                return;
            }

            if (this._reconnectAttempts < this._maxReconnectAttempts) {
                this._reconnectAttempts++;
                const delay = this._reconnectDelay * Math.pow(2, this._reconnectAttempts - 1);
                const indicator = document.getElementById('status-indicator');
                indicator.textContent = `Reconnecting (${this._reconnectAttempts}/${this._maxReconnectAttempts})...`;
                indicator.className = 'reconnecting';

                addLogEntry(`Connection lost — reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`, 'interrupt');
                showToast(`Reconnecting to interviewer... (${this._reconnectAttempts}/${this._maxReconnectAttempts})`, 'warning');

                setTimeout(() => this._openWebSocket(), delay);
            } else {
                addLogEntry('Max reconnection attempts reached', 'interrupt');
                showToast('Connection lost. Please restart the interview.', 'error', 8000);
                const indicator = document.getElementById('status-indicator');
                indicator.textContent = 'Disconnected';
                indicator.className = 'error';
            }
        };
    }

    _startMediaStreaming() {
        // For native-audio models, tell MediaCapture to stream all audio
        // continuously (including silence) so the model's own VAD can
        // detect speech boundaries.
        if (this._nativeAudio) {
            this.mediaCapture.setNativeAudioMode(true);
        }

        this.mediaCapture.onAudioChunk = (base64Pcm) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'audio', data: base64Pcm }));
                updateStat('audio');
            }
        };

        this.mediaCapture.onSpeechEnd = () => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                if (this._nativeAudio) {
                    // Native-audio: model handles turn-taking via its own VAD.
                    // Don't lock input or stop streaming — just log it.
                    addLogEntry('User speech pause detected (native-audio: model handles turns)', 'info');
                    return;
                }
                this.mediaCapture.lockInput(1800);
                this.mediaCapture.beginAwaitingModelResponse(8000);
                this.ws.send(JSON.stringify({ type: 'turn_complete' }));
                addLogEntry('User turn complete detected', 'info');
                if (typeof showTypingIndicator === 'function') showTypingIndicator();
            }
        };

        this.mediaCapture.onVideoFrame = (base64Jpeg) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'video', data: base64Jpeg }));
                updateStat('video');
                addLogEntry(`Video frame sent (JPEG)`, 'video');
            }
        };

        this.mediaCapture.start().catch(err => {
            addLogEntry(`Media capture failed: ${err.message}`, 'interrupt');
            showToast('Camera/mic access denied — try localhost instead of 0.0.0.0', 'error', 8000);
        });
    }

    sendEnd() {
        this._isEnding = true;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'end' }));
        }
    }

    toggleMute() {
        return this.mediaCapture.toggleMute();
    }

    get isMuted() {
        return this.mediaCapture.isMuted;
    }

    _handleInterviewEnded(msg) {
        this._intentionalClose = true;
        this.mediaCapture.stop();
        this.audioPlayer.stop();
        if (this.ws) this.ws.close();
        if (this.onInterviewEnded) this.onInterviewEnded(msg);
    }

    disconnect() {
        this._intentionalClose = true;
        this.mediaCapture.stop();
        this.audioPlayer.stop();
        if (this.ws) this.ws.close();
    }
}
