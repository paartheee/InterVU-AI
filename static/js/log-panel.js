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

    // Reset conversation feed
    const feed = document.getElementById('conversation-feed');
    if (feed) feed.innerHTML = '<div class="conv-status">Waiting for Wayne to start...</div>';
}

// ---- Live Conversation Panel ----

let _currentWayneBubble = null;

function addConversationBubble(speaker, text) {
    text = text.replace(/\*\*/g, '');
    const feed = document.getElementById('conversation-feed');
    if (!feed) return;

    // Remove the initial status message
    const status = feed.querySelector('.conv-status');
    if (status) status.remove();

    // Remove any typing indicator
    const typing = feed.querySelector('.conv-typing');
    if (typing) typing.remove();

    if (speaker === 'wayne') {
        // Accumulate Wayne text into current bubble, or create new one
        if (_currentWayneBubble && _currentWayneBubble.dataset.active === 'true') {
            _currentWayneBubble.querySelector('.conv-text').textContent += ' ' + text;
        } else {
            const bubble = document.createElement('div');
            bubble.className = 'conv-bubble wayne';
            bubble.dataset.active = 'true';
            bubble.innerHTML = '<span class="conv-speaker">Wayne</span><span class="conv-text"></span>';
            bubble.querySelector('.conv-text').textContent = text;
            feed.appendChild(bubble);
            _currentWayneBubble = bubble;
        }
    } else {
        // Finalize any active Wayne bubble
        if (_currentWayneBubble) {
            _currentWayneBubble.dataset.active = 'false';
            _currentWayneBubble = null;
        }

        const bubble = document.createElement('div');
        bubble.className = 'conv-bubble user';
        bubble.innerHTML = '<span class="conv-speaker">You</span><span class="conv-text"></span>';
        bubble.querySelector('.conv-text').textContent = text;
        feed.appendChild(bubble);
    }

    // Auto-scroll
    feed.scrollTop = feed.scrollHeight;

    // Trim old bubbles (keep last 50)
    while (feed.children.length > 50) {
        feed.removeChild(feed.firstChild);
    }
}

function showTypingIndicator() {
    const feed = document.getElementById('conversation-feed');
    if (!feed || feed.querySelector('.conv-typing')) return;

    const dots = document.createElement('div');
    dots.className = 'conv-typing';
    dots.innerHTML = '<span></span><span></span><span></span>';
    feed.appendChild(dots);
    feed.scrollTop = feed.scrollHeight;
}

function finalizeWayneBubble() {
    if (_currentWayneBubble) {
        _currentWayneBubble.dataset.active = 'false';
        _currentWayneBubble = null;
    }
}
