// Screen sharing for coding/design interviews

let screenStream = null;
let screenCaptureInterval = null;

async function toggleScreenShare() {
    if (screenStream) {
        stopScreenShare();
        return;
    }
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: 1280, height: 720, frameRate: 0.5 }
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const video = document.createElement('video');
        video.srcObject = screenStream;
        await video.play();
        canvas.width = 1280;
        canvas.height = 720;

        // Capture and send frames every 5 seconds
        screenCaptureInterval = setInterval(() => {
            ctx.drawImage(video, 0, 0, 1280, 720);
            const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
            if (typeof interviewWS !== 'undefined' && interviewWS && interviewWS.ws &&
                interviewWS.ws.readyState === WebSocket.OPEN) {
                interviewWS.ws.send(JSON.stringify({
                    type: 'video',
                    data: base64,
                    source: 'screen',
                }));
                addLogEntry('Screen share frame sent', 'video');
            }
        }, 5000);

        document.getElementById('screen-share-btn').classList.add('active');
        showToast('Screen sharing started', 'success', 2000);

        // Handle when user stops sharing via browser UI
        screenStream.getVideoTracks()[0].onended = stopScreenShare;
    } catch (e) {
        showToast('Screen share cancelled or unavailable', 'warning');
    }
}

function stopScreenShare() {
    if (screenCaptureInterval) clearInterval(screenCaptureInterval);
    screenCaptureInterval = null;
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
    }
    const btn = document.getElementById('screen-share-btn');
    if (btn) btn.classList.remove('active');
    showToast('Screen sharing stopped', 'info', 2000);
}
