// Analytics dashboard

async function loadAnalytics() {
    try {
        const summary = await API.getAnalyticsSummary(getCandidateId());
        renderAnalyticsCards(summary);
        renderScoreTrendChart(summary.score_trend);
        renderSkillBreakdownChart(summary.top_skills, summary.weakest_skills);
    } catch (e) {
        console.error('Analytics load failed:', e);
    }
}

function renderAnalyticsCards(summary) {
    const totalEl = document.getElementById('stat-total-interviews');
    const avgEl = document.getElementById('stat-avg-score');
    const completionEl = document.getElementById('stat-completion-rate');

    if (totalEl) {
        totalEl.innerHTML = `
            <div class="analytics-stat-value">${summary.total_interviews}</div>
            <div class="analytics-stat-label">Total Interviews</div>
        `;
    }
    if (avgEl) {
        avgEl.innerHTML = `
            <div class="analytics-stat-value">${summary.average_score}/10</div>
            <div class="analytics-stat-label">Average Score</div>
        `;
    }
    if (completionEl) {
        const rate = summary.total_interviews > 0
            ? Math.round((summary.completed_interviews / summary.total_interviews) * 100)
            : 0;
        completionEl.innerHTML = `
            <div class="analytics-stat-value">${rate}%</div>
            <div class="analytics-stat-label">Completion Rate</div>
        `;
    }

    // Interview type breakdown
    const typeEl = document.getElementById('stat-by-type');
    if (typeEl && summary.interviews_by_type) {
        typeEl.innerHTML = Object.entries(summary.interviews_by_type)
            .map(([type, count]) => `<span class="tag">${type}: ${count}</span>`)
            .join(' ');
    }
}

function renderScoreTrendChart(trendData) {
    const canvas = document.getElementById('score-trend-chart');
    if (!canvas || !trendData) return;

    const labels = trendData.map(d => d.date ? new Date(d.date).toLocaleDateString() : '');
    const values = trendData.map(d => d.score);

    drawLineChart(canvas, labels, values, {
        title: 'Score Trend Over Time',
        color: '#0d9488',
    });
}

function renderSkillBreakdownChart(topSkills, weakSkills) {
    const canvas = document.getElementById('skill-breakdown-chart');
    if (!canvas) return;

    const allSkills = [...(topSkills || []), ...(weakSkills || [])];
    // Deduplicate
    const seen = new Set();
    const unique = allSkills.filter(s => {
        if (seen.has(s.skill)) return false;
        seen.add(s.skill);
        return true;
    });

    const labels = unique.map(s => s.skill);
    const values = unique.map(s => s.avg_score);

    drawBarChart(canvas, labels, values, {
        title: 'Skill Performance',
    });
}
