// Global application state
const appState = {
    currentSection: 'jd',
    systemPrompt: null,
    extractedSkills: null,
    sessionId: null,
};

let interviewClient = null;

// ---- Landing / App page transition ----

function enterApp() {
    const landing = document.getElementById('landing-page');
    const app = document.getElementById('app-page');

    landing.classList.add('fade-out');
    setTimeout(() => {
        landing.style.display = 'none';
        app.classList.remove('hidden');
        app.style.opacity = '0';
        app.style.transform = 'translateY(20px)';
        // Trigger reflow then animate in
        requestAnimationFrame(() => {
            app.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            app.style.opacity = '1';
            app.style.transform = 'translateY(0)';
        });
        window.scrollTo(0, 0);
    }, 400);
}

function backToLanding() {
    const landing = document.getElementById('landing-page');
    const app = document.getElementById('app-page');

    app.style.opacity = '0';
    app.style.transform = 'translateY(20px)';
    setTimeout(() => {
        app.classList.add('hidden');
        landing.style.display = '';
        landing.classList.remove('fade-out');
        window.scrollTo(0, 0);
    }, 400);
}

// ---- Scroll reveal for landing page elements ----

function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.feature-card, .step-card, .persona-grid').forEach(el => {
        observer.observe(el);
    });
}

// ---- Smooth scroll for nav links ----

function initSmoothScroll() {
    document.querySelectorAll('.nav-links a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

// Initialize landing page features on load
document.addEventListener('DOMContentLoaded', () => {
    initScrollReveal();
    initSmoothScroll();
});

// ---- App section management ----

function showSection(name) {
    document.querySelectorAll('#app-page section').forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    const section = document.getElementById(`${name}-section`);
    section.classList.remove('hidden');
    section.classList.add('active');
    appState.currentSection = name;
}

async function startInterview() {
    if (!appState.systemPrompt) {
        showToast('Please analyze a job description first.', 'warning');
        return;
    }

    showSection('interview');
    resetLogPanel();
    addLogEntry('Requesting LiveKit token...', 'info');

    try {
        // Request token from FastAPI
        const tokenResp = await fetch('/api/livekit-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_prompt: appState.systemPrompt,
                skills_json: JSON.stringify(appState.extractedSkills),
            }),
        });

        if (!tokenResp.ok) {
            const err = await tokenResp.json();
            throw new Error(err.detail || `HTTP ${tokenResp.status}`);
        }

        const { server_url, participant_token, room_name } = await tokenResp.json();
        appState.sessionId = room_name;
        addLogEntry(`Token received for room: ${room_name}`, 'info');

        // Connect via LiveKit
        interviewClient = new LiveKitInterviewClient();

        interviewClient.onConnected = (roomName) => {
            addLogEntry(`Connected to LiveKit room: ${roomName}`, 'info');
            const indicator = document.getElementById('status-indicator');
            indicator.textContent = 'Waiting for Wayne...';
            indicator.className = '';
        };

        interviewClient.onAgentJoined = (participant) => {
            const indicator = document.getElementById('status-indicator');
            indicator.textContent = 'Interview Active';
            indicator.className = 'active';
            showToast('Wayne has joined — interview starting', 'success');
            addLogEntry('Agent (Wayne) joined the room', 'info');
        };

        interviewClient.onInterviewEnded = (data) => {
            showToast('Interview complete — generating report...', 'info');
            addLogEntry('Interview ended — generating report', 'info');
            interviewClient.disconnect();
            fetchAndDisplayReport(
                appState.sessionId,
                data.summary,
                data.skills_json || JSON.stringify(appState.extractedSkills)
            );
        };

        interviewClient.onError = (errMsg) => {
            const indicator = document.getElementById('status-indicator');
            indicator.textContent = 'Error';
            indicator.className = 'error';
            showToast('Error: ' + errMsg, 'error');
        };

        interviewClient.onDisconnected = () => {
            const indicator = document.getElementById('status-indicator');
            if (indicator.textContent !== 'Ending interview...') {
                indicator.textContent = 'Disconnected';
                indicator.className = 'error';
            }
        };

        await interviewClient.connect(server_url, participant_token);

    } catch (err) {
        showToast('Failed to start interview: ' + err.message, 'error');
        addLogEntry(`Error: ${err.message}`, 'interrupt');
    }
}

function endInterview() {
    if (interviewClient) {
        const indicator = document.getElementById('status-indicator');
        indicator.textContent = 'Ending interview...';
        document.getElementById('end-btn').disabled = true;
        addLogEntry('User clicked End Interview', 'info');
        interviewClient.sendEndInterview();
    }
}

function toggleMic() {
    if (!interviewClient) return;

    const isMuted = interviewClient.toggleMute();
    const btn = document.getElementById('mic-btn');
    const icon = document.getElementById('mic-icon');
    const label = document.getElementById('mic-label');

    if (isMuted) {
        btn.classList.add('muted');
        icon.textContent = '\u{1F507}';
        label.textContent = 'Unmute';
        showToast('Microphone muted', 'info', 2000);
        addLogEntry('Microphone MUTED by user', 'interrupt');
    } else {
        btn.classList.remove('muted');
        icon.textContent = '\u{1F3A4}';
        label.textContent = 'Mute';
        showToast('Microphone unmuted', 'success', 2000);
        addLogEntry('Microphone UNMUTED by user', 'info');
    }
}

// ---- Wayne Rotating Quotes ----
(function initWayneQuotes() {
    const quotes = [
        '\u201CBe specific \u2014 what was the measurable impact?\u201D',
        '\u201CYou\u2019re rushing. Slow down.\u201D',
        '\u201CGive the technical tradeoff.\u201D',
        '\u201CThat\u2019s vague. Name the actual metric.\u201D',
        '\u201CStop rambling. Answer the question I asked.\u201D',
    ];
    const el = document.getElementById('wayne-quote');
    if (!el) return;
    const textEl = el.querySelector('.quote-text');
    if (!textEl) return;
    let idx = 0;
    setInterval(() => {
        textEl.classList.add('fade-out');
        setTimeout(() => {
            idx = (idx + 1) % quotes.length;
            textEl.innerHTML = quotes[idx];
            textEl.classList.remove('fade-out');
        }, 500);
    }, 4000);
})();
