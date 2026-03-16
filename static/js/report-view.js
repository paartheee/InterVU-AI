async function fetchAndDisplayReport(sessionId, summaryText, skillsJson) {
    showSection('report');
    const container = document.getElementById('report-content');
    container.innerHTML = `
        <div class="report-loading">
            <div class="report-spinner"></div>
            <h3>Interview Report</h3>
            <p>Generating your interview report...</p>
        </div>
    `;

    try {
        const response = await fetch('/api/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                summary_text: summaryText,
                skills_json: skillsJson,
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const r = data.report;

        // Store share token
        if (data.share_token) {
            appState.shareToken = data.share_token;
        }

        const scoreLevel = r.overall_score >= 7 ? 'good' : r.overall_score >= 5 ? 'warn' : 'critical';

        let html = `
            <div class="report-card" id="printable-report">
                <h3>${r.job_title} - Interview Report</h3>
                <p class="score score-level-${scoreLevel}">Overall Score: <strong>${r.overall_score}/10</strong></p>

                <h4>Summary</h4>
                <p>${r.transcript_summary}</p>

                <h4>Strengths</h4>
                <ul>${r.strengths.map(s => '<li>' + s + '</li>').join('')}</ul>

                <h4>Areas for Improvement</h4>
                <ul>${r.areas_for_improvement.map(s => '<li>' + s + '</li>').join('')}</ul>

                <h4>Body Language</h4>
                <p><strong>Eye Contact:</strong> ${r.eye_contact_notes}</p>
                <p><strong>Posture:</strong> ${r.posture_notes}</p>

                <h4>Communication</h4>
                <p>${r.communication_notes}</p>
        `;

        // Skill-by-skill breakdown
        if (data.skill_scores && data.skill_scores.length > 0) {
            html += '<h4>Skill-by-Skill Breakdown</h4><div class="skill-scores">';
            data.skill_scores.forEach(s => {
                const scoreClass = s.score >= 7 ? 'score-high' : s.score >= 5 ? 'score-mid' : 'score-low';
                const itemClass = s.score >= 7 ? 'score-high-item' : s.score >= 5 ? 'score-mid-item' : 'score-low-item';
                html += `
                    <div class="skill-score-item ${itemClass}">
                        <span class="skill-name">${s.skill_name}</span>
                        <div class="skill-bar">
                            <div class="skill-fill ${scoreClass}" style="width:${s.score * 10}%"></div>
                        </div>
                        <span class="skill-value">${s.score}/10</span>
                        ${s.notes ? `<p class="skill-notes">${s.notes}</p>` : ''}
                    </div>
                `;
            });
            html += '</div>';
        }

        // Action buttons
        html += `
                <div class="report-actions">
                    ${data.coaching_plan ? '<button class="btn-coaching" onclick="openCoachingPlan()">View Coaching Plan</button>' : ''}
                    <button onclick="printReport()">Print / Save PDF</button>
                    <button onclick="copyShareLink()">Copy Share Link</button>
                    ${typeof getRecordingBlob === 'function' ? '<button onclick="downloadRecording()">Download Recording</button>' : ''}
                    <button onclick="showSection('history')">View History</button>
                    <button onclick="location.reload()">Start New Interview</button>
                </div>

                <p class="storage-info">Report saved: ${data.storage_location}</p>
            </div>
        `;

        container.innerHTML = html;

        // Coaching plan modal: append to body so it's never clipped by parent containers
        if (data.coaching_plan) {
            // Remove any existing coaching modal
            const existing = document.getElementById('coaching-modal');
            if (existing) existing.remove();

            const modalDiv = document.createElement('div');
            modalDiv.id = 'coaching-modal';
            modalDiv.className = 'coaching-modal hidden';
            modalDiv.innerHTML = `
                <div class="coaching-modal-backdrop" onclick="closeCoachingPlan()"></div>
                <div class="coaching-modal-content">
                    <div class="coaching-modal-header">
                        <h3>Coaching Plan</h3>
                        <div class="coaching-modal-actions">
                            <button onclick="downloadCoachingPlan()" title="Download">Download</button>
                            <button onclick="closeCoachingPlan()" title="Close">Close</button>
                        </div>
                    </div>
                    <div class="coaching-plan">${data.coaching_plan.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
                </div>
            `;
            document.body.appendChild(modalDiv);
        }

        // Track event
            API.trackEvent('interview_completed', {
                session_id: sessionId,
                overall_score: r.overall_score,
            });
        }
    } catch (err) {
        container.innerHTML = '<p class="error">Error generating report: ' + err.message + '</p>';
    }
}
