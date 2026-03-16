// Central API client and candidate identity management

function getCandidateId() {
    let id = localStorage.getItem('intervu_candidate_id');
    if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() :
            'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            }));
        localStorage.setItem('intervu_candidate_id', id);
    }
    return id;
}

const API = {
    // Profile
    async getProfile(id) {
        const res = await fetch(`/api/profile/${id}`);
        if (!res.ok) throw new Error('Profile not found');
        return res.json();
    },

    async saveProfile(data) {
        const res = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to save profile');
        return res.json();
    },

    // History
    async listInterviews(params = {}) {
        const query = new URLSearchParams(params).toString();
        const res = await fetch(`/api/interviews?${query}`);
        if (!res.ok) throw new Error('Failed to fetch interviews');
        return res.json();
    },

    async getInterviewDetail(id) {
        const res = await fetch(`/api/interviews/${id}`);
        if (!res.ok) throw new Error('Interview not found');
        return res.json();
    },

    async getTranscript(id) {
        const res = await fetch(`/api/interviews/${id}/transcript`);
        if (!res.ok) throw new Error('Transcript not found');
        return res.json();
    },

    async getConfidenceTimeline(id) {
        const res = await fetch(`/api/interviews/${id}/confidence-timeline`);
        if (!res.ok) throw new Error('Confidence data not found');
        return res.json();
    },

    async getRecording(id) {
        const res = await fetch(`/api/interviews/${id}/recording`);
        if (!res.ok) throw new Error('Recording not found');
        return res.json();
    },

    async compareInterviews(jobTitle, candidateId) {
        const params = new URLSearchParams({ job_title: jobTitle });
        if (candidateId) params.append('candidate_id', candidateId);
        const res = await fetch(`/api/compare?${params}`);
        if (!res.ok) throw new Error('Comparison failed');
        return res.json();
    },

    // Questions
    async previewQuestions(skillsJson, type, difficulty, style) {
        const params = new URLSearchParams({
            skills_json: skillsJson,
            interview_type: type,
            difficulty_level: difficulty,
        });
        if (style) params.append('company_style', style);
        const res = await fetch('/api/questions/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        });
        if (!res.ok) throw new Error('Failed to generate questions');
        return res.json();
    },

    // Analytics
    async getAnalyticsSummary(candidateId) {
        const params = candidateId ? `?candidate_id=${candidateId}` : '';
        const res = await fetch(`/api/analytics/summary${params}`);
        if (!res.ok) throw new Error('Analytics failed');
        return res.json();
    },

    async trackEvent(eventType, metadata) {
        const res = await fetch('/api/analytics/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_type: eventType, metadata }),
        });
        return res.json();
    },

    // Share
    async getSharedReport(token) {
        const res = await fetch(`/api/share/${token}`);
        if (!res.ok) throw new Error('Shared report not found');
        return res.json();
    },
};
