// Random disconnected broken needle lines — slow motion, scattered across the page
(function () {
    const canvas = document.getElementById('needle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W, H;
    const needles = [];
    const NEEDLE_COUNT = 28;

    // Teal / Emerald color palette (no violet)
    const COLORS = [
        { r: 6, g: 182, b: 212 },   // cyan-500
        { r: 20, g: 184, b: 166 },   // teal-500
        { r: 16, g: 185, b: 129 },   // emerald-500
        { r: 8, g: 145, b: 178 },    // cyan-600
        { r: 13, g: 148, b: 136 },   // teal-600
        { r: 5, g: 150, b: 105 },    // emerald-600
    ];

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }

    function randomRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    // Create a single straight needle: random position, angle, and length
    function createNeedle() {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        const baseX = randomRange(0, W);
        const baseY = randomRange(-H * 0.1, H * 1.1);
        const length = randomRange(60, 180);
        const angle = randomRange(-Math.PI, Math.PI); // any direction

        // Build two endpoints (straight line)
        const points = [
            { x: 0, y: 0 },
            { x: Math.cos(angle) * length, y: Math.sin(angle) * length },
        ];
        const speed = randomRange(0.0003, 0.0012); // very slow
        const alpha = randomRange(0.08, 0.22);
        const lineWidth = randomRange(0.8, 1.6);
        const driftSpeedX = randomRange(-0.08, 0.08);
        const driftSpeedY = randomRange(0.02, 0.1);
        const phase = randomRange(0, Math.PI * 2);

        return {
            baseX, baseY, points, color, alpha, lineWidth,
            totalLen, speed, driftSpeedX, driftSpeedY, phase,
            progress: randomRange(0, 1), // start at random progress
            offsetX: 0, offsetY: 0,
        };
    }

    function init() {
        resize();
        needles.length = 0;
        for (let i = 0; i < NEEDLE_COUNT; i++) {
            needles.push(createNeedle());
        }
    }

    function drawNeedle(n, time) {
        // Slow drift movement
        const sway = Math.sin(time * 0.0004 + n.phase) * 15;
        const currentX = n.baseX + n.offsetX + sway;
        const currentY = n.baseY + n.offsetY;

        // Draw progress controls how much of the needle is visible (draw in, hold, draw out)
        const drawAmount = n.progress;
        // Use a sine curve for smooth fade in/out
        let visibleRatio, opacity;
        if (drawAmount < 0.3) {
            // Drawing in
            visibleRatio = drawAmount / 0.3;
            opacity = n.alpha * visibleRatio;
        } else if (drawAmount < 0.7) {
            // Fully visible
            visibleRatio = 1;
            opacity = n.alpha;
        } else {
            // Drawing out
            visibleRatio = 1 - (drawAmount - 0.7) / 0.3;
            opacity = n.alpha * visibleRatio;
        }

        if (opacity <= 0.005) return;

        ctx.save();
        ctx.translate(currentX, currentY);
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = `rgb(${n.color.r}, ${n.color.g}, ${n.color.b})`;
        ctx.lineWidth = n.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw partial path based on visibleRatio
        const totalSegs = n.points.length - 1;
        const segsToDraw = Math.ceil(totalSegs * visibleRatio);

        ctx.beginPath();
        ctx.moveTo(n.points[0].x, n.points[0].y);
        for (let i = 1; i <= segsToDraw; i++) {
            if (i === segsToDraw && visibleRatio < 1) {
                // Partial last segment
                const frac = (totalSegs * visibleRatio) - (segsToDraw - 1);
                const prev = n.points[i - 1];
                const curr = n.points[i];
                ctx.lineTo(
                    prev.x + (curr.x - prev.x) * frac,
                    prev.y + (curr.y - prev.y) * frac
                );
            } else {
                ctx.lineTo(n.points[i].x, n.points[i].y);
            }
        }
        ctx.stroke();
        ctx.restore();
    }

    function animate(time) {
        ctx.clearRect(0, 0, W, H);

        for (const n of needles) {
            n.progress += n.speed;
            n.offsetX += n.driftSpeedX;
            n.offsetY += n.driftSpeedY;

            // Reset when cycle complete or drifted off screen
            if (n.progress >= 1 || n.baseY + n.offsetY > H + 100) {
                Object.assign(n, createNeedle());
                n.progress = 0;
            }

            drawNeedle(n, time);
        }

        requestAnimationFrame(animate);
    }

    window.addEventListener('resize', () => {
        resize();
    });

    init();
    requestAnimationFrame(animate);
})();
