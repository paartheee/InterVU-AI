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
        this._videoIntervalId = null;
        this._isMuted = false;
    }

    async start() {
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
            },
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 15 },
            },
        });

        this.videoElement = document.getElementById('local-video');
        this.videoElement.srcObject = this.stream;

        // Audio capture: Float32 -> Int16 PCM at 16kHz
        this.audioContext = new AudioContext({ sampleRate: 16000 });
        const source = this.audioContext.createMediaStreamSource(this.stream);

        this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.audioProcessor.onaudioprocess = (event) => {
            if (this._isMuted) return;

            const float32 = event.inputBuffer.getChannelData(0);
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

        // Video frame capture at ~1 FPS via canvas (768x768 JPEG)
        this.canvas.width = 768;
        this.canvas.height = 768;
        this._videoIntervalId = setInterval(() => {
            this.canvasCtx.drawImage(this.videoElement, 0, 0, 768, 768);
            const dataUrl = this.canvas.toDataURL('image/jpeg', 0.7);
            const base64 = dataUrl.split(',')[1];
            if (this.onVideoFrame) this.onVideoFrame(base64);
        }, 1000);
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
