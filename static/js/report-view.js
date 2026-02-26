async function fetchAndDisplayReport(sessionId, summaryText, skillsJson) {
    showSection('report');
    const container = document.getElementById('report-content');
    container.innerHTML = '<p>Generating your interview report...</p>';

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

        container.innerHTML = `
            <div class="report-card">
                <h3>${r.job_title} - Interview Report</h3>
                <p class="score">Overall Score: <strong>${r.overall_score}/10</strong></p>

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

                <p class="storage-info">Report saved: ${data.storage_location}</p>
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<p class="error">Error generating report: ' + err.message + '</p>';
    }
}
