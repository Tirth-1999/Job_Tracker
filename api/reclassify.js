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
   - "interviewed": Scheduled or confirmed live human conversation (phone screen, technical interview, panel, hiring manager screen, Zoom/Meet call).
   - "reply_needed": Requires candidate action (direct recruiter outreach pitching role and asking for availability/rate, online coding assessments like HackerRank/TestGorilla, prescreen forms, document requests).
   - "applied": Standard application acknowledgement / ATS receipt ("thank you for applying", "received your application").
   - "rejected": Formal notice of non-selection ("not moving forward", "decided to pursue other candidates", "position has been filled").
   - "not_related": Account security OTPs, password resets, demographic surveys, Google Voice SMS, general marketing digests.
5. "confidence" (string): "high", "medium", or "low".
6. "reason" (string): Concise explanation of why this status was chosen (e.g. "Direct recruiter outreach from staffing agency asking for availability", "Confirmed Zoom interview invitation with hiring manager", "Application confirmation receipt from ATS", "Candidate rejection notice").

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
    notes: app.notes || ""
  }));

  try {
    const aiResponse = await fetch(OPENROUTER_API_URL, {
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
