// api/reclassify.js
// Vercel Serverless Function — Real LLM Batch Reclassification via OpenRouter / Gemini API

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `
You are the World's Foremost Principal AI Recruitment Auditor and Talent Acquisition Systems Architect.
Your task is to analyze candidate job applications, parse ATS communication artifacts, and classify recruiting communications with 100% semantic accuracy.

================================================================================
SECTION 1: CORE OUTPUT FIELDS SPECIFICATION
================================================================================
For every input application, output:
1. "id" (string): The exact ID passed in.
2. "company" (string): The true hiring employer, recruiting firm, or corporate entity.
   - NEVER output ATS vendor software names (e.g., "Workday", "Greenhouse", "Lever", "Ashby", "SmartRecruiters", "iCIMS", "Taleo", "BambooHR", "ADP", "ClearCompany").
   - Extract the true client/employer from the email domain, sender name, subject, or notes.
   - Clean company names: strip prefixes/suffixes like "Inc", "LLC", "Corp", "Careers", "Talent Acquisition".
3. "role" (string): The standardized job position title (e.g., "Data Engineer", "Senior Analytics Engineer", "Software Engineer", "Business Analyst", "Data Scientist"). Strip email artifacts like "Fwd:", "Re:", "Job Opening:". If general, output "General Application".
4. "status" (string): Exactly one of the 6 canonical stages:
   - "offered": Formal employment offer, compensation package, or offer letter extended.
   - "interviewed": Scheduled or confirmed live human conversation (phone screen, technical interview, panel, hiring manager screen, Zoom/Meet call) OR technical assessments / online coding tests (HackerRank, TestGorilla, Codility, CodeSignal, take-home challenges).
   - "reply_needed": Requires candidate administrative action or response (direct recruiter outreach pitching role and asking for availability/rate, prescreen questionnaires, document requests).
   - "applied": Standard application acknowledgement / ATS receipt ("thank you for applying", "received your application").
   - "rejected": Formal notice of non-selection ("not moving forward", "credentials of other candidates better fit", "decided to pursue other candidates", "position has been filled", "status update - not selected").
   - "not_related": Account security OTPs, password resets, demographic surveys, Google Voice SMS, general marketing digests.
5. "confidence" (string): "high", "medium", or "low".
6. "reason" (string): Concise explanation of why this status was chosen (e.g. "Candidate rejection notice: credentials of other candidates better fit", "Application Status Update: non-selection", "Confirmed Zoom interview invitation with hiring manager", "Online technical assessment / coding challenge on HackerRank", "Application confirmation receipt from ATS").

================================================================================
SECTION 2: CANONICAL STATUS TAXONOMY & STRICT CRITERIA
================================================================================

--------------------------------------------------------------------------------
1. "offered" (Highest Stage - Official Job Offer)
--------------------------------------------------------------------------------
CRITERIA: Formal offer of employment extended (offer letters, compensation packages, signing requests via DocuSign/PandaDoc).

--------------------------------------------------------------------------------
2. "interviewed" (Confirmed Live Human Conversation OR Technical/Behavioral Assessment)
--------------------------------------------------------------------------------
CRITERIA:
- Live spoken/video conversation scheduled or confirmed (phone screens, technical panel interviews, hiring manager Zoom/Google Meet/Teams calls).
- Technical assessments, online behavioral/skill tests, take-home exercises, or asynchronous video prompts (HackerRank, TestGorilla, Outmatch, Harver, Codility, Byteboard, CodeSignal, Coderbyte, HireVue, Karat, SHL, Wonderlic, pymetrics).
- Candidate assessment invitations required to advance in the selection process (e.g. "click the link below to participate in an assessment", "Next Required Application Step ... Assessment", "Take the assessment to complete your application").

--------------------------------------------------------------------------------
3. "reply_needed" (Recruiter Outreach / Candidate Inquiry / Prescreen Forms)
--------------------------------------------------------------------------------
CRITERIA: Direct recruiter outreach pitching role and asking for availability/rate/resume, or candidate prescreen questionnaires / visa document requests.

--------------------------------------------------------------------------------
4. "applied" (Application Submission Acknowledgment)
--------------------------------------------------------------------------------
CRITERIA: Initial submission receipt acknowledging receipt of application with NO rejection decision ("Thank you for applying to [Company]", "We received your application").

--------------------------------------------------------------------------------
5. "rejected" (Terminal Negative Outcome / Not Moving Forward)
--------------------------------------------------------------------------------
CRITERIA:
- Formal notification that the candidate will not be progressing further.
- Position closed, position filled, candidate not selected after application review or after interview.
- Phrasings include:
  - "credentials of other candidates better fit the requirements"
  - "decided not to move forward with your application" / "will not be moving forward"
  - "decided to pursue other candidates" / "narrowed our search to other candidates"
  - "extremely competitive candidate pool / high volume of applications" + "unable to offer / decided not to advance"
  - "position has been filled" / "position has been cancelled" / "no longer active"
  - "keep your resume/profile on file for future openings" (when not selected for current opening)
  - "we wish you all the best in your job search" / "best of luck in your search"
  - "Application Status Update" informing candidate of non-selection.

CRITICAL PRECEDENCE RULE (REJECTION OVERRIDE RULE):
- Rejection emails frequently begin with polite opening pleasantries such as "Thank you for your interest in...", "Thank you for submitting your application...", or "We appreciate the time you took to apply...".
- If an email or note contains BOTH a polite "thank you for applying / interest" phrase AND ANY rejection or non-selection statement ("decided not to move forward", "credentials of other candidates better fit", "pursue other candidates", "position has been filled", "not selected", "wish you best in your search"), it MUST ALWAYS be classified as "rejected", NEVER "applied"! The presence of non-selection language completely supersedes application receipt phrasing.

--------------------------------------------------------------------------------
6. "not_related" (System Noise, Security, Surveys & Platform Emails)
--------------------------------------------------------------------------------
CRITERIA: OTP verification codes, password resets, EEO surveys, general job alert digests.

================================================================================
SECTION 3: FEW-SHOT EXAMPLES
================================================================================

Example 1 (Tesla Rejection - Competitive Pool / Credentials Better Fit):
- INPUT: {"id": "tesla-data-engineer", "company": "Tesla", "role": "Data Engineer", "latest_subject": "Thank you – we’ve received your Tesla application", "latest_from": "Tesla <noreply@tesla.com>", "notes": "Thank you for your interest in the Data Engineer position at Tesla. We were fortunate to have received a high volume of applications... After carefully reviewing your application, we have determined that the credentials of other candidates better fit the requirements of the position. For this reason, we have decided not to move forward with your application at this time. We wish you all the best in your job search."}
-> OUTPUT: {"id": "tesla-data-engineer", "company": "Tesla", "role": "Data Engineer", "status": "rejected", "confidence": "high", "reason": "Candidate rejection notice: credentials of other candidates better fit"}

Example 2 (CSpring Rejection - Application Status Update):
- INPUT: {"id": "cspring-general-application", "company": "Cspring", "role": "General Application", "latest_subject": "CSpring Application Status Update", "latest_from": "Greg Weisiger <reply-to-sender@mail.paylocity.com>", "notes": "CSpring Application Status Update - not moving forward with application"}
-> OUTPUT: {"id": "cspring-general-application", "company": "CSpring", "role": "General Application", "status": "rejected", "confidence": "high", "reason": "Candidate rejection notice: Application Status Update"}

Example 3 (Ashby / Talkiatry / Parafin / Livefront Rejection):
- INPUT: {"id": "talkiatry-data-engineer", "company": "Talkiatry Hiring", "role": "Data Engineer", "latest_subject": "Update from Talkiatry", "latest_from": "Talkiatry <no-reply@ashbyhq.com>", "notes": "Thank you again for your interest in Talkiatry... After careful review, we have decided not to move forward with your candidacy at this time."}
-> OUTPUT: {"id": "talkiatry-data-engineer", "company": "Talkiatry", "role": "Data Engineer", "status": "rejected", "confidence": "high", "reason": "Candidate rejection notice: decided not to move forward"}

Example 4 (Workday / PNC Position Closed / Filled):
- INPUT: {"id": "pnc-data-engineer", "company": "PNC", "role": "Data Engineer", "latest_subject": "Update on your job submission", "latest_from": "pnc@myworkday.com", "notes": "We have narrowed the search for this position to other candidates who more closely match the specific requirements. At this time the position has been filled."}
-> OUTPUT: {"id": "pnc-data-engineer", "company": "PNC", "role": "Data Engineer", "status": "rejected", "confidence": "high", "reason": "Candidate rejection notice: position filled / search narrowed"}

Example 5 (Standard Application Receipt):
- INPUT: {"id": "stripe-data-infra", "company": "Stripe", "role": "Data Infrastructure Engineer", "latest_subject": "Thank you for applying to Stripe!", "latest_from": "no-reply@us.greenhouse-mail.io", "notes": "Thanks for applying. We have received your application and our team is currently reviewing it."}
-> OUTPUT: {"id": "stripe-data-infra", "company": "Stripe", "role": "Data Infrastructure Engineer", "status": "applied", "confidence": "high", "reason": "ATS Application Receipt"}

Example 6 (Online Coding Assessment / Technical Challenge):
- INPUT: {"id": "capital-one-de", "company": "Capital One", "role": "Data Engineer", "latest_subject": "Action Required: Complete your Data Engineer Technical Assessment for Capital One", "latest_from": "HackerRank <support@hackerrank.net>", "notes": "Capital One has invited you to complete an online coding challenge on HackerRank for the Data Engineer opening. Please complete this 60-minute test within 5 days."}
-> OUTPUT: {"id": "capital-one-de", "company": "Capital One", "role": "Data Engineer", "status": "interviewed", "confidence": "high", "reason": "Online technical assessment / coding challenge on HackerRank"}

Example 7 (Next Step Online Candidate Assessment - Outmatch / Harver / HCA):
- INPUT: {"id": "hca-data-engineer", "company": "HCA Healthcare", "role": "Data Engineer - GCP", "latest_subject": "Next Required Application Step Data Engineer - GCP 4750460 at HCA Healthcare", "latest_from": "HCAJobApplication@hcacareers.com", "notes": "In order to complete your application for Data Engineer - GCP, 4750460 at HCA Healthcare you must click the link below to participate in an assessment that will help us get to know you a little better as we proceed in the selection process. It should take 30 - 45 minutes to complete. [CLICK HERE TO BEGIN ASSESSMENT]"}
-> OUTPUT: {"id": "hca-data-engineer", "company": "HCA Healthcare", "role": "Data Engineer - GCP", "status": "interviewed", "confidence": "high", "reason": "Online candidate assessment (Outmatch/Harver) required to proceed in selection process"}

Example 8 (Polite Corporate Rejection with Neutral Subject - ParetoHealth):
- INPUT: {"id": "paretohealth-data-engineer", "company": "ParetoHealth", "role": "Data Engineer", "latest_subject": "Important information about your application to ParetoHealth", "latest_from": "no-reply@paretohealth.com", "notes": "Dear Tirth, Thank you for taking the time to apply for the Data Engineer position here at ParetoHealth. After careful consideration of your application and qualifications, we regret to inform you that we have chosen to move forward with other candidates whose skills and experiences more closely align with the requirements of the role. While we are unable to offer you a position at this time, we encourage you to explore future opportunities with us. We wish you all the best in your job search."}
-> OUTPUT: {"id": "paretohealth-data-engineer", "company": "ParetoHealth", "role": "Data Engineer", "status": "rejected", "confidence": "high", "reason": "Candidate rejection notice: regret to inform chosen to move forward with other candidates"}

Example 9 (Rejection with 'Regarding your Application' Subject - Gusto):
- INPUT: {"id": "gusto-senior-data-engineer", "company": "Gusto", "role": "Senior Data Engineer", "latest_subject": "Regarding your Application to Gusto, Tirth", "latest_from": "careers@gusto.com", "notes": "Hi Tirth, Thank you for your interest in Senior Data Engineer role at Gusto. After reviewing your application, we won't be moving forward at this time. We appreciate the time you took to apply. New roles are posted regularly on our Careers Page, and we encourage you to check back. Thank you again, and best of luck in your search."}
-> OUTPUT: {"id": "gusto-senior-data-engineer", "company": "Gusto", "role": "Senior Data Engineer", "status": "rejected", "confidence": "high", "reason": "Candidate rejection notice: won't be moving forward at this time"}

CRITICAL RULE (REJECTIONS WITH NEUTRAL OR APPLICATION-LIKE SUBJECTS):
- Rejection emails often have vague, neutral, or misleading subjects like "Regarding your Application to [Company]", "Important information about your application", "Update on your application", "Thank you for applying", or "Your application status".
- ALWAYS inspect the body/notes: If the body contains "won't be moving forward", "will not be moving forward", "decided not to move forward", "regret to inform you", "chosen to move forward with other candidates", "skills and experiences more closely align with", "unable to offer you a position", "decided not to advance", or "wish you the best in your search", it is 100% "rejected", NEVER "applied"!

Example 10 (Rejection with 'After Careful Consideration' opener - 7-Eleven):
- INPUT: {"id": "7-eleven-data-engineer", "company": "7-Eleven", "role": "Data Engineer", "latest_subject": "Application Update", "latest_from": "careers@7-eleven.com", "notes": "Dear Tirth, Thank you for the time to submit your application for the Data Engineer - Mark Tech position. After careful consideration, we will not be progressing your application at this time. We appreciate your interest in joining our team and wish you the best in your job search."}
-> OUTPUT: {"id": "7-eleven-data-engineer", "company": "7-Eleven", "role": "Data Engineer", "status": "rejected", "confidence": "high", "reason": "Candidate rejection notice: after careful consideration, will not be progressing the application"}

Example 11 (Rejection with 'Thank you for applying' subject / Fieldwire):
- INPUT: {"id": "fieldwire-data-engineer", "company": "Fieldwire", "role": "Data Engineer", "latest_subject": "Important information about your application to Fieldwire", "latest_from": "talent@fieldwire.com", "notes": "Hi Tirth, Thank you for taking the time to apply for the Data Engineer position. After careful consideration, we've decided to move forward with another candidate whose experience more closely aligns with our current needs. We appreciate your interest in Fieldwire and wish you the best in your search."}
-> OUTPUT: {"id": "fieldwire-data-engineer", "company": "Fieldwire", "role": "Data Engineer", "status": "rejected", "confidence": "high", "reason": "Candidate rejection notice: decided to move forward with another candidate"}

Example 12 (Application receipt with CONDITIONAL disclaimer — NOT a rejection - JBS International):
- INPUT: {"id": "jbs-international-data-ops", "company": "JBS International", "role": "Data Operations Specialist", "latest_subject": "Application Received for Data Operations Specialist with JBS International", "latest_from": "careers@jbsinternational.com", "notes": "Dear Tirth, Thank you for applying to Data Operations Specialist with JBS International. Your candidacy will be reviewed by the hiring team. If you have not heard from the hiring team or the position is no longer listed on our careers page, it means the hiring team has either decided to pursue other candidates that more closely align to their needs, or the position has been filled or canceled."}
-> OUTPUT: {"id": "jbs-international-data-ops", "company": "JBS International", "role": "Data Operations Specialist", "status": "applied", "confidence": "high", "reason": "Application receipt — rejection phrase is inside a hypothetical conditional clause (if you do not hear from us), not a definitive decision"}

CRITICAL RULE (EXHAUSTIVE GUIDE TO REJECTION 'SOFT LINES' & CORPORATE EUPHEMISMS):
Rejection emails almost NEVER use harsh words like 'rejected' or 'denied'. Instead, companies use courteous, diplomatic, and softened phrasing. You MUST classify ANY email containing any of the following soft lines or euphemisms as "rejected", even if the subject is neutral or polite (e.g. "Application Update", "Regarding your Application", "Thank you for applying"):

1. 'FIT' & 'AT THIS TIME' SOFT LINES:
   - "there isn't a fit at this time" / "not a fit at this time" / "not the right fit" / "not a match for this role"
   - "we will not be moving forward with your candidacy" / "won't be moving forward with your application"
   - "won't be able to continue with your candidacy at this time" / "not able to continue with your application"
   - "we've decided that we will not move you forward in the hiring process" / "will not be progressing your application"
   - "decided not to advance your application" / "decided against continuing"

2. 'OTHER CANDIDATES / CLOSER ALIGNMENT' EUPHEMISMS:
   - "chosen to move forward with other candidates whose skills and experiences more closely align"
   - "decided to move forward with candidates whose experience is more closely aligned"
   - "moving forward with another candidate whose background is a closer match"
   - "decided to pursue other candidates at this time" / "will be pursuing other applicants"
   - "selected other candidates who more closely meet our current needs"
   - "proceeding with a subset of candidates who better align with what we are looking for"

3. 'CAREFUL CONSIDERATION' OPENERS:
   - "After careful consideration of your application / background, we have decided..."
   - "After careful review of your qualifications, we will not be..."
   - "After reviewing your materials / submission, we've determined that..."

4. 'COMPLIMENT + LET DOWN' DIPLOMATIC PHRASING:
   - "Although your background is impressive, we regret to inform you that..."
   - "While your qualifications are strong, we have chosen..."
   - "In the spirit of transparency, we wanted to let you know that we have had a number of qualified applicants and we won't be able to..."
   - "This decision was not made lightly, given the strength of the applicant pool..."
   - "Due to an overwhelming response / competitive selection process, we cannot offer you an interview..."

5. 'FUTURE OPPORTUNITIES / KEEP ON FILE' SOFT CLOSINGS:
   - "While we are unable to offer you a position at this time, we encourage you to explore future opportunities"
   - "We will keep your resume / profile on file in our database for future openings"
   - "We wish you all the best in your job search and future endeavors"
   - "We hope our paths cross again soon" / "wishing you the best in your search"

6. 'SCREENING / ELIGIBILITY' SOFT NOTICES:
   - "One or more responses you provided to screening questions has deemed you ineligible for the role"
   - "Due to work authorization / visa / export control requirements, we are unable to consider your candidacy"

CRITICAL RULE — EXCEPTION (CONDITIONAL DISCLAIMERS IN RECEIPTS):
- Do NOT classify as rejected if the rejection phrase appears INSIDE a hypothetical or conditional clause in an application receipt:
  - "If you do not hear from us within 30 days, it is likely that we have decided to move forward with other candidates..."
  - "If the position is no longer listed, it means the hiring team has decided to pursue other candidates..."
  - "If you are not selected for this position, please keep an eye on our jobs page..."
  - "We will be in touch only if your qualifications match..."
  In these cases, the email is an initial receipt. Classify as "applied".

CRITICAL RULE (ASSESSMENTS VS REPLY NEEDED):
- Any email directing the candidate to take an online assessment, coding challenge, screening quiz, or video response test MUST ALWAYS be classified as "interviewed", NEVER "reply_needed" or "applied"!
- "reply_needed" is strictly reserved for human recruiter emails asking for text responses (e.g., salary expectation, work authorization, availability to chat).

================================================================================
OUTPUT FORMAT:
Output ONLY valid JSON matching this schema:
{
  "results": [
    {
      "id": "app_id",
      "company": "Clean Company Name",
      "role": "Standardized Role Title",
      "status": "applied | reply_needed | interviewed | offered | rejected | not_related",
      "confidence": "high | medium | low",
      "reason": "Clear explanation of the AI decision"
    }
  ]
}
`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { applications, model } = req.body || {};
  if (!applications || !Array.isArray(applications) || applications.length === 0) {
    return res.status(400).json({ error: "applications array is required in request body" });
  }

  // Check OpenRouter API key from server environment or client header
  const customKey = req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, "") : null;
  const apiKey = customKey || process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY_2 || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENROUTER_API_KEY is not configured in Vercel Environment Variables. " +
        "Please add OPENROUTER_API_KEY in Vercel Dashboard → Project Settings → Environment Variables."
    });
  }

  const chosenModel = model || process.env.OPENROUTER_MODEL || "google/gemini-3.7-flash";

  // Build input payload for LLM
  const inputPayload = applications.map((app) => ({
    id: app.id,
    company: app.company,
    role: app.role,
    current_status: app.status,
    latest_subject: app.latestSubject || app.subject || "",
    latest_from: app.latestFrom || app.from || "",
    email_body_snippet: (app.notes || app.email_body || app.snippet || "").slice(0, 3000),
    notes: (app.notes || "").slice(0, 3000)
  }));

  try {
    let aiResponse;
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      aiResponse = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/Tirth-1999/Job_Tracker",
          "X-Title": "Job Tracker Master AI Auditor"
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Analyze and classify the following batch of ${inputPayload.length} job applications:\n${JSON.stringify(inputPayload, null, 2)}`
            }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      });

      if (aiResponse.status === 429 && attempts < 3) {
        await new Promise((r) => setTimeout(r, 1500 * attempts));
        continue;
      }
      break;
    }

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return res.status(aiResponse.status).json({
        error: `OpenRouter API returned HTTP ${aiResponse.status}: ${errText}`
      });
    }

    const aiJson = await aiResponse.json();
    const rawContent = aiJson.choices?.[0]?.message?.content || "{}";

    let parsedResults = [];
    try {
      const parsed = JSON.parse(rawContent);
      parsedResults = parsed.results || parsed.applications || (Array.isArray(parsed) ? parsed : []);
    } catch (parseErr) {
      // Fallback regex extractor if LLM returned markdown codeblock
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        parsedResults = parsed.results || parsed.applications || [];
      }
    }

    return res.status(200).json({
      success: true,
      model_used: chosenModel,
      usage: aiJson.usage || null,
      results: parsedResults
    });
  } catch (err) {
    return res.status(500).json({
      error: `Server error executing AI Reclassification: ${err.message}`
    });
  }
}
