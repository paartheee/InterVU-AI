class MediaCapture {
    constructor() {
        this.stream = null;
        this.audioContext = null;
        this.audioProcessor = null;
        this.videoElement = null;
        this.canvas = document.createElement('canvas');
        this.canvasCtx = this.canvas.getContext('2d');
        this.onAudioChunk = null;
        this.onVideoFrame = null;
        this.onSpeechEnd = null;
        this._videoIntervalId = null;
        this._isMuted = false;
        this._modelSpeaking = false;     // true while AI is outputting audio
        this._echoCooldownUntil = 0;     // timestamp: suppress mic until this time
        this._inputLockUntil = 0;        // timestamp: pause mic forwarding temporarily
        this._awaitingModelResponse = false;
        this._awaitingModelDeadline = 0;
        this._isUserSpeaking = false;
        this._lastVoiceAt = 0;
        this._noiseFloor = 0.0;
    }

    /** Call when AI starts sending audio */
    setModelSpeaking(speaking) {
        this._modelSpeaking = speaking;
        if (speaking) {
            this._inputLockUntil = 0;
            this._awaitingModelResponse = false;
            this._awaitingModelDeadline = 0;
            this._isUserSpeaking = false;
            return;
        }
        // After model stops, add 500ms cooldown for echo to fade
        this._echoCooldownUntil = performance.now() + 500;
    }

    lockInput(ms = 1500) {
        this._inputLockUntil = performance.now() + ms;
        this._isUserSpeaking = false;
    }

    beginAwaitingModelResponse(timeoutMs = 8000) {
        this._awaitingModelResponse = true;
        this._awaitingModelDeadline = performance.now() + timeoutMs;
        this._isUserSpeaking = false;
    }

    async start() {
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
            video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
                frameRate: { ideal: 1 },
            },
        });

        this.videoElement = document.getElementById('local-video');
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.srcObject = this.stream;

        // Audio capture: Float32 -> Int16 PCM at 16kHz
        this.audioContext = new AudioContext({ sampleRate: 16000 });
        const source = this.audioContext.createMediaStreamSource(this.stream);

        // Voice activity detection tuned for noisy rooms
        const BASE_RMS_THRESHOLD = 0.012;
        const NOISE_MULTIPLIER = 3.0;
        const SPEECH_HANGOVER_MS = 250;
        const SPEECH_RELEASE_MS = 900;

        this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.audioProcessor.onaudioprocess = (event) => {
            if (this._isMuted) return;

            // Suppress mic while AI is speaking to prevent echo feedback
            if (this._modelSpeaking) return;
            if (performance.now() < this._echoCooldownUntil) return;
            if (performance.now() < this._inputLockUntil) return;

            if (this._awaitingModelResponse) {
                if (performance.now() < this._awaitingModelDeadline) {
                    return;
                }
                this._awaitingModelResponse = false;
                this._awaitingModelDeadline = 0;
            }

            const float32 = event.inputBuffer.getChannelData(0);

            // Calculate RMS energy
            let sumSq = 0;
            for (let i = 0; i < float32.length; i++) {
                sumSq += float32[i] * float32[i];
            }
            const rms = Math.sqrt(sumSq / float32.length);
            const now = performance.now();

            // Adapt noise floor only while user is not speaking and signal is low
            if (!this._isUserSpeaking && rms < 0.03) {
                if (this._noiseFloor === 0) {
                    this._noiseFloor = rms;
                } else {
                    this._noiseFloor = this._noiseFloor * 0.95 + rms * 0.05;
                }
            }

            // Emit noise level for the indicator
            if (typeof computeNoiseLevel === 'function') {
                const noiseDb = computeNoiseLevel(rms, this._noiseFloor);
                updateNoiseIndicator(noiseDb);
            }

            const dynamicThreshold = Math.max(
                BASE_RMS_THRESHOLD,
                this._noiseFloor * NOISE_MULTIPLIER
            );
            const voiceDetected = rms >= dynamicThreshold;

            if (voiceDetected) {
                this._lastVoiceAt = now;
                if (!this._isUserSpeaking) {
                    this._isUserSpeaking = true;
                }
            }

            const withinHangover = this._isUserSpeaking
                && (now - this._lastVoiceAt) <= SPEECH_HANGOVER_MS;

            if (!voiceDetected && !withinHangover) {
                if (
                    this._isUserSpeaking
                    && (now - this._lastVoiceAt) >= SPEECH_RELEASE_MS
                ) {
                    this._isUserSpeaking = false;
                    if (this.onSpeechEnd) this.onSpeechEnd();
                }
                return;
            }

            const int16 = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
                int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
            }
            const bytes = new Uint8Array(int16.buffer);
            const base64 = arrayBufferToBase64(bytes);
            if (this.onAudioChunk) this.onAudioChunk(base64);
        };
        source.connect(this.audioProcessor);
        this.audioProcessor.connect(this.audioContext.destination);

        // Video frame capture at 1 frame per 10 seconds (512x512 JPEG)
        this.canvas.width = 512;
        this.canvas.height = 512;
        this._videoIntervalId = setInterval(() => {
            this.canvasCtx.drawImage(this.videoElement, 0, 0, 512, 512);
            const dataUrl = this.canvas.toDataURL('image/jpeg', 0.5);
            const base64 = dataUrl.split(',')[1];
            if (this.onVideoFrame) this.onVideoFrame(base64);
        }, 10000);
    }

    toggleMute() {
        this._isMuted = !this._isMuted;
        // Also mute the actual audio track for visual feedback
        if (this.stream) {
            const audioTracks = this.stream.getAudioTracks();
            audioTracks.forEach(track => { track.enabled = !this._isMuted; });
        }
        return this._isMuted;
    }

    get isMuted() {
        return this._isMuted;
    }

    stop() {
        if (this._videoIntervalId) {
            clearInterval(this._videoIntervalId);
            this._videoIntervalId = null;
        }
        if (this.audioProcessor) {
            this.audioProcessor.disconnect();
            this.audioProcessor = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        this._isUserSpeaking = false;
        this._lastVoiceAt = 0;
        this._noiseFloor = 0.0;
        this._inputLockUntil = 0;
        this._awaitingModelResponse = false;
        this._awaitingModelDeadline = 0;
    }
}

// Efficient base64 encoding for Uint8Array
function arrayBufferToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
