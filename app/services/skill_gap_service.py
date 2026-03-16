from app.services.llm import get_llm
from app.models.schemas import ExtractedSkills, ParsedResume, SkillGapAnalysis


async def analyze_skill_gap(
    skills: ExtractedSkills, resume: ParsedResume
) -> SkillGapAnalysis:
    structured_llm = get_llm().with_structured_output(SkillGapAnalysis)

    jd_skills = {
        "required_skills": skills.required_skills,
        "preferred_skills": skills.preferred_skills,
        "tools_and_technologies": skills.tools_and_technologies,
        "soft_skills": skills.soft_skills,
    }

    candidate_skills = {
        "skills": resume.skills,
        "programming_languages": resume.programming_languages,
        "frameworks": resume.frameworks,
        "tools": resume.tools,
        "cloud_platforms": resume.cloud_platforms,
        "databases": resume.databases,
        "domains": resume.domains,
        "certifications": resume.certifications,
    }

    prompt = (
        "You are an interview preparation assistant.\n\n"
        f"Job Skills:\n{jd_skills}\n\n"
        f"Candidate Skills:\n{candidate_skills}\n\n"
        "Identify:\n"
        "- matching_skills: Skills present in both the JD requirements and the candidate's resume.\n"
        "- missing_skills: Skills required by the JD but missing from the candidate's resume.\n"
        "- focus_areas: Key weak areas to probe during the interview, based on the gaps.\n\n"
        "Be thorough — compare across required skills, preferred skills, and tools/technologies.\n"
        "Return ONLY valid JSON matching the schema.\n"
    )

    result = await structured_llm.ainvoke(prompt)
    return result
