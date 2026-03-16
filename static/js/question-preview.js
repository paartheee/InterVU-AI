// Question preview before interview

async function loadQuestionPreview() {
    if (!appState.extractedSkills) return;

    const config = getInterviewConfig();
    const container = document.getElementById('questions-content');
    container.innerHTML = '<p>Generating likely questions...</p>';
    showSection('questions');

    try {
        const previews = await API.previewQuestions(
            JSON.stringify(appState.extractedSkills),
            config.interview_type,
            config.difficulty_level,
            config.company_style
        );
        renderQuestionPreview(previews);
    } catch (e) {
        container.innerHTML = '<p class="error">Failed to generate questions: ' + e.message + '</p>';
    }
}

function renderQuestionPreview(previews) {
    const container = document.getElementById('questions-content');
    if (!previews || previews.length === 0) {
        container.innerHTML = '<p>No questions generated.</p>';
        return;
    }

    container.innerHTML = previews.map(p => `
        <div class="question-group">
            <h4>${p.skill_name} <span class="tag">${p.interview_type}</span> <span class="tag">${p.difficulty_level}</span></h4>
            <ul>${p.questions.map(q => `<li>${q}</li>`).join('')}</ul>
        </div>
    `).join('');
}
