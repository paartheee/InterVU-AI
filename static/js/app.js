// Global application state
const appState = {
    currentSection: 'jd',
    systemPrompt: null,
    extractedSkills: null,
    sessionId: null,
    interviewConfig: null,
    interviewDbId: null,
    shareToken: null,
    candidateId: typeof getCandidateId === 'function' ? getCandidateId() : null,
};

let interviewWS = null;

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
        requestAnimationFrame(() => {
            app.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            app.style.opacity = '1';
            app.style.transform = 'translateY(0)';
        });
        window.scrollTo(0, 0);

        // Show app nav
        const nav = document.getElementById('app-nav');
        if (nav) nav.classList.remove('hidden');

        // Prefill resume from profile
        if (typeof prefillResumeFromProfile === 'function') {
            prefillResumeFromProfile();
        }
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

    // Initialize candidate ID
    if (typeof getCandidateId === 'function') {
        appState.candidateId = getCandidateId();
    }
});

// ---- App section management ----

function showSection(name) {
    document.querySelectorAll('#app-page main > section').forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    const section = document.getElementById(`${name}-section`);
    if (section) {
        section.classList.remove('hidden');
        section.classList.add('active');
    }
    appState.currentSection = name;

    // Update nav active state
    document.querySelectorAll('#app-nav button').forEach(btn => {
        btn.classList.remove('nav-active');
        if (btn.dataset.nav === name) btn.classList.add('nav-active');
    });

    // Lazy load data for sections
    if (name === 'history' && typeof loadHistory === 'function') {
        loadHistory();
    } else if (name === 'analytics' && typeof loadAnalytics === 'function') {
        loadAnalytics();
    } else if (name === 'profile' && typeof loadProfile === 'function') {
        loadProfile();
    }
}

async function startInterview() {
    if (!appState.systemPrompt) {
        showToast('Please analyze a job description first.', 'warning');
        return;
    }

    const config = typeof getInterviewConfig === 'function' ? getInterviewConfig() : {};
    appState.interviewConfig = config;

    showSection('interview');
    resetLogPanel();
    addLogEntry('Initializing interview session...', 'info');

    // Start timer
    if (typeof initTimer === 'function') {
        initTimer(config.duration_minutes || 30);
    }

    // Show confidence UI
    if (typeof showConfidenceUI === 'function') {
        showConfidenceUI();
    }

    interviewWS = new InterviewWebSocket();

    interviewWS.onSessionStarted = (sessionId) => {
        appState.sessionId = sessionId;
        const indicator = document.getElementById('status-indicator');
        indicator.textContent = 'Interview Active';
        indicator.className = 'active';
        showToast('Interview started — Wayne is ready', 'success');
        addLogEntry('Gemini Live session active — streaming media', 'info');

        // Track event
        if (typeof API !== 'undefined') {
            API.trackEvent('interview_started', {
                session_id: sessionId,
                interview_type: config.interview_type,
            });
        }
    };

    interviewWS.onInterviewEnded = (msg) => {
        if (typeof stopTimer === 'function') stopTimer();
        if (typeof stopRecording === 'function') stopRecording();
        if (typeof stopScreenShare === 'function') stopScreenShare();
        if (typeof hideConfidenceUI === 'function') hideConfidenceUI();

        showToast('Interview complete — generating report...', 'info');
        fetchAndDisplayReport(
            msg.session_id,
            msg.summary,
            JSON.stringify(appState.extractedSkills)
        );
    };

    interviewWS.onError = (errMsg) => {
        const indicator = document.getElementById('status-indicator');
        indicator.textContent = 'Error';
        indicator.className = 'error';
    };

    interviewWS.connect(appState.systemPrompt, {
        interview_db_id: appState.interviewDbId,
        duration_minutes: config.duration_minutes || 30,
    });
}

function endInterview() {
    if (interviewWS) {
        const indicator = document.getElementById('status-indicator');
        indicator.textContent = 'Ending interview...';
        document.getElementById('end-btn').disabled = true;
        addLogEntry('User clicked End Interview — requesting summary from Gemini', 'info');
        interviewWS.sendEnd();
    }
}

function toggleMic() {
    if (!interviewWS) return;

    const isMuted = interviewWS.toggleMute();
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

// ---- Print to PDF ----

function printReport() {
    window.print();
}

function downloadCoachingPlan() {
    const planEl = document.querySelector('.coaching-plan');
    if (!planEl) {
        showToast('No coaching plan available', 'warning');
        return;
    }
    const text = planEl.innerText;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coaching-plan-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

function showTranscriptView(sessionId) {
    if (typeof loadTranscriptView === 'function') {
        showSection('history');
        // Find the interview by session ID and load it
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
