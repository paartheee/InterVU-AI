// Interview configuration form management

function getInterviewConfig() {
    return {
        interview_type: document.getElementById('interview-type').value,
        difficulty_level: document.getElementById('difficulty-level').value,
        duration_minutes: parseInt(document.getElementById('duration-select').value),
        follow_up_depth: parseInt(document.getElementById('followup-depth').value),
        company_style: document.getElementById('company-style').value || null,
        is_practice_mode: false,
    };
}

function showConfigAfterParse() {
    document.getElementById('interview-config').classList.remove('hidden');
}

function hideConfig() {
    document.getElementById('interview-config').classList.add('hidden');
}
