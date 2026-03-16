// Live processing log panel
const logStats = {
    audio: 0,
    video: 0,
    responses: 0,
};

function addLogEntry(message, type = 'info') {
    const container = document.getElementById('log-content');
    if (!container) return;

    const now = new Date();
    const ts = now.toLocaleTimeString('en-US', { hour12: false }) +
        '.' + String(now.getMilliseconds()).padStart(3, '0');

    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${ts}] ${message}`;
    container.appendChild(entry);

    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;

    // Trim old entries (keep last 100)
    while (container.children.length > 100) {
        container.removeChild(container.firstChild);
    }
}

function updateStat(key) {
    logStats[key]++;
    const el = document.getElementById(`stat-${key}`);
    if (el) el.textContent = logStats[key];
}

function resetLogPanel() {
    logStats.audio = 0;
    logStats.video = 0;
    logStats.responses = 0;

    const container = document.getElementById('log-content');
    if (container) container.innerHTML = '<div class="log-entry log-info">Waiting for connection...</div>';

    ['audio', 'video', 'responses'].forEach(key => {
        const el = document.getElementById(`stat-${key}`);
        if (el) el.textContent = '0';
    });

}
