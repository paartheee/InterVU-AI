function handleFileUpload(inputEl, textareaId) {
    const file = inputEl.files[0];
    if (!file) return;

    const textarea = document.getElementById(textareaId);

    // For text files, read directly
    if (file.name.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            textarea.value = e.target.result;
            showToast(`Loaded ${file.name}`, 'success', 2000);
        };
        reader.readAsText(file);
        return;
    }

    // For PDF / DOC / DOCX — use FileReader to read as text (best effort)
    // Note: proper PDF/DOCX parsing would require a backend endpoint,
    // but for hackathon we extract what we can client-side
    if (file.name.endsWith('.pdf')) {
        // PDFs need server-side parsing; read as binary and send to backend
        showToast('PDF detected — extracting text...', 'info', 3000);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const formData = new FormData();
                formData.append('file', file);
                const resp = await fetch('/api/extract-text', {
                    method: 'POST',
                    body: formData,
                });
                if (resp.ok) {
                    const data = await resp.json();
                    textarea.value = data.text;
                    showToast(`Extracted text from ${file.name}`, 'success');
                } else {
                    // Fallback: try reading as text
                    textarea.value = e.target.result;
                    showToast('PDF text extraction limited — paste text for best results', 'warning');
                }
            } catch {
                textarea.value = '';
                showToast('Could not extract PDF text — please paste the content manually', 'warning');
            }
        };
        reader.readAsText(file);
        return;
    }

    // For .doc/.docx — attempt text extraction
    const reader = new FileReader();
    reader.onload = (e) => {
        // Best-effort: extract visible text from the binary
        const text = e.target.result;
        // Filter out non-printable characters for .docx
        const cleaned = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n');
        textarea.value = cleaned;
        showToast(`Loaded ${file.name} — review the extracted text`, 'info');
    };
    reader.readAsText(file);
}

async function parseJD() {
    const jdText = document.getElementById('jd-input').value.trim();
    if (jdText.length < 50) {
        showToast('Please paste a complete job description (at least 50 characters).', 'warning');
        return;
    }

    const resumeText = document.getElementById('resume-input').value.trim();
    const candidateLanguage = document.getElementById('lang-select').value;

    const btn = document.getElementById('parse-btn');
    btn.disabled = true;
    btn.textContent = resumeText ? 'Analyzing JD + Resume...' : 'Analyzing JD...';

    try {
        const response = await fetch('/api/parse-jd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_description: jdText,
                resume_text: resumeText,
                candidate_language: candidateLanguage,
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || `HTTP ${response.status}`);
        }

        const data = await response.json();

        appState.systemPrompt = data.system_prompt;
        appState.extractedSkills = data.skills;

        // Render JD skills
        const skillsContainer = document.getElementById('skills-content');
        skillsContainer.innerHTML = `
            <p><strong>Job Title:</strong> ${data.skills.job_title}</p>
            <p><strong>Technical:</strong> ${data.skills.technical_skills.join(', ')}</p>
            <p><strong>Soft Skills:</strong> ${data.skills.soft_skills.join(', ')}</p>
            <p><strong>Context:</strong> ${data.skills.company_context}</p>
            <p><strong>Language:</strong> ${candidateLanguage}</p>
        `;

        // Render resume if parsed
        if (data.resume) {
            const resumeContainer = document.getElementById('resume-content');
            resumeContainer.innerHTML = `
                <p><strong>Name:</strong> ${data.resume.candidate_name}</p>
                <p><strong>Experience:</strong> ${data.resume.years_of_experience}</p>
                <p><strong>Skills:</strong> ${data.resume.technical_skills.join(', ')}</p>
                <p><strong>Education:</strong> ${data.resume.education}</p>
                <p><strong>Projects:</strong></p>
                <ul>${data.resume.projects.map(p => '<li>' + p + '</li>').join('')}</ul>
            `;
            document.getElementById('resume-display').classList.remove('hidden');

            // Show gap analysis
            renderGapAnalysis(data.skills, data.resume);
        }

        document.getElementById('skills-display').classList.remove('hidden');
        showToast(
            data.resume
                ? 'JD + Resume analyzed — gap analysis ready'
                : 'Job description analyzed successfully',
            'success'
        );
    } catch (err) {
        showToast('Error parsing: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Analyze & Prepare Interview';
    }
}

function renderGapAnalysis(skills, resume) {
    const resumeSkillsLower = resume.technical_skills.map(s => s.toLowerCase());

    const matched = [];
    const gaps = [];

    for (const skill of skills.technical_skills) {
        const found = resumeSkillsLower.some(rs =>
            rs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(rs)
        );
        if (found) {
            matched.push(skill);
        } else {
            gaps.push(skill);
        }
    }

    const gapContainer = document.getElementById('gap-content');
    gapContainer.innerHTML = `
        <div class="gap-row">
            <div class="gap-matched">
                <strong>Matched Skills:</strong>
                ${matched.map(s => '<span class="tag tag-green">' + s + '</span>').join(' ')}
                ${matched.length === 0 ? '<span class="tag tag-dim">None</span>' : ''}
            </div>
            <div class="gap-missing">
                <strong>Gaps (JD requires, not on resume):</strong>
                ${gaps.map(s => '<span class="tag tag-red">' + s + '</span>').join(' ')}
                ${gaps.length === 0 ? '<span class="tag tag-green">No gaps!</span>' : ''}
            </div>
        </div>
        <p class="gap-note">Wayne will drill into matched skills and probe gaps during the interview.</p>
    `;
    document.getElementById('gap-analysis').classList.remove('hidden');
}
