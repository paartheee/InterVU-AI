/**
 * Sanitize pasted content: strip backgrounds, inline styles, and collapse empty lines.
 */
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.rich-textarea').forEach(el => {
        el.addEventListener('paste', (e) => {
            e.preventDefault();

            // Get HTML from clipboard, fall back to plain text
            const html = e.clipboardData.getData('text/html');
            const plain = e.clipboardData.getData('text/plain');

            if (html) {
                // Parse and clean the HTML
                const temp = document.createElement('div');
                temp.innerHTML = html;
                cleanPastedNode(temp);
                // Insert cleaned HTML
                const selection = window.getSelection();
                if (!selection.rangeCount) return;
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const frag = document.createDocumentFragment();
                // Move cleaned nodes into fragment
                while (temp.firstChild) {
                    frag.appendChild(temp.firstChild);
                }
                range.insertNode(frag);
                // Move cursor to end
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            } else if (plain) {
                document.execCommand('insertText', false, plain);
            }
        });
    });
});

function cleanPastedNode(node) {
    // Remove style attributes that cause visibility issues
    const stripProps = [
        'background', 'background-color', 'backgroundColor',
        'color', 'font-size', 'fontSize', 'font-family', 'fontFamily',
        'line-height', 'lineHeight'
    ];

    if (node.nodeType === 1) { // Element node
        // Remove inline style properties
        if (node.style) {
            stripProps.forEach(prop => {
                node.style.removeProperty(prop);
                // Also handle camelCase
                try { node.style[prop] = ''; } catch(_) {}
            });
        }
        // Remove class and id to avoid style conflicts
        node.removeAttribute('class');
        node.removeAttribute('id');

        // Remove empty spans (often used as formatting wrappers)
        if (node.tagName === 'SPAN' && !node.style.cssText.trim()) {
            const parent = node.parentNode;
            while (node.firstChild) {
                parent.insertBefore(node.firstChild, node);
            }
            parent.removeChild(node);
            return;
        }

        // Recursively clean children (iterate backwards since we may remove nodes)
        const children = Array.from(node.childNodes);
        children.forEach(child => cleanPastedNode(child));
    }
}

/**
 * Helper: get plain text from a rich-textarea (contenteditable div) or regular textarea.
 */
function getRichValue(el) {
    return el.tagName === 'TEXTAREA' ? el.value : (el.innerText || '');
}

/**
 * Helper: set content into a rich-textarea or regular textarea.
 * For contenteditable divs, converts plain text line breaks to <br> tags.
 */
function setRichValue(el, text) {
    if (el.tagName === 'TEXTAREA') {
        el.value = text;
    } else {
        // Convert plain text to HTML preserving line breaks
        const html = text
            .split('\n')
            .map(line => line === '' ? '<br>' : `<div>${escapeHtml(line)}</div>`)
            .join('');
        el.innerHTML = html;
    }
}

/**
 * Helper: set HTML content directly (for rich paste from server).
 */
function setRichHTML(el, html) {
    if (el.tagName === 'TEXTAREA') {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        el.value = tmp.innerText;
    } else {
        el.innerHTML = html;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function handleFileUpload(inputEl, textareaId) {
    const file = inputEl.files[0];
    if (!file) return;

    const target = document.getElementById(textareaId);

    // For text files, read directly
    if (file.name.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            setRichValue(target, e.target.result);
            showToast(`Loaded ${file.name}`, 'success', 2000);
        };
        reader.readAsText(file);
        return;
    }

    // For PDF — send to backend for extraction
    if (file.name.endsWith('.pdf')) {
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
                    // If server returns HTML, preserve it; otherwise use plain text
                    if (data.html) {
                        setRichHTML(target, data.html);
                    } else {
                        setRichValue(target, data.text);
                    }
                    showToast(`Extracted text from ${file.name}`, 'success');
                } else {
                    setRichValue(target, e.target.result);
                    showToast('PDF text extraction limited — paste text for best results', 'warning');
                }
            } catch {
                setRichValue(target, '');
                showToast('Could not extract PDF text — please paste the content manually', 'warning');
            }
        };
        reader.readAsText(file);
        return;
    }

    // For .doc/.docx — attempt text extraction
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const cleaned = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n');
        setRichValue(target, cleaned);
        showToast(`Loaded ${file.name} — review the extracted text`, 'info');
    };
    reader.readAsText(file);
}

// ---- Wizard Navigation ----

let currentWizardStep = 1;
let parsedData = null; // Store full API response for use across steps

function wizardGoTo(step) {
    // Don't allow going to step 2/3 without data
    if (step > 1 && !parsedData) {
        showToast('Please analyze a job description first.', 'warning');
        return;
    }

    currentWizardStep = step;

    // Hide all panels
    for (let i = 1; i <= 3; i++) {
        const panel = document.getElementById(`wizard-step-${i}`);
        if (panel) {
            panel.classList.add('hidden');
        }
    }

    // Show target panel
    const target = document.getElementById(`wizard-step-${step}`);
    if (target) {
        target.classList.remove('hidden');
    }

    // Update progress indicator
    document.querySelectorAll('.wizard-step').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');
        if (s === step) el.classList.add('active');
        else if (s < step) el.classList.add('completed');
    });
    document.querySelectorAll('.wizard-step-line').forEach((line, i) => {
        if (i < step - 1) line.classList.add('completed');
        else line.classList.remove('completed');
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backToSetup() {
    wizardGoTo(1);
}

// ---- Parse JD ----

async function parseJD() {
    const jdText = getRichValue(document.getElementById('jd-input')).trim();
    if (jdText.length < 50) {
        showToast('Please paste a complete job description (at least 50 characters).', 'warning');
        return;
    }

    const resumeText = getRichValue(document.getElementById('resume-input')).trim();
    const candidateLanguage = document.getElementById('lang-select').value;

    const btn = document.getElementById('parse-btn');
    btn.disabled = true;

    // Build overlay steps
    const steps = resumeText
        ? ['Parsing Job Description', 'Analyzing Resume', 'Detecting Skill Gaps', 'Building Interview']
        : ['Parsing Job Description', 'Identifying Key Skills', 'Building Interview'];

    const overlay = document.getElementById('analysis-overlay');
    const stepsContainer = document.getElementById('analysis-overlay-steps');
    stepsContainer.innerHTML = steps.map((s, i) =>
        `<div class="overlay-step${i === 0 ? ' active' : ''}">
            <span class="step-icon">${i === 0 ? '&#9679;' : (i + 1)}</span>
            <span>${s}</span>
        </div>`
    ).join('');
    overlay.classList.remove('hidden');

    // Animate progress steps on a timer
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
        stepIdx++;
        if (stepIdx < steps.length) {
            stepsContainer.querySelectorAll('.overlay-step').forEach((el, i) => {
                if (i < stepIdx) {
                    el.className = 'overlay-step done';
                    el.querySelector('.step-icon').innerHTML = '&#10003;';
                } else if (i === stepIdx) {
                    el.className = 'overlay-step active';
                    el.querySelector('.step-icon').innerHTML = '&#9679;';
                } else {
                    el.className = 'overlay-step';
                }
            });
        }
    }, resumeText ? 2500 : 3000);

    try {
        const config = typeof getInterviewConfig === 'function' ? getInterviewConfig() : {};

        const response = await fetch('/api/parse-jd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_description: jdText,
                resume_text: resumeText,
                candidate_language: candidateLanguage,
                config: config,
                candidate_id: typeof getCandidateId === 'function' ? getCandidateId() : null,
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || `HTTP ${response.status}`);
        }

        const data = await response.json();
        parsedData = data;

        appState.systemPrompt = data.system_prompt;
        appState.extractedSkills = data.skills;
        appState.interviewDbId = data.interview_db_id;

        // Populate Step 2
        renderStep2(data);

        // Populate Step 3
        renderStep3(data);

        // Navigate to Step 2
        wizardGoTo(2);

        showToast(
            data.resume
                ? 'JD + Resume analyzed — review your skill gaps'
                : 'Job description analyzed successfully',
            'success'
        );
    } catch (err) {
        showToast('Error parsing: ' + err.message, 'error');
    } finally {
        clearInterval(stepTimer);
        stepsContainer.querySelectorAll('.overlay-step').forEach(el => {
            el.className = 'overlay-step done';
            el.querySelector('.step-icon').innerHTML = '&#10003;';
        });
        setTimeout(() => { overlay.classList.add('hidden'); }, 600);
        btn.disabled = false;
    }
}

// ---- Render Step 2: AI Extracted Information ----

function renderSkillTags(container, skills, cssClass) {
    const el = document.getElementById(container);
    if (!el) return;
    if (!skills || skills.length === 0) {
        el.innerHTML = '<span class="skill-tag skill-tag-neutral">None detected</span>';
        return;
    }
    el.innerHTML = skills.map(s =>
        `<span class="skill-tag ${cssClass}">${escapeHtml(s)}</span>`
    ).join('');
}

function renderStep2(data) {
    const skills = data.skills;

    // Role banner
    const roleTitle = document.getElementById('detected-role-title');
    if (roleTitle) roleTitle.textContent = skills.job_title || 'Unknown Role';
    const seniority = document.getElementById('detected-seniority');
    if (seniority) seniority.textContent = skills.seniority_level || '';

    // Required skills
    renderSkillTags('required-skills-tags', skills.required_skills, 'skill-tag-neutral');

    // Preferred skills
    renderSkillTags('preferred-skills-tags', skills.preferred_skills, 'skill-tag-neutral');

    // Tools & technologies
    renderSkillTags('tools-tags', skills.tools_and_technologies, 'skill-tag-neutral');

    // Resume section
    if (data.resume) {
        const r = data.resume;
        const allResumeSkills = [
            ...(r.skills || []),
            ...(r.programming_languages || []),
            ...(r.frameworks || []),
            ...(r.tools || []),
            ...(r.cloud_platforms || []),
            ...(r.databases || []),
        ];
        const uniqueSkills = [...new Set(allResumeSkills.map(s => s))];

        const resumeContainer = document.getElementById('resume-content');
        if (resumeContainer) {
            resumeContainer.innerHTML = `
                <p><strong>${escapeHtml(r.candidate_name)}</strong>${r.current_role ? ' — ' + escapeHtml(r.current_role) : ''}</p>
                <p>${escapeHtml(r.years_of_experience)} experience</p>
                <div class="skill-tags" style="margin: 0.5rem 0;">
                    ${uniqueSkills.map(s => `<span class="skill-tag skill-tag-check">${escapeHtml(s)}</span>`).join('')}
                </div>
                ${r.certifications && r.certifications.length ? '<p><strong>Certs:</strong> ' + r.certifications.map(c => escapeHtml(c)).join(', ') + '</p>' : ''}
            `;
        }
        const resumeDisplay = document.getElementById('resume-display');
        if (resumeDisplay) resumeDisplay.classList.remove('hidden');

        if (data.skill_gap) {
            renderGapAnalysis(data.skill_gap);
        }
    } else {
        const resumeDisplay = document.getElementById('resume-display');
        if (resumeDisplay) resumeDisplay.classList.add('hidden');
        const gapEl = document.getElementById('gap-analysis');
        if (gapEl) gapEl.classList.add('hidden');
    }

    // Responsibilities
    if (skills.responsibilities && skills.responsibilities.length) {
        const list = document.getElementById('responsibilities-list');
        if (list) {
            list.innerHTML = skills.responsibilities.map(r =>
                `<li>${escapeHtml(r)}</li>`
            ).join('');
        }
        const respSection = document.getElementById('responsibilities-section');
        if (respSection) respSection.classList.remove('hidden');
    } else {
        const respSection = document.getElementById('responsibilities-section');
        if (respSection) respSection.classList.add('hidden');
    }
}

function renderGapAnalysis(skillGap) {
    const gapContainer = document.getElementById('gap-content');
    if (!gapContainer) return;
    const matched = skillGap.matching_skills || [];
    const missing = skillGap.missing_skills || [];
    const focus = skillGap.focus_areas || [];

    gapContainer.innerHTML = `
        <div class="gap-row">
            <div class="gap-matched">
                <strong>Matched Skills</strong>
                ${matched.length ? matched.map(s => '<span class="tag tag-green">' + escapeHtml(s) + '</span>').join(' ') : '<span class="tag tag-dim">None</span>'}
            </div>
            <div class="gap-missing">
                <strong>Missing Skills</strong>
                ${missing.length ? missing.map(s => '<span class="tag tag-red">' + escapeHtml(s) + '</span>').join(' ') : '<span class="tag tag-green">No gaps!</span>'}
            </div>
        </div>
        ${focus.length ? `
        <div class="gap-focus">
            <strong>Focus Areas</strong>
            <ul>${focus.map(f => '<li>' + escapeHtml(f) + '</li>').join('')}</ul>
        </div>` : ''}
        <p class="gap-note">Wayne will drill into matched skills and probe gaps during the interview.</p>
    `;
    const gapEl = document.getElementById('gap-analysis');
    if (gapEl) gapEl.classList.remove('hidden');
}

// ---- Render Step 3: Interview Configuration ----

function renderStep3(data) {
    const skills = data.skills;

    // Role summary
    const summary = document.getElementById('config-role-summary');
    if (summary) {
        summary.innerHTML = `
            <strong>${escapeHtml(skills.job_title)}</strong>
            <span>${escapeHtml(skills.seniority_level || '')}</span>
            <span>${escapeHtml(skills.domain || '')}</span>
        `;
    }

    // Auto-set difficulty from seniority
    const seniorityMap = {
        'junior': 'junior', 'entry': 'junior', 'entry-level': 'junior',
        'mid': 'mid', 'mid-level': 'mid', 'intermediate': 'mid',
        'senior': 'senior', 'lead': 'senior', 'staff': 'senior', 'principal': 'senior',
    };
    const seniority = (skills.seniority_level || '').toLowerCase();
    for (const [key, val] of Object.entries(seniorityMap)) {
        if (seniority.includes(key)) {
            document.getElementById('difficulty-level').value = val;
            break;
        }
    }

    // Focus areas from skill gap (section may be removed from HTML)
    const focusSection = document.getElementById('focus-areas-section');
    if (focusSection) {
        if (data.skill_gap && data.skill_gap.focus_areas && data.skill_gap.focus_areas.length) {
            const tagsEl = document.getElementById('focus-areas-tags');
            if (tagsEl) tagsEl.innerHTML = data.skill_gap.focus_areas.map(f =>
                `<span class="focus-tag">${escapeHtml(f)}</span>`
            ).join('');
            focusSection.classList.remove('hidden');
        } else if (data.skill_gap && data.skill_gap.missing_skills && data.skill_gap.missing_skills.length) {
            const tagsEl = document.getElementById('focus-areas-tags');
            if (tagsEl) tagsEl.innerHTML = data.skill_gap.missing_skills.map(f =>
                `<span class="focus-tag">${escapeHtml(f)}</span>`
            ).join('');
            focusSection.classList.remove('hidden');
        } else {
            focusSection.classList.add('hidden');
        }
    }
}
