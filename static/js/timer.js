// Interview timer management

class InterviewTimer {
    constructor(durationMinutes, onTick, onTimeUp) {
        this.totalSeconds = durationMinutes * 60;
        this.onTick = onTick;
        this.onTimeUp = onTimeUp;
        this._intervalId = null;
        this._startTime = null;
    }

    start() {
        this._startTime = Date.now();
        this._intervalId = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
            const remaining = Math.max(0, this.totalSeconds - elapsed);
            const percentage = (elapsed / this.totalSeconds) * 100;

            if (this.onTick) {
                this.onTick({ remaining, elapsed, percentage: Math.min(100, percentage) });
            }

            if (remaining <= 0) {
                this.stop();
                if (this.onTimeUp) this.onTimeUp();
            }
        }, 1000);
    }

    stop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    }

    getElapsed() {
        if (!this._startTime) return 0;
        return Math.floor((Date.now() - this._startTime) / 1000);
    }
}

let activeTimer = null;

function initTimer(durationMinutes) {
    const timerEl = document.getElementById('interview-timer');
    const displayEl = document.getElementById('timer-display');
    const ringFill = document.getElementById('timer-ring-fill');

    if (!timerEl) return;
    timerEl.classList.remove('hidden');

    // SVG circle circumference: 2 * PI * r (r=34)
    const circumference = 2 * Math.PI * 34; // ~213.63

    activeTimer = new InterviewTimer(
        durationMinutes,
        ({ remaining, percentage }) => {
            displayEl.textContent = formatTime(remaining);
            // Ring depletes as time passes
            const offset = (percentage / 100) * circumference;
            ringFill.style.strokeDashoffset = offset;

            // Color changes
            if (remaining <= 30) {
                ringFill.classList.add('timer-critical');
                ringFill.classList.remove('timer-warning');
            } else if (remaining <= 120) {
                ringFill.classList.add('timer-warning');
                ringFill.classList.remove('timer-critical');
            } else {
                ringFill.classList.remove('timer-warning', 'timer-critical');
            }
        },
        () => {
            displayEl.textContent = '00:00';
            showToast('Time is up! Wrapping up the interview...', 'warning');
        }
    );
    activeTimer.start();
}

function stopTimer() {
    if (activeTimer) {
        activeTimer.stop();
        activeTimer = null;
    }
    const timerEl = document.getElementById('interview-timer');
    if (timerEl) timerEl.classList.add('hidden');
}

function updateTimerFromServer(remainingSeconds) {
    const displayEl = document.getElementById('timer-display');
    if (displayEl) {
        displayEl.textContent = formatTime(remainingSeconds);
    }
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
