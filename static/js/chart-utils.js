// Lightweight canvas chart utilities

function drawLineChart(canvas, labels, values, options = {}) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const padding = options.padding || 50;
    const color = options.color || '#0d9488';

    ctx.clearRect(0, 0, W, H);

    if (values.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet', W / 2, H / 2);
        return;
    }

    const maxVal = Math.max(...values, 10);
    const minVal = Math.min(...values, 0);
    const range = maxVal - minVal || 1;

    const plotW = W - padding * 2;
    const plotH = H - padding * 2;

    // Grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(W - padding, y);
        ctx.stroke();

        // Y-axis labels
        const val = maxVal - (range * i) / 4;
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(val.toFixed(1), padding - 8, y + 4);
    }

    // Data line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const points = values.map((v, i) => ({
        x: padding + (plotW * i) / Math.max(values.length - 1, 1),
        y: padding + plotH - ((v - minVal) / range) * plotH,
    }));

    points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Data points
    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    });

    // X-axis labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    labels.forEach((label, i) => {
        if (labels.length <= 10 || i % Math.ceil(labels.length / 10) === 0) {
            const x = padding + (plotW * i) / Math.max(labels.length - 1, 1);
            ctx.fillText(label, x, H - 10);
        }
    });

    // Title
    if (options.title) {
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(options.title, W / 2, 20);
    }
}

function drawBarChart(canvas, labels, values, options = {}) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const padding = options.padding || 50;
    const colors = options.colors || ['#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4'];

    ctx.clearRect(0, 0, W, H);

    if (values.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet', W / 2, H / 2);
        return;
    }

    const maxVal = Math.max(...values, 1);
    const plotW = W - padding * 2;
    const plotH = H - padding * 2;
    const barWidth = plotW / values.length * 0.7;
    const gap = plotW / values.length * 0.3;

    values.forEach((v, i) => {
        const barH = (v / maxVal) * plotH;
        const x = padding + (plotW * i) / values.length + gap / 2;
        const y = padding + plotH - barH;

        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(x, y, barWidth, barH);

        // Value on top
        ctx.fillStyle = '#334155';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(v.toFixed(1), x + barWidth / 2, y - 6);

        // Label below
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.save();
        ctx.translate(x + barWidth / 2, H - 5);
        ctx.rotate(-0.3);
        ctx.fillText(labels[i].substring(0, 12), 0, 0);
        ctx.restore();
    });

    if (options.title) {
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(options.title, W / 2, 20);
    }
}
