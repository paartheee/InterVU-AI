// Real-time confidence meter and noise indicator

function updateConfidenceMeter(score) {
    const fill = document.getElementById('live-confidence-fill');
    const value = document.getElementById('live-confidence-value');
    if (!fill || !value) return;

    fill.style.width = `${score}%`;
    value.textContent = `${Math.round(score)}%`;

    // Color coding
    fill.classList.remove('meter-low', 'meter-mid', 'meter-high');
    if (score < 40) {
        fill.classList.add('meter-low');
    } else if (score < 70) {
        fill.classList.add('meter-mid');
    } else {
        fill.classList.add('meter-high');
    }
}

function updateNoiseIndicator(noiseDb) {
    const el = document.getElementById('noise-level');
    if (!el) return;

    el.classList.remove('noise-low', 'noise-med', 'noise-high');
    if (noiseDb < -40) {
        el.textContent = 'Low';
        el.classList.add('noise-low');
    } else if (noiseDb < -20) {
        el.textContent = 'Medium';
        el.classList.add('noise-med');
    } else {
        el.textContent = 'High';
        el.classList.add('noise-high');
    }
}

function computeNoiseLevel(rms, noiseFloor) {
    const db = 20 * Math.log10(Math.max(rms, 0.00001));
    return db;
}

function showConfidenceUI() {
    const meter = document.getElementById('confidence-meter-live');
    const noise = document.getElementById('noise-indicator');
    if (meter) meter.classList.remove('hidden');
    if (noise) noise.classList.remove('hidden');
}

function hideConfidenceUI() {
    const meter = document.getElementById('confidence-meter-live');
    const noise = document.getElementById('noise-indicator');
    if (meter) meter.classList.add('hidden');
    if (noise) noise.classList.add('hidden');
}
