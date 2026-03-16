// Shareable report links

(function checkShareLink() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('share');
    if (token) {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => loadSharedReport(token));
        } else {
            loadSharedReport(token);
        }
    }
})();

async function loadSharedReport(token) {
    try {
        const data = await API.getSharedReport(token);

        // Hide landing, show app with report
        const landing = document.getElementById('landing-page');
        const app = document.getElementById('app-page');
        if (landing) landing.style.display = 'none';
        if (app) app.classList.remove('hidden');

        showSection('report');
        renderSharedReport(data);
    } catch (e) {
        showToast('Report not found or link expired', 'error');
    }
}

function renderSharedReport(data) {
    const container = document.getElementById('report-content');
    const r = data.report;
    const i = data.interview;

    let html = `<div class="report-card">
        <div class="shared-badge">Shared Report</div>
        <h3>${i ? i.job_title : 'Interview'} - Report</h3>`;

    if (i) {
        html += `<p><strong>Type:</strong> ${i.interview_type} | <strong>Difficulty:</strong> ${i.difficulty_level}</p>`;
    }

    html += `
        <p class="score">Overall Score: <strong>${r.overall_score}/10</strong></p>
        <h4>Summary</h4>
        <p>${r.transcript_summary}</p>
        <h4>Strengths</h4>
        <ul>${(r.strengths || []).map(s => '<li>' + s + '</li>').join('')}</ul>
        <h4>Areas for Improvement</h4>
        <ul>${(r.areas_for_improvement || []).map(s => '<li>' + s + '</li>').join('')}</ul>
        <h4>Body Language</h4>
        <p><strong>Eye Contact:</strong> ${r.eye_contact_notes}</p>
        <p><strong>Posture:</strong> ${r.posture_notes}</p>
        <h4>Communication</h4>
        <p>${r.communication_notes}</p>
    `;

    if (data.skill_scores && data.skill_scores.length > 0) {
        html += '<h4>Skill Breakdown</h4><div class="skill-scores">';
        data.skill_scores.forEach(s => {
            html += `
                <div class="skill-score-item">
                    <span class="skill-name">${s.skill_name}</span>
                    <div class="skill-bar"><div class="skill-fill" style="width:${s.score * 10}%"></div></div>
                    <span class="skill-value">${s.score}/10</span>
                </div>
            `;
        });
        html += '</div>';
    }

    html += `
        <div class="report-actions">
            ${r.coaching_plan ? '<button class="btn-coaching" onclick="openCoachingPlan()">View Coaching Plan</button>' : ''}
        </div>
    </div>`;

    // Coaching plan modal
    if (r.coaching_plan) {
        html += `
        <div id="coaching-modal" class="coaching-modal hidden">
            <div class="coaching-modal-backdrop" onclick="closeCoachingPlan()"></div>
            <div class="coaching-modal-content">
                <div class="coaching-modal-header">
                    <h3>Coaching Plan</h3>
                    <div class="coaching-modal-actions">
                        <button onclick="downloadCoachingPlan()" title="Download">Download</button>
                        <button onclick="closeCoachingPlan()" title="Close">Close</button>
                    </div>
                </div>
                <div class="coaching-plan">${r.coaching_plan.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
            </div>
        </div>`;
    }

    container.innerHTML = html;
}

function copyShareLink() {
    const token = appState.shareToken;
    if (!token) {
        showToast('No share link available', 'warning');
        return;
    }
    const url = `${window.location.origin}?share=${token}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Share link copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback
        prompt('Copy this link:', url);
    });
}
