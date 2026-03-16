// Session recording using MediaRecorder API

let mediaRecorder = null;
let recordedChunks = [];

function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
        return;
    }
    startRecording();
}

function startRecording() {
    const video = document.getElementById('local-video');
    const stream = video ? video.srcObject : null;
    if (!stream) {
        showToast('No media stream to record', 'warning');
        return;
    }

    try {
        // Try different mime types for browser compatibility
        const mimeTypes = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
        ];
        let mimeType = '';
        for (const mt of mimeTypes) {
            if (MediaRecorder.isTypeSupported(mt)) {
                mimeType = mt;
                break;
            }
        }

        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        recordedChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            showToast('Recording saved. Click download to save.', 'success');
        };

        mediaRecorder.start(1000); // 1-second chunks
        document.getElementById('record-btn').classList.add('recording');
        showToast('Recording started', 'info', 2000);
        addLogEntry('Session recording started', 'info');
    } catch (e) {
        showToast('Recording not supported in this browser', 'error');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    const btn = document.getElementById('record-btn');
    if (btn) btn.classList.remove('recording');
    addLogEntry('Session recording stopped', 'info');
}

function getRecordingBlob() {
    if (recordedChunks.length === 0) return null;
    return new Blob(recordedChunks, { type: 'video/webm' });
}

function downloadRecording() {
    const blob = getRecordingBlob();
    if (!blob) {
        showToast('No recording to download', 'warning');
        return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-recording-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
}
