// Candidate profile management

async function loadProfile() {
    const id = getCandidateId();
    try {
        const profile = await API.getProfile(id);
        document.getElementById('profile-name').value = profile.display_name || '';
        document.getElementById('profile-roles').value = (profile.target_roles || []).join(', ');
        document.getElementById('profile-resume').value = profile.resume_text || '';
    } catch {
        // New profile, fields stay empty
    }
}

async function saveProfile() {
    const data = {
        id: getCandidateId(),
        display_name: document.getElementById('profile-name').value,
        target_roles: document.getElementById('profile-roles').value
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
        resume_text: document.getElementById('profile-resume').value,
    };
    try {
        await API.saveProfile(data);
        showToast('Profile saved', 'success');
    } catch (e) {
        showToast('Failed to save profile: ' + e.message, 'error');
    }
}

function prefillResumeFromProfile() {
    const profileResume = document.getElementById('profile-resume');
    const interviewResume = document.getElementById('resume-text');
    if (profileResume && interviewResume && profileResume.value && !interviewResume.value) {
        interviewResume.value = profileResume.value;
    }
}
