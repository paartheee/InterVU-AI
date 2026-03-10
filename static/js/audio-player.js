class AudioPlayer {
    constructor() {
        this.audioContext = null;
        this.nextStartTime = 0;
        this.scheduledSources = [];
    }

    _ensureContext() {
        if (!this.audioContext || this.audioContext.state === 'closed') {
            // Gemini outputs 24kHz PCM
            this.audioContext = new AudioContext({ sampleRate: 24000 });
            this.nextStartTime = this.audioContext.currentTime;
        }
        // Resume suspended context (can happen when created without user gesture)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    enqueue(pcmBytes) {
        this._ensureContext();

        // Convert raw PCM bytes (Int16 little-endian) to Float32
        const int16 = new Int16Array(pcmBytes.buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }

        const audioBuffer = this.audioContext.createBuffer(1, float32.length, 24000);
        audioBuffer.getChannelData(0).set(float32);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        // Schedule gapless playback
        const now = this.audioContext.currentTime;
        if (this.nextStartTime < now) {
            this.nextStartTime = now;
        }
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;

        this.scheduledSources.push(source);

        // Clean up finished sources
        source.onended = () => {
            const idx = this.scheduledSources.indexOf(source);
            if (idx !== -1) this.scheduledSources.splice(idx, 1);
        };
    }

    clearBuffer() {
        // Stop all scheduled audio sources immediately (interrupt)
        for (const source of this.scheduledSources) {
            try { source.stop(); } catch (e) { /* already stopped */ }
        }
        this.scheduledSources = [];

        // Reset scheduling time but keep the AudioContext alive so future
        // audio chunks can play without needing a new user gesture.
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.nextStartTime = this.audioContext.currentTime;
        } else {
            this.nextStartTime = 0;
        }
    }

    stop() {
        this.clearBuffer();
    }
}
