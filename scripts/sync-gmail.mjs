import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

// Auto-load local .env file if present
if (fsSync.existsSync(".env")) {
  const envContent = fsSync.readFileSync(".env", "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const DATA_PATH = path.resolve("data/applications.json");
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash-lite";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const AI_BATCH_SIZE = Number(process.env.AI_BATCH_SIZE || process.env.GEMINI_BATCH_SIZE || "20");
const ALLOWED_STATUSES = new Set(["applied", "reply_needed", "interviewed", "offered", "rejected", "not_related"]);

const DEFAULT_RECENT_QUERY = [
  "(",
  "from:(lever.co OR greenhouse-mail.io OR ashbyhq.com OR myworkday.com OR smartrecruiters.com OR workablemail.com OR icims.com OR bamboohr.com OR dover.com OR applytojob.com OR comeet-notifications.com OR careers OR recruiting OR talent OR hiring OR jobs)",
  "OR subject:(apply OR applied OR application OR interview OR recruiter OR candidate OR career OR \"next steps\" OR offer OR screening OR assessment OR \"update on\" OR status)",
  ")",
  "-subject:(otp OR \"verification code\" OR \"security code\" OR password OR receipt OR invoice OR \"welcome to chat\")"
].join(" ");

const DEFAULT_BACKFILL_QUERY = [
  "(",
  "from:(lever.co OR greenhouse-mail.io OR ashbyhq.com OR myworkday.com OR smartrecruiters.com OR workablemail.com OR icims.com OR bamboohr.com OR dover.com OR applytojob.com OR comeet-notifications.com OR careers OR recruiting OR talent OR hiring OR jobs)",
  "OR subject:(apply OR applied OR application OR interview OR recruiter OR candidate OR career OR \"next steps\" OR offer OR screening OR assessment OR \"update on\" OR status)",
  ")",
  "-subject:(otp OR \"verification code\" OR \"security code\" OR password OR receipt OR invoice OR subscription OR 2fa OR \"welcome to chat\")"
].join(" ");

const NOISE_SUBJECT_PATTERNS = [
  /\b(otp|one-time password|verification code|security code|2fa|two-factor)\b/i,
  /\b(reset your password|sign-in code|login code|verify your email|verify your account)\b/i,
  /\b(receipt|invoice|subscription renewal|sale ends|limited time offer|welcome to chat)\b/i
];

async function main() {
  const data = await readData();
  const resetData = process.env.GMAIL_RESET_DATA === "true";
  if (resetData) {
    data.applications = [];
    data.lastHistoryId = null;
  }

  const token = await getAccessToken();
  const messages = await listMessages(token);
  const seenMessageIds = new Set(data.applications.flatMap((app) => app.gmailMessageIds ?? []));
  const unhandledMessages = messages.filter((m) => !seenMessageIds.has(m.id));

  console.log(`Discovered ${messages.length} total messages (${unhandledMessages.length} new/unprocessed).`);

  if (!unhandledMessages.length && !resetData) {
    console.log("No new Gmail messages to process.");
    return;
  }

  // 1. Download email bodies in safe parallel chunks (8 concurrent)
  console.log(`Fetching ${unhandledMessages.length} emails in parallel...`);
  const CHUNK_SIZE = 8;
  const allFetched = [];
  for (let i = 0; i < unhandledMessages.length; i += CHUNK_SIZE) {
    const chunk = unhandledMessages.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (ref) => {
        try {
          const message = await getMessage(token, ref.id);
          const parsed = parseMessage(message);
          return { message, parsed };
        } catch (err) {
          console.warn(`Failed to fetch message ${ref.id}:`, err.message);
          return null;
        }
      })
    );
    allFetched.push(...chunkResults.filter(Boolean));
    if (i + CHUNK_SIZE < unhandledMessages.length) {
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  // 2. Filter obvious noise
  const candidateItems = allFetched.filter(
    (item) => item.parsed && !isObviousNoise(item.parsed.subject)
  );

  console.log(`Analyzing ${candidateItems.length} candidate job emails with AI...`);

  const keys = getAiApiKeys();
  const rotator = keys.length > 0 ? new KeyRotator(keys) : null;
  let extractedItems = [];

  // 3. Run AI classification on candidate items in parallel batches
  if (rotator && candidateItems.length > 0) {
    try {
      extractedItems = await extractAndClassifyWithAI(candidateItems, rotator);
    } catch (err) {
      console.warn("AI extraction failed, falling back to heuristics:", err.message);
      extractedItems = candidateItems.map(extractWithHeuristics);
    }
  } else {
    extractedItems = candidateItems.map(extractWithHeuristics);
  }

  // 4. Upsert into dataset
  let totalSaved = 0;
  let changed = resetData;

  for (const item of extractedItems) {
    if (!item || item.status === "ignore" || !item.company || isGenericCompany(item.company)) {
      continue;
    }

    upsertApplication(data, {
      id: makeApplicationId(item.company, item.role),
      company: item.company,
      role: item.role || "General Application",
      status: item.status,
      confidence: item.confidence || "medium",
      classifier: item.classifier || "openrouter",
      reason: item.reason || "",
      latestSubject: item.parsed.subject,
      latestFrom: item.parsed.from,
      lastActivityAt: item.parsed.date,
      source: "gmail",
      gmailThreadId: item.message.threadId,
      gmailMessageIds: [item.message.id],
      notes: ""
    });
    changed = true;
    totalSaved += 1;
  }

  if (changed) {
    data.applications = cleanupApplications(data.applications);
    data.updatedAt = new Date().toISOString();
    await fs.writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`\nSuccessfully updated applications dataset! Processed ${unhandledMessages.length} emails, saved/updated ${totalSaved} active applications.`);
  } else {
    console.log(`No new matching applications found among ${unhandledMessages.length} emails.`);
  }
}

async function readData() {
  const raw = await fs.readFile(DATA_PATH, "utf8");
  const data = JSON.parse(raw);
  data.applications ??= [];
  return data;
}

async function getAccessToken() {
  const required = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
  }

  const body = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID,
    client_secret: process.env.GMAIL_CLIENT_SECRET,
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });

  const response = await fetch(TOKEN_URL, { method: "POST", body });
  if (!response.ok) throw new Error(`Token refresh failed: ${response.status} ${await response.text()}`);
  const json = await response.json();
  return json.access_token;
}

async function listMessages(token) {
  const isBackfill = process.env.GMAIL_BACKFILL === "true";
  const fetchAll = process.env.GMAIL_FETCH_ALL !== "false";
  const query = process.env.GMAIL_QUERY || (fetchAll ? "" : (isBackfill ? DEFAULT_BACKFILL_QUERY : DEFAULT_RECENT_QUERY));
  const maxResults = 500;
  const maxPages = Number(process.env.GMAIL_MAX_PAGES || "20");
  const messages = [];
  let pageToken = process.env.GMAIL_PAGE_TOKEN || "";

  console.log(`🔍 Listing Gmail messages (query: "${query || 'ALL MAIL'}")...`);

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`${GMAIL_API}/messages`);
    url.searchParams.set("maxResults", String(maxResults));
    if (query) url.searchParams.set("q", query);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await gmailFetch(token, url);
    const json = await response.json();
    messages.push(...(json.messages ?? []));

    console.log(`Page ${page + 1}: retrieved ${json.messages?.length || 0} messages (total: ${messages.length})`);

    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }

  // Deduplicate message references by ID
  const uniqueMessages = [...new Map(messages.map((m) => [m.id, m])).values()];
  console.log(`Fetched ${uniqueMessages.length} total unique message references from Gmail.`);
  return uniqueMessages;
}

async function getMessage(token, id) {
  const url = new URL(`${GMAIL_API}/messages/${id}`);
  url.searchParams.set("format", "full");
  const response = await gmailFetch(token, url);
  return response.json();
}

async function gmailFetch(token, url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 429 && attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`Gmail API failed: ${response.status} ${await response.text()}`);
    return response;
  }
}

function parseMessage(message) {
  const headers = Object.fromEntries((message.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const subject = headers.subject ?? "";
  const from = headers.from ?? "";
  const date = headers.date ? new Date(headers.date).toISOString() : new Date(Number(message.internalDate)).toISOString();
  const body = extractBody(message.payload);

  return { subject, from, date, body };
}

function extractBody(part) {
  if (!part) return "";
  const chunks = [];
  collectTextParts(part, chunks);
  return chunks.join("\n").replace(/\s+/g, " ").slice(0, 4000);
}

function collectTextParts(part, chunks) {
  if (part.mimeType === "text/plain" && part.body?.data) {
    chunks.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
  }
  for (const child of part.parts ?? []) collectTextParts(child, chunks);
}

function isObviousNoise(subject) {
  return NOISE_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
}

function getAiApiKeys() {
  const rawKeys = [
    ...(process.env.OPENROUTER_API_KEYS ? process.env.OPENROUTER_API_KEYS.split(/[,;\s]+/) : []),
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3,
    ...(process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(/[,;\s]+/) : []),
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2
  ];

  return [...new Set(rawKeys.map((k) => k?.trim()).filter(Boolean))];
}

class KeyRotator {
  constructor(keys) {
    this.keys = keys;
    this.currentIndex = 0;
  }

  get hasKeys() {
    return this.keys.length > 0;
  }

  nextKey() {
    if (!this.keys.length) return null;
    const key = this.keys[this.currentIndex % this.keys.length];
    const index = this.currentIndex % this.keys.length;
    this.currentIndex += 1;
    return { key, index };
  }

  async callWithFailover(makeRequestFn) {
    let lastError = null;
    const totalKeys = this.keys.length;

    for (let attempt = 0; attempt < totalKeys; attempt += 1) {
      const { key, index } = this.nextKey();
      try {
        return await makeRequestFn(key, index);
      } catch (err) {
        lastError = err;
        console.warn(`AI key #${index + 1} encountered an issue: ${err.message}. Rotating to next key...`);
      }
    }
    throw lastError || new Error("All AI API keys in the pool failed.");
  }
}

async function processCandidateMessages(items) {
  if (!items.length) return [];

  const keys = getAiApiKeys();
  if (keys.length > 0) {
    try {
      console.log(`Using ${keys.length} AI API key(s) with OpenRouter / AI layer for max throughput & failover.`);
      const rotator = new KeyRotator(keys);
      return await extractAndClassifyWithAI(items, rotator);
    } catch (error) {
      console.warn("AI batch extraction failed, falling back to heuristics:", error.message);
    }
  } else {
    console.log("No AI API keys set (OPENROUTER_API_KEY / GEMINI_API_KEY). Using rule heuristics fallback.");
  }

  return items.map((item) => extractWithHeuristics(item));
}

const STRUCTURED_JSON_SCHEMA = {
  name: "job_application_batch",
  strict: true,
  schema: {
    type: "object",
    properties: {
      applications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            is_job: { type: "boolean" },
            company: { type: "string" },
            role: { type: "string" },
            status: {
              type: "string",
              enum: ["applied", "reply_needed", "interviewed", "offered", "rejected", "not_related"]
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"]
            }
          },
          required: ["id", "is_job", "company", "role", "status", "confidence"],
          additionalProperties: false
        }
      }
    },
    required: ["applications"],
    additionalProperties: false
  }
};

async function extractAndClassifyWithAI(items, rotator) {
  const batches = [];
  for (let i = 0; i < items.length; i += AI_BATCH_SIZE) {
    batches.push(items.slice(i, i + AI_BATCH_SIZE));
  }

  const systemPrompt = `
You are the World's Foremost Principal AI Recruitment Auditor and Talent Acquisition Systems Architect.
Your task is to analyze candidate mailbox messages, parse ATS artifacts, and classify recruiting communications with 100% semantic accuracy.

================================================================================
SECTION 1: CORE OUTPUT FIELDS SPECIFICATION
================================================================================
For every input email, you must extract:
1. "is_job" (boolean): True if this email relates in any way to employment, staffing, job applications, recruiting, candidate screening, interviews, offers, or career opportunities. False if entirely personal, spam, or non-career related.
2. "company" (string): The true hiring employer, recruiting firm, or corporate entity.
   - CRITICAL ATS EXTRACTION RULE: NEVER output software platform vendors (e.g., "Workday", "Greenhouse", "Lever", "Ashby", "SmartRecruiters", "iCIMS", "Taleo", "BambooHR", "ADP", "ClearCompany", "BrassRing", "Ceipal", "Jobvite"). Look into the email domain, sender display name, subject, or text to extract the true client/employer (e.g. from "exvu.fa.sender@oracle.gmfinancial.com" -> extract "General Motors Financial"; from "rideuta@myworkday.com" -> extract "Utah Transit Authority"; from "newscorp@otp.workday.com" -> extract "News Corp").
   - If a staffing agency / consultancy pitches a role (e.g., from "@clifyx.com", "@akraya.com", "@lancesoft.com", "@pyramidci.com", "@apolisrises.net", "@infowaygroup.com"), extract the agency/consultancy name (or target client if clearly stated).
   - Clean company names: strip prefixes/suffixes like "Inc", "LLC", "Corp", "Corporation", "Careers", "Talent Acquisition", "Recruiting Team", "Hiring Team".
3. "role" (string): The standardized job position title.
   - Clean role names: "Data Engineer", "Senior Analytics Engineer", "Software Engineer", "Business Analyst", "Data Scientist", "Solutions Architect", "Machine Learning Engineer".
   - Strip subject noise: remove "Fwd:", "Re:", "We're Hiring!", "Job Opening:", "Opportunity at", "Urgent Requirement:", "Application Next Steps for", "Action Required:".
   - If no specific job role is mentioned in an account registration or general recruiter email, output "General Application".
4. "status" (string): Exactly one of the 6 canonical stages:
   - "offered"
   - "interviewed"
   - "reply_needed"
   - "applied"
   - "rejected"
   - "not_related"
5. "confidence" (string): "high", "medium", or "low".

================================================================================
SECTION 2: CANONICAL STATUS TAXONOMY & STRICT CRITERIA
================================================================================

--------------------------------------------------------------------------------
1. "offered" (Highest Stage - Official Job Offer)
--------------------------------------------------------------------------------
CRITERIA:
- The candidate has been selected and extended a formal offer of employment.
- Contains employment agreements, formal offer letters, compensation packages (base salary, hourly rate, bonus, equity/RSUs), offer rollout paperwork, or electronic signature requests (DocuSign, PandaDoc, Adobe Sign).
EXAMPLES:
- "Congratulations! Offer of Employment from [Company]"
- "Your Offer Letter from [Company] is ready for review on PandaDoc"
- "[Company] - Formal Offer Rollout & Next Steps for Employment"
- "Attached: Offer details, compensation package, and benefits breakdown"
ANTI-PATTERNS (DO NOT CLASSIFY AS "offered"):
- "We offer competitive salary and full medical benefits in this role" inside a cold pitch -> This is a job description, NOT an offer extended to candidate!
- "We are offering an online webinar" -> This is marketing spam.

--------------------------------------------------------------------------------
2. "interviewed" (Confirmed Live Human Conversation)
--------------------------------------------------------------------------------
CRITERIA:
- A live spoken or video conversation with a human interviewer has been scheduled or invited.
- Recruiter phone screens, technical panel rounds, hiring manager video interviews (Zoom, Google Meet, Microsoft Teams, Webex), onsite interview agendas, or live calendar scheduling links (Calendly, GoodTime, Prelude, Cronofi).
EXAMPLES:
- "Invitation to Interview: Video Screen with Technical Hiring Manager"
- "Schedule your 30-minute phone screen with [Company] Recruiting"
- "Your interview with [Company] is confirmed for [Date/Time] on Google Meet"
- "Next Round: Virtual Technical Panel Interview Agenda"
ANTI-PATTERNS (DO NOT CLASSIFY AS "interviewed"):
- Automated, asynchronous coding tests or recorded one-way video prompts where no human is live on the call (e.g., HackerRank, TestGorilla, HireVue asynchronous recording) -> Belongs in "reply_needed".

--------------------------------------------------------------------------------
3. "reply_needed" (Explicit Candidate Action / Response Required)
--------------------------------------------------------------------------------
CRITERIA:
Any recruitment communication that requires the candidate to take action, reply, provide information, or complete a task. Covers 4 distinct sub-categories:

A. Direct Recruiter Outreach & Inquiries:
   - A technical recruiter, headhunter, or sourcing specialist writes directly to the candidate pitching a job opportunity and explicitly asking for availability, resume, interest, or rate.
   - Examples: "Are you open to new opportunities?", "We reviewed your profile and have an urgent contract opening. Let me know if you are interested in discussing.", "Following up on the Data Engineer role in Richardson, TX - please share your updated resume and phone number."

B. Technical Assessments & Online Coding Tests:
   - Automated online coding tests, take-home exercises, skill challenges, or cognitive assessments sent to the candidate.
   - Platforms: HackerRank, TestGorilla, Codility, Byteboard, CodeSignal, Coderbyte, IBM Assessments, Red Bull Wingfinder, Glider AI, Karat, SHL.
   - Examples: "Action Required: Complete your Online Technical Assessment", "You have been invited to take the [Company] Coding Challenge", "Emergent Online Assessment Invite via TestGorilla".

C. Candidate Prescreen Forms, Questionnaires & Document Requests:
   - Action items sent by companies requesting additional candidate data to advance the application.
   - Examples: "Complete your Meta prescreen form", "Additional Information Needed - [Company] Talent Acquisition", "Next Required Application Step", "Action Needed to Complete Your Application", "Please upload your work authorization / visa documents".

D. Recruiter Follow-ups / Clarifications:
   - Inquiries asking to confirm location preference, expected compensation, work authorization status (US Citizen / Green Card / STEM OPT / H1B), or earliest start date.

ANTI-PATTERNS (DO NOT CLASSIFY AS "reply_needed"):
- Standard submission receipts ("Thank you for applying - we received your submission") with no assessment or requested action -> MUST be "applied".
- One-Time Password (OTP) security codes, login verification codes, or password setup emails -> MUST be "not_related".

--------------------------------------------------------------------------------
4. "applied" (Application Submission Acknowledgment)
--------------------------------------------------------------------------------
CRITERIA:
- Standard automated confirmation emails received immediately after submitting an application through a company career portal or job board.
EXAMPLES:
- "Thank you for applying to [Role] at [Company]"
- "We have received your application for [Role]"
- "Your application to [Company] has been successfully submitted"
- "Application Confirmation - [Company] Careers"
- "Thanks for your interest in joining [Company]!"

--------------------------------------------------------------------------------
5. "rejected" (Terminal Negative Outcome / Not Moving Forward)
--------------------------------------------------------------------------------
CRITERIA:
- Explicit formal notification that the application or candidacy will not be progressing further.
- Position closed, position cancelled, or candidate not selected after review or interview.
EXAMPLES:
- "Update on your application to [Company]" ("...after careful consideration, we have decided to pursue other candidates...")
- "Thank you for interviewing with [Company] - unfortunately, we are not moving forward at this time"
- "The position of [Role] has been filled / cancelled"
- "We will keep your resume on file for future openings"

--------------------------------------------------------------------------------
6. "not_related" (System Noise, Security, Surveys & Platform Emails)
--------------------------------------------------------------------------------
CRITERIA:
Emails that do not represent an actionable stage in the job search pipeline:

A. Authentication & Security:
   - One-Time Passwords (OTPs), 2-Factor Authentication (2FA) verification codes, candidate account verification codes (Workday OTP, Greenhouse security codes, Taleo verification, Oracle identity confirmation, Paycom password setup, password reset links).

B. Surveys & Feedback:
   - Voluntary Equal Employment Opportunity (EEO) demographic surveys, diversity questionnaires, candidate experience surveys, feedback forms ("How was your application experience?").

C. Platform Notifications, Newsletters & Spam:
   - Job board digests ("10 new Data Engineer jobs in your area"), LinkedIn job alerts, Glassdoor newsletter, promotional sales emails, Google account security alerts, Google Cloud trial notices, delivery failure / bounce notifications, Google Voice incoming text messages without full job context.

================================================================================
SECTION 3: FEW-SHOT PARSING EXAMPLES ACROSS DIVERSE PATTERNS
================================================================================

Example 1: Direct Recruiter Pitch (Staffing Agency)
- FROM: "Recruiter Name <recruiter@clifyx.com>"
- SUBJECT: "SQL / Python Data Engineer - 12+ month Contract - Richardson TX"
- SNIPPET: "Hi Candidate, I am a technical recruiter at ClifyX. We have an immediate requirement with our client for a Senior Data Engineer. Please let me know if you are available to connect today."
-> OUTPUT: {"is_job": true, "company": "ClifyX", "role": "Data Engineer", "status": "reply_needed", "confidence": "high"}

Example 2: Online Coding Assessment
- FROM: "IBM Talent Acquisition <talent@ibm.com>"
- SUBJECT: "Action Required: IBM Coding Assessment for completion - Associate Data Engineer"
- SNIPPET: "Please complete your coding assessment within 7 days using the following link on HackerRank."
-> OUTPUT: {"is_job": true, "company": "IBM", "role": "Associate Data Engineer", "status": "reply_needed", "confidence": "high"}

Example 3: ATS Application Confirmation
- FROM: "Stripe Careers <no-reply@us.greenhouse-mail.io>"
- SUBJECT: "Thank you for applying to Stripe!"
- SNIPPET: "Hi Candidate, Thanks for applying for the Data Infrastructure Engineer position. We have received your application and our team is currently reviewing it."
-> OUTPUT: {"is_job": true, "company": "Stripe", "role": "Data Infrastructure Engineer", "status": "applied", "confidence": "high"}

Example 4: Workday Account Verification (OTP / Security Noise)
- FROM: "workday.hr newscorp <newscorp@otp.workday.com>"
- SUBJECT: "Verify your candidate account"
- SNIPPET: "Your one-time verification security code is 849204. Enter this code to access your candidate home."
-> OUTPUT: {"is_job": false, "company": "News Corp", "role": "General Application", "status": "not_related", "confidence": "high"}

Example 5: Interview Invitation
- FROM: "Talent Team <recruiting@atc.com>"
- SUBJECT: "Interview Invitation: Video Technical Screening with ATC"
- SNIPPET: "We would like to invite you to a 45-minute technical video interview with our lead data architect. Please select a time on our calendar link."
-> OUTPUT: {"is_job": true, "company": "ATC", "role": "Data Engineer", "status": "interviewed", "confidence": "high"}

Example 6: Official Job Offer Letter
- FROM: "HR Director <hr@company.com>"
- SUBJECT: "Offer of Employment - Senior Data Engineer"
- SNIPPET: "We are thrilled to offer you the position of Senior Data Engineer at [Company]. Please review the attached offer letter and compensation agreement."
-> OUTPUT: {"is_job": true, "company": "Company", "role": "Senior Data Engineer", "status": "offered", "confidence": "high"}

Example 7: Formal Rejection Notice
- FROM: "Spotify Talent <no-reply@spotify.com>"
- SUBJECT: "Update on your Spotify application"
- SNIPPET: "Thank you for your interest in Spotify. While your background is impressive, we have decided to move forward with other candidates whose experience more closely matches this opening."
-> OUTPUT: {"is_job": true, "company": "Spotify", "role": "Data Engineer", "status": "rejected", "confidence": "high"}

Example 8: Candidate Questionnaire / Prescreen Form
- FROM: "The Recruiting team at Meta <registration@facebookmail.com>"
- SUBJECT: "Complete your Meta prescreen form"
- SNIPPET: "Action required: To proceed with your candidacy for Data Engineer, please complete our voluntary prescreen form."
-> OUTPUT: {"is_job": true, "company": "Meta", "role": "Data Engineer", "status": "reply_needed", "confidence": "high"}

================================================================================
SECTION 4: EXECUTION
================================================================================
Carefully evaluate the provided batch of emails according to all the above rules and output strictly valid JSON matching the schema.
`.trim();

  // Run all AI batches concurrently in parallel across keys
  const batchPromises = batches.map(async (batch, batchIndex) => {
    const batchPromptPayload = batch.map((item) => ({
      id: item.message.id,
      from: item.parsed.from.slice(0, 100),
      subject: item.parsed.subject.slice(0, 140),
      snippet: item.parsed.body.slice(0, 500)
    }));

    try {
      const parsedBatch = await rotator.callWithFailover(async (apiKey, keyIndex) => {
        if (apiKey.startsWith("sk-or-") || process.env.OPENROUTER_API_KEY || !apiKey.startsWith("AIza")) {
          // OpenRouter Structured JSON Call
          const response = await fetch(OPENROUTER_API_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://github.com/Tirth-1999/Job_Tracker",
              "X-Title": "Job Tracker"
            },
            body: JSON.stringify({
              model: OPENROUTER_MODEL,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Extract emails:\n${JSON.stringify(batchPromptPayload)}` }
              ],
              response_format: {
                type: "json_schema",
                json_schema: STRUCTURED_JSON_SCHEMA
              },
              temperature: 0
            })
          });

          if (!response.ok) {
            throw new Error(`OpenRouter HTTP ${response.status}: ${await response.text()}`);
          }

          const json = await response.json();
          const rawContent = json.choices?.[0]?.message?.content ?? "{}";
          return parseJsonResponse(rawContent);
        } else {
          // Direct Gemini API call with structured schema
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
          const payload = {
            contents: [
              {
                role: "user",
                parts: [{ text: `${systemPrompt}\nEmails:\n${JSON.stringify(batchPromptPayload)}` }]
              }
            ],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 2000,
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  applications: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        id: { type: "STRING" },
                        is_job: { type: "BOOLEAN" },
                        company: { type: "STRING" },
                        role: { type: "STRING" },
                        status: {
                          type: "STRING",
                          enum: ["applied", "reply_needed", "interviewed", "offered", "rejected", "not_related"]
                        },
                        confidence: {
                          type: "STRING",
                          enum: ["high", "medium", "low"]
                        }
                      },
                      required: ["id", "is_job", "company", "role", "status", "confidence"]
                    }
                  }
                },
                required: ["applications"]
              }
            }
          };

          const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            throw new Error(`Gemini HTTP ${response.status}: ${await response.text()}`);
          }

          const json = await response.json();
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
          return parseJsonResponse(text);
        }
      });

      const parsedMap = new Map((Array.isArray(parsedBatch) ? parsedBatch : []).map((p) => [p.id, p]));
      const batchResults = [];

      for (const item of batch) {
        const aiResult = parsedMap.get(item.message.id);
        const isJob = aiResult?.is_job ?? aiResult?.is_job_application ?? false;

        if (aiResult && isJob && aiResult.status !== "not_related") {
          const cleanCompany = sanitizeCompanyName(aiResult.company);
          const cleanRoleName = sanitizeRole(aiResult.role);
          const validStatus = ALLOWED_STATUSES.has(aiResult.status) ? aiResult.status : "applied";

          batchResults.push({
            message: item.message,
            parsed: item.parsed,
            company: cleanCompany,
            role: cleanRoleName,
            status: validStatus,
            confidence: aiResult.confidence || "high",
            classifier: "openrouter",
            reason: "AI extracted"
          });
        } else if (aiResult) {
          // Uncategorized / Review lane item
          const cleanCompany = sanitizeCompanyName(aiResult.company || inferCompanyHeuristic(item.parsed.from, item.parsed.subject, item.parsed.body));
          batchResults.push({
            message: item.message,
            parsed: item.parsed,
            company: cleanCompany || "Other",
            role: sanitizeRole(aiResult.role || "General Communication"),
            status: "not_related",
            confidence: "medium",
            classifier: "openrouter",
            reason: "Review / Other"
          });
        } else {
          batchResults.push(extractWithHeuristics(item));
        }
      }
      return batchResults;
    } catch (err) {
      console.warn(`Batch ${batchIndex + 1} AI call failed, using heuristics:`, err.message);
      return batch.map(extractWithHeuristics);
    }
  });

  const resolvedBatches = await Promise.all(batchPromises);
  return resolvedBatches.flat();
}

function parseJsonResponse(raw) {
  if (!raw) return [];
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.applications)) return parsed.applications;
    if (Array.isArray(parsed.items)) return parsed.items;
    return [parsed];
  } catch (err) {
    console.warn("Failed to parse JSON response from AI:", cleaned.slice(0, 200));
    return [];
  }
}

function extractWithHeuristics(item) {
  const { subject, from, body } = item.parsed;
  const haystack = `${subject} ${body}`.toLowerCase();

  let status = "applied";
  let confidence = "low";
  let reason = "keyword heuristic";

  if (/unfortunately|not moving forward|other candidates|will not be proceeding|not selected|decided not to move forward/i.test(haystack)) {
    status = "rejected";
    confidence = "high";
    reason = "rejection keywords";
  } else if (/pleased to offer|extend an offer|offer letter|employment offer|congratulations on your offer/i.test(haystack)) {
    status = "offered";
    confidence = "high";
    reason = "offer keywords";
  } else if (/availability|schedule a call|schedule an interview|next steps|please reply|please respond/i.test(haystack)) {
    status = "reply_needed";
    confidence = "medium";
    reason = "action requested";
  } else if (/interview confirmation|interview scheduled|technical screen|phone screen|final round/i.test(haystack)) {
    status = "interviewed";
    confidence = "medium";
    reason = "interview scheduled";
  } else if (/thank you for applying|application received|received your application|your application was sent/i.test(haystack)) {
    status = "applied";
    confidence = "high";
    reason = "application confirmed";
  }

  const company = sanitizeCompanyName(inferCompanyHeuristic(from, subject, body));
  const role = sanitizeRole(inferRoleHeuristic(subject, body));

  return {
    message: item.message,
    parsed: item.parsed,
    company,
    role,
    status,
    confidence,
    classifier: "rules",
    reason
  };
}

function inferCompanyHeuristic(from, subject, body) {
  const hints = [
    /your application was sent to ([A-Z][A-Za-z0-9&.'\- ]{1,60})/i,
    /thank you for (?:your application to|applying to|applying at) ([A-Z][A-Za-z0-9&.'\- ]{1,60})/i,
    /thanks for applying to ([A-Z][A-Za-z0-9&.'\- ]{1,60})/i,
    /application (?:received|update) (?:from|for|at|with) ([A-Z][A-Za-z0-9&.'\- ]{1,60})/i,
    /(?:position|role) at ([A-Z][A-Za-z0-9&.'\- ]{1,60})/i
  ];

  for (const regex of hints) {
    const match = subject.match(regex);
    if (match?.[1]) return match[1];
  }

  const fromName = from.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim() ?? "";
  if (fromName && !isGenericCompany(fromName)) return fromName;

  return "Unknown Company";
}

function inferRoleHeuristic(subject, body) {
  const text = `${subject}\n${body}`;
  const match = text.match(/(?:for|role|position|opening|job title)[:\s]+([A-Za-z0-9,./&+\- ]{3,80})/i);
  return match?.[1] || "General Application";
}

const COMPANY_MAP = {
  "pwc": "PwC",
  "gm": "General Motors",
  "vt": "Virginia Tech",
  "hcacareers": "HCA Healthcare",
  "hca": "HCA Healthcare",
  "castletoncommoditiesnoreply myworkday": "Castleton Commodities",
  "castleton commodities": "Castleton Commodities",
  "amex": "American Express",
  "bah": "Booz Allen Hamilton",
  "booz allen": "Booz Allen Hamilton",
  "uta": "Utah Transit Authority",
  "rideuta": "Utah Transit Authority",
  "hgv": "Hilton Grand Vacations",
  "ama": "American Medical Association",
  "ama assn": "American Medical Association",
  "usc": "USC",
  "mercury insurance services, llc": "Mercury Insurance",
  "mercury insurance": "Mercury Insurance",
  "axtria, inc": "Axtria",
  "axtria": "Axtria",
  "dept®": "Dept",
  "dept": "Dept",
  "ontic technologies": "Ontic",
  "ontic": "Ontic",
  "allied onesource": "Allied OneSource",
  "allied recruiting": "Allied OneSource",
  "emergent staffing": "Emergent Software",
  "emergent software": "Emergent Software",
  "blains farm & fleet": "Blain's Farm & Fleet",
  "dma": "DMA",
  "physicians mutual insurance company": "Physicians Mutual Insurance",
  "physicians mutual": "Physicians Mutual Insurance",
  "ninjaholdings": "Ninja Holdings",
  "ninja holdings": "Ninja Holdings",
  "stellantis": "Stellantis",
  "pepsi": "PepsiCo",
  "pepsico": "PepsiCo",
  "lilly": "Eli Lilly",
  "eli lilly": "Eli Lilly"
};

function sanitizeCompanyName(company) {
  if (!company) return "Unknown Company";
  let cleaned = company
    .replace(/["'<>®™]/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/\S+@\S+/g, "")
    .replace(/\b(hiring team|careers|recruiting team|recruiting|recruiter|talent acquisition|talent|jobs|notifications|no.?reply|noreply|workday|greenhouse|lever|ashby|smartrecruiters|bamboohr|admin|inbox|human resources|the)\b/gi, "")
    .replace(/\s+(LLC|Inc|Corp|Corporation|Technologies|Services|Group|Co)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?,:;_\-]+$/, "");

  const lower = cleaned.toLowerCase();
  if (COMPANY_MAP[lower]) {
    return COMPANY_MAP[lower];
  }

  if (!cleaned || cleaned.length < 2) return "Unknown Company";
  return titleCase(cleaned).slice(0, 80);
}

function sanitizeRole(role) {
  if (!role) return "General Application";
  let cleaned = role
    .split(/[.!?\n]/)[0]
    .replace(/\s+/g, " ")
    .replace(/^(your application to|taking the time to apply to our open|applying to|applying for|application for|application to|interest in the|interest in|update on your|update on|recent job application for)\s+/i, "")
    .replace(/\s+(at|with|from)\s+[A-Z][A-Za-z0-9&.'\- ]+$/i, "")
    .replace(/\s*\(Open\)\s*$/i, "")
    .replace(/\s*\(Hybrid\)\s*$/i, "")
    .replace(/\s*\(R\d+\)\s*,?\s*/i, "")
    .replace(/\s*-\s*\d+\s*$/i, "")
    .replace(/\s+in\s+[A-Za-z\s,]+$/i, "")
    .replace(/\b(role|position)$/i, "")
    .replace(/\|\s*.*$/i, "")
    .replace(/[-–,;:\s]+$/, "")
    .trim()
    .slice(0, 80);

  if (!cleaned || cleaned.length < 2 || /^unknown$/i.test(cleaned) || /^applying$/i.test(cleaned)) {
    return "General Application";
  }
  return titleCase(cleaned);
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z0-9-]{2,}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function makeApplicationId(company, role) {
  return slugify(`${company}-${role}`);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `app-${Date.now()}`;
}

function isGenericCompany(company) {
  const normalized = String(company || "").trim().toLowerCase();
  const genericWords = new Set([
    "app", "careers", "jobs", "hire", "lever", "greenhouse", "workday", "ashby",
    "smartrecruiters", "notifications", "human resources", "inbox", "recruiting",
    "talent", "unknown company", "candidate", "mail"
  ]);
  return genericWords.has(normalized) || normalized.includes("@") || normalized.length < 2;
}

function upsertApplication(data, incoming) {
  // Check matching by threadId or canonical id
  const existing = data.applications.find(
    (app) => app.id === incoming.id || (incoming.gmailThreadId && app.gmailThreadId === incoming.gmailThreadId)
  );

  if (!existing) {
    data.applications.push(incoming);
    return;
  }

  existing.company = incoming.company || existing.company;
  if (incoming.role && incoming.role !== "General Application") {
    existing.role = incoming.role;
  }
  existing.status = incoming.status;
  existing.confidence = incoming.confidence;
  existing.classifier = incoming.classifier;
  existing.reason = incoming.reason;
  existing.latestSubject = incoming.latestSubject;
  existing.latestFrom = incoming.latestFrom;
  existing.lastActivityAt = incoming.lastActivityAt;
  existing.gmailMessageIds = [...new Set([...(existing.gmailMessageIds ?? []), ...incoming.gmailMessageIds])];
}

function cleanupApplications(applications) {
  return applications
    .filter((app) => !isGenericCompany(app.company))
    .sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
