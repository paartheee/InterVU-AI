class LiveKitInterviewClient {
    constructor() {
        this.room = null;
        this.onConnected = null;
        this.onAgentJoined = null;
        this.onAgentSpeaking = null;
        this.onInterviewEnded = null;
        this.onError = null;
        this.onDisconnected = null;
        this._isMuted = false;
        this._audioElements = [];
    }

    async connect(serverUrl, token) {
        this.room = new LivekitClient.Room({
            adaptiveStream: true,
            dynacast: true,
        });

        // Handle remote tracks (agent audio)
        this.room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === LivekitClient.Track.Kind.Audio) {
                const element = track.attach();
                element.style.display = 'none';
                document.body.appendChild(element);
                this._audioElements.push(element);
                addLogEntry('Agent audio track attached', 'ai');
            }
        });

        this.room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
            const detached = track.detach();
            detached.forEach(el => {
                el.remove();
                const idx = this._audioElements.indexOf(el);
                if (idx >= 0) this._audioElements.splice(idx, 1);
            });
        });

        // Detect when agent joins
        this.room.on(LivekitClient.RoomEvent.ParticipantConnected, (participant) => {
            addLogEntry(`Participant joined: ${participant.identity}`, 'info');
            if (this.onAgentJoined) this.onAgentJoined(participant);
        });

        // Audio playback handling
        this.room.on(LivekitClient.RoomEvent.AudioPlaybackStatusChanged, () => {
            if (!this.room.canPlaybackAudio) {
                this.room.startAudio();
            }
        });

        // Active speaker changes
        this.room.on(LivekitClient.RoomEvent.ActiveSpeakersChanged, (speakers) => {
            const agentSpeaking = speakers.some(
                s => s.identity !== this.room.localParticipant.identity
            );
            if (this.onAgentSpeaking) this.onAgentSpeaking(agentSpeaking);
            if (agentSpeaking) {
                updateStat('responses');
            }
        });

        // Disconnection
        this.room.on(LivekitClient.RoomEvent.Disconnected, (reason) => {
            addLogEntry(`Disconnected from room: ${reason || 'unknown'}`, 'info');
            if (this.onDisconnected) this.onDisconnected();
        });

        // Register handler for interview results from agent
        this.room.registerTextStreamHandler('interview-result', async (reader, participantIdentity) => {
            let text = '';
            for await (const chunk of reader) {
                text += chunk;
            }
            try {
                const data = JSON.parse(text);
                if (data.type === 'interview_ended' && this.onInterviewEnded) {
                    this.onInterviewEnded(data);
                }
            } catch (err) {
                addLogEntry(`Error parsing interview result: ${err.message}`, 'interrupt');
            }
        });

        try {
            await this.room.connect(serverUrl, token);
            addLogEntry(`Connected to room: ${this.room.name}`, 'info');

            // Publish camera and microphone
            await this.room.localParticipant.enableCameraAndMicrophone();
            addLogEntry('Camera and microphone enabled', 'info');

            // Attach local video to preview element
            const videoTrack = this.room.localParticipant.getTrackPublication(
                LivekitClient.Track.Source.Camera
            );
            if (videoTrack && videoTrack.track) {
                const videoElement = document.getElementById('local-video');
                if (videoElement) {
                    videoTrack.track.attach(videoElement);
                }
            }

            if (this.onConnected) this.onConnected(this.room.name);
        } catch (err) {
            addLogEntry(`Connection error: ${err.message}`, 'interrupt');
            if (this.onError) this.onError(err.message);
        }
    }

    async sendEndInterview() {
        if (!this.room) return;
        try {
            const writer = await this.room.localParticipant.streamText({
                topic: 'interview-control',
            });
            await writer.write(JSON.stringify({ type: 'end_interview' }));
            await writer.close();
            addLogEntry('End interview signal sent', 'info');
        } catch (err) {
            addLogEntry(`Error sending end signal: ${err.message}`, 'interrupt');
        }
    }

    toggleMute() {
        if (!this.room) return false;
        this._isMuted = !this._isMuted;
        this.room.localParticipant.setMicrophoneEnabled(!this._isMuted);
        return this._isMuted;
    }

    get isMuted() {
        return this._isMuted;
    }

    disconnect() {
        if (this.room) {
            this.room.disconnect();
            this.room = null;
        }
        // Clean up audio elements
        this._audioElements.forEach(el => el.remove());
        this._audioElements = [];
    }
}
