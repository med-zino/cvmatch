// Cover letters and CV tailoring tips for a saved job, written by Gemini from the saved CV and the listing
const { askGemini, DESCRIPTION_CHARS } = require('./matching');

const LANGUAGE_RULES = {
  auto: 'Write in the language the job listing is written in.',
  en: 'Write in English.',
  fr: 'Write in French.'
};

const listing = job => JSON.stringify({
  title: job.title,
  company: job.company,
  location: job.location,
  requirements: job.qualifications || [],
  description: (job.description || '').slice(0, DESCRIPTION_CHARS)
});

const ordered = (properties, fields = Object.keys(properties)) => ({ type: 'OBJECT', properties, required: fields, propertyOrdering: fields });
const STRING = { type: 'STRING' };
const LIST = { type: 'ARRAY', items: STRING };

const LETTER_SCHEMA = ordered({ subject: STRING, letter: STRING });

async function writeCoverLetter(cvText, job, language, signal) {
  const result = await askGemini(`You are an experienced hiring manager and career coach. Write the cover letter this candidate should send for the job below.

Rules:
- ${LANGUAGE_RULES[language]}
- 230 to 320 words in 4 short paragraphs of plain text (no markdown, no placeholders in brackets), starting with a greeting and ending with a sign-off and the candidate's name as it appears in the CV.
- Open with why this role at this company, using a concrete detail from the listing rather than a cliché.
- In the middle, match 2 or 3 of the listing's key requirements with specific evidence from the CV: roles, years, results, numbers.
- Use only facts from the CV. Never invent experience, employers, numbers, qualifications or motivations the CV doesn't support.
- If an important requirement is missing from the CV, don't claim it; at most mention related experience.
- Confident, warm and specific. Avoid stock phrases such as "I am writing to express my interest" or "I would be a great fit".
- If the listing names a contact person, address them; otherwise use a neutral greeting.
- subject: a short subject line for sending the letter by email.

Candidate CV:
"""
${cvText}
"""

Job listing:
${listing(job)}`, LETTER_SCHEMA, signal);
  return { subject: result.subject.trim(), text: result.letter.trim() };
}

const TIPS_SCHEMA = ordered({
  verdict: STRING,
  keywords: LIST,
  rewrites: { type: 'ARRAY', items: ordered({ section: STRING, before: STRING, after: STRING, why: STRING }) },
  gaps: { type: 'ARRAY', items: ordered({ requirement: STRING, advice: STRING }) },
  order: LIST
});

async function suggestCvChanges(cvText, job, language, signal) {
  return askGemini(`You are a senior recruiter. Review this CV against one specific job and tell the candidate how to tailor it for this application.

Rules:
- ${LANGUAGE_RULES[language]}
- Only suggest changes grounded in what the CV already shows: reword, reorder, quantify, and bring forward relevant experience that is buried. Never suggest adding experience, skills or qualifications the candidate doesn't have.
- For requirements the candidate lacks, suggest honest ways to address them (a relevant project, a course, a line in the cover letter).
- Be specific to this listing and reuse its wording where it's true for the candidate, so applicant tracking systems pick it up.

Return:
- verdict: one sentence on how well the CV fits this job as it stands
- keywords: up to 8 terms from the listing the CV should use, only where they're true for the candidate
- rewrites: up to 4 concrete edits, each with section (for example "Summary" or the role it belongs to), before (the current wording quoted from the CV, or empty for a new line), after (the suggested wording) and why (one short reason)
- gaps: up to 3 missing requirements, each with requirement and advice
- order: up to 3 tips on structure or ordering

Candidate CV:
"""
${cvText}
"""

Job listing:
${listing(job)}`, TIPS_SCHEMA, signal);
}

const ASSIST_LANGUAGES = Object.keys(LANGUAGE_RULES);

// The letter ('letter') or the tips ('tips') for a job, stamped with the language and date, ready to store
async function writeAssist(kind, cvText, job, language, signal) {
  const written = kind === 'tips'
    ? await suggestCvChanges(cvText, job, language, signal)
    : await writeCoverLetter(cvText, job, language, signal);
  return { ...written, language, createdAt: new Date() };
}

module.exports = { writeAssist, ASSIST_LANGUAGES };
