// Interview history dashboard

async function loadHistory() {
    const candidateId = getCandidateId();
    try {
        const interviews = await API.listInterviews({ candidate_id: candidateId, limit: 50 });
        renderHistoryList(interviews);
    } catch (e) {
        document.getElementById('history-list').innerHTML =
            '<p class="empty-state">No interviews yet. Start your first mock interview!</p>';
    }
}

function renderHistoryList(interviews) {
    const container = document.getElementById('history-list');

    if (!interviews || interviews.length === 0) {
        container.innerHTML = '<p class="empty-state">No interviews yet. Start your first mock interview!</p>';
        return;
    }

    container.innerHTML = `
        <div class="history-table">
            <div class="history-header">
                <span>Job Title</span>
                <span>Type</span>
                <span>Difficulty</span>
                <span>Score</span>
                <span>Date</span>
                <span>Status</span>
            </div>
            ${interviews.map(i => `
                <div class="history-row" onclick="loadInterviewDetail('${i.id}')">
                    <span class="history-title">${i.job_title || 'Untitled'}</span>
                    <span class="history-type tag">${i.interview_type}</span>
                    <span class="history-difficulty">${i.difficulty_level}</span>
                    <span class="history-score ${i.overall_score ? (i.overall_score >= 7 ? 'score-high' : i.overall_score >= 5 ? 'score-mid' : 'score-low') : ''}">${i.overall_score ? i.overall_score + '/10' : '--'}</span>
                    <span class="history-date">${i.started_at ? new Date(i.started_at).toLocaleDateString() : '--'}</span>
                    <span class="history-status status-${i.status}">${i.status}</span>
                </div>
            `).join('')}
        </div>
    `;
}

async function loadInterviewDetail(interviewId) {
    const detailEl = document.getElementById('history-detail');
    const contentEl = document.getElementById('history-report-content');
    detailEl.classList.remove('hidden');
    contentEl.innerHTML = '<p>Loading...</p>';

    try {
        const data = await API.getInterviewDetail(interviewId);
        const r = data.report;
        const i = data.interview;

        let html = `
            <div class="report-card">
                <h3>${i.job_title} - Interview Report</h3>
                <p><strong>Type:</strong> ${i.interview_type} | <strong>Difficulty:</strong> ${i.difficulty_level}</p>
                <p><strong>Date:</strong> ${i.started_at ? new Date(i.started_at).toLocaleString() : '--'}</p>
        `;

        if (r) {
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

            // Skill scores
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

        } else {
            html += '<p>No report available for this interview.</p>';
        }

        html += `
            <div class="report-actions">
                ${r && r.coaching_plan ? '<button class="btn-coaching" onclick="openCoachingPlan()">View Coaching Plan</button>' : ''}
                <button onclick="loadTranscriptView('${interviewId}')">View Transcript</button>
                <button onclick="loadComparisonView('${i.job_title}')">Compare Progress</button>
                <button onclick="document.getElementById('history-detail').classList.add('hidden')">Back to List</button>
            </div>
        </div>`;

        // Coaching plan modal
        if (r && r.coaching_plan) {
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

        contentEl.innerHTML = html;
    } catch (e) {
        contentEl.innerHTML = '<p class="error">Failed to load interview details.</p>';
    }
}

async function loadTranscriptView(interviewId) {
    const transcriptEl = document.getElementById('history-transcript');
    const contentEl = document.getElementById('transcript-content');
    transcriptEl.classList.remove('hidden');
    contentEl.innerHTML = '<p>Loading transcript...</p>';

    try {
        const entries = await API.getTranscript(interviewId);
        if (entries.length === 0) {
            contentEl.innerHTML = '<p>No transcript available.</p>';
            return;
        }

        contentEl.innerHTML = entries.map(e => {
            const time = formatTime(Math.floor(e.timestamp_ms / 1000));
            const cls = e.speaker === 'ai' ? 'transcript-ai' : e.speaker === 'user' ? 'transcript-user' : 'transcript-system';
            return `<div class="transcript-entry ${cls}">
                <span class="transcript-time">${time}</span>
                <strong>${e.speaker}:</strong> ${e.content}
            </div>`;
        }).join('');
    } catch (e) {
        contentEl.innerHTML = '<p class="error">Failed to load transcript.</p>';
    }
}

function filterHistory() {
    const query = document.getElementById('history-search')?.value?.toLowerCase() || '';
    const rows = document.querySelectorAll('.history-row');
    rows.forEach(row => {
        const title = row.querySelector('.history-title')?.textContent?.toLowerCase() || '';
        row.style.display = title.includes(query) ? '' : 'none';
    });
}

async function loadComparisonView(jobTitle) {
    const compEl = document.getElementById('history-comparison');
    compEl.classList.remove('hidden');

    try {
        const data = await API.compareInterviews(jobTitle, getCandidateId());
        const canvas = document.getElementById('comparison-chart');
        const labels = data.dates.map(d => d ? new Date(d).toLocaleDateString() : '--');
        drawLineChart(canvas, labels, data.scores, {
            title: `Score Progress: ${data.job_title}`,
            color: '#0d9488',
        });
    } catch (e) {
        compEl.innerHTML = '<p>Not enough data for comparison yet.</p>';
    }
}
