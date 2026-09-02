import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// ─── Auto-load local .env ─────────────────────────────────────────────────────
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
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-3.7-flash";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://dykamjxudtxkwgfllxxy.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_b2SuLtxZgeR-LGQRzMa3_A_lxV0bn75";

const DRY_RUN = process.env.GMAIL_FOLLOWUP_DRY_RUN === "true";

// Follow-up threshold: days since last sent with no reply. Default = 10 business days.
const DEFAULT_THRESHOLD_BUSINESS_DAYS = Number(process.env.FOLLOWUP_THRESHOLD_DAYS || "10");

// Maximum consecutive sent messages from me at the end of thread before stopping follow-ups
const MAX_FOLLOWUPS = 2; // 0 = eligible for 1st follow-up, 1 = eligible for 2nd follow-up, >=2 = exhausted

// How far back to scan SENT folder (in days)
const SENT_LOOKBACK_DAYS = 90;

// ─── Gmail sent search query ───────────────────────────────────────────────────
const SENT_QUERY = [
  "in:sent",
  "newer_than:" + SENT_LOOKBACK_DAYS + "d",
  "(",
  "subject:(apply OR applied OR application OR interview OR recruiter OR candidate OR career OR",
  '"next steps" OR offer OR screening OR assessment OR networking OR referral OR opportunity OR',
  "data engineer OR software engineer OR analyst OR engineer OR role OR position OR opening)",
  "OR to:(recruiter OR talent OR hiring OR careers OR hr OR jobs)",
  ")"
].join(" ");

// ─── Patterns for noreply / automated senders we never follow up with ─────────
const NOREPLY_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /donotreply@/i,
  /do-not-reply@/i,
  /notifications?@/i,
  /mailer@/i,
  /postmaster@/i,
  /bounce@/i,
  /automailer@/i,
  /careers@/i,
  /jobs@/i,
  /talent@/i,
  /recruiting@/i,
  /apply@/i,
  /@lever\.co$/i,
  /@greenhouse-mail\.io$/i,
  /@ashbyhq\.com$/i,
  /@myworkday\.com$/i,
  /@smartrecruiters\.com$/i,
  /@workablemail\.com$/i,
  /@icims\.com$/i,
  /@bamboohr\.com$/i,
  /@dover\.com$/i,
  /@applytojob\.com$/i,
  /@comeet-notifications\.com$/i
];

// ─── System Prompt for AI Draft Generation ───────────────────────────────────
const DRAFT_SYSTEM_PROMPT = `
You are a professional executive communication assistant helping a data engineering candidate named Tirth follow up on job-search outreach threads.
Tirth is a skilled Data Engineer actively looking for data engineering, analytics engineering, and data platform positions.

Your task:
1. Determine if this conversation is a "dead end" where following up is inappropriate or useless.
2. If it is NOT a dead end, write a polished, high-converting follow-up email draft Tirth can copy and send.

=====================================================================
DEAD END DETECTION — return is_dead: true if ANY of the following apply:
=====================================================================
- The recipient explicitly stated they have no openings/positions available (and Tirth already acknowledged/thanked them).
- The thread contains a clear formal rejection ("decided not to move forward", "pursuing other candidates", "position has been filled", etc.).
- The other person asked not to be contacted or said they will reach out if something opens.
- The thread is completely automated (ATS receipt, system notification) with no human in the conversation.
- The thread is a newsletter, promotional digest, or platform notification.

=====================================================================
EXTRACTION GUIDELINES:
=====================================================================
- "company": Identify the employer or recruiting agency.
  * If a PRE-DETECTED COMPANY is provided in the prompt, use it unless the thread explicitly discusses a different client employer.
  * If not provided, infer the company from the recipient's email domain (e.g. from "@citi.com" -> "Citi", from "@walmart.com" -> "Walmart", from "@apexsystems.com" -> "Apex Systems", from "@teksystems.com" -> "TEKsystems", from "@insightglobal.com" -> "Insight Global").
  * Do not output "Unknown" if the company can be inferred from the recipient's corporate email domain!
- "role": Standardized job title (e.g. "Data Engineer", "Senior Data Engineer", "Analytics Engineer").
- "contact_name": The first name of the recruiter or contact (extracted from the message body greeting "Hi John" or the recipient header "John Doe <john@...>").
- "contact_email": The recipient's email address.

=====================================================================
DRAFT WRITING RULES — if is_dead: false, write a follow-up:
=====================================================================
- Keep it concise: 2 to 4 sentences maximum.
- Personalize to the specific conversation, company, role, and what was last communicated.
- Reference what was previously shared (e.g., resume sent, role discussed, connection requested).
- Do NOT invent facts, credentials, projects, or promises not mentioned in the thread.
- Do NOT use em dashes (—) anywhere in the text. Use commas or periods instead.
- Do NOT start with "I hope this email finds you well" or generic cliches.
- Do NOT use "I wanted to circle back" or "just checking in". Be purposeful, polite, and direct.
- Tone: Professional, warm, confident, human. Not overly formal or desperate.
- Output ONLY the body paragraphs of the email. Do NOT include greetings ("Hi Name,") or sign-offs ("Best, Tirth") — Tirth adds those in Gmail.

=====================================================================
OUTPUT FORMAT — respond with valid JSON only, no markdown code fences:
=====================================================================
{
  "is_dead": boolean,
  "dead_reason": "short explanation if is_dead is true, else empty string",
  "company": "company name",
  "role": "job role title",
  "contact_name": "first name of recipient",
  "contact_email": "recipient email address",
  "thread_summary": "1-2 sentence summary of this conversation",
  "ai_draft": "the follow-up email body text"
}
`.trim();

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔍 Follow-Up Scanner starting...");
  if (DRY_RUN) console.log("⚠️  DRY RUN mode — nothing will be written to Supabase.");

  const token = await getAccessToken();
  const myEmail = await getMyEmail(token);
  console.log(`📧 Authenticated as: ${myEmail}`);

  // 1. Load application dataset for thread-to-company mapping
  const appMap = await loadApplicationsMap();
  console.log(`📦 Loaded ${appMap.size} application mappings for company/role resolution.`);

  // 2. Load existing candidate status from Supabase
  const existingMap = await loadExistingCandidatesMap();
  console.log(`📋 Found ${existingMap.size} existing rows in Supabase followup_candidates.`);

  // 3. List sent messages from Gmail
  const sentMessages = await listSentMessages(token);
  console.log(`📤 Found ${sentMessages.length} sent messages matching job-search query.`);

  // 4. Group by thread ID
  const threadIds = [...new Set(sentMessages.map((m) => m.threadId).filter(Boolean))];
  console.log(`🧵 ${threadIds.length} unique threads to analyze.`);

  // 5. Analyze threads in parallel chunks
  const candidates = [];
  const THREAD_CHUNK = 8;

  for (let i = 0; i < threadIds.length; i += THREAD_CHUNK) {
    const chunk = threadIds.slice(i, i + THREAD_CHUNK);
    const results = await Promise.all(
      chunk.map((threadId) => analyzeThread(token, threadId, myEmail, appMap))
    );
    const qualified = results.filter(Boolean);
    candidates.push(...qualified);

    if (i + THREAD_CHUNK < threadIds.length) {
      await sleep(150);
    }
  }

  console.log(`\n✅ ${candidates.length} threads qualify for follow-up evaluation.`);

  if (!candidates.length) {
    console.log("No follow-up candidates found. Exiting.");
    return;
  }

  // 6. Generate AI drafts with real-time Supabase saving
  console.log("\n🤖 Generating AI drafts with real-time saving to Supabase...");
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("⚠️  No OPENROUTER_API_KEY set — cannot generate AI drafts.");
    return;
  }

  let totalDrafted = 0;
  let totalSkippedExisting = 0;
  let totalDeadEnds = 0;

  for (let idx = 0; idx < candidates.length; idx++) {
    const candidate = candidates[idx];
    const candidateId = candidate.candidateId;

    // Check if already in Supabase
    if (existingMap.has(candidateId)) {
      const existingStatus = existingMap.get(candidateId);
      if (existingStatus === "dismissed" || existingStatus === "actioned") {
        totalSkippedExisting++;
        continue;
      }
      // If already pending and has a draft, we can skip re-calling OpenRouter
      totalSkippedExisting++;
      continue;
    }

    try {
      console.log(`[${idx + 1}/${candidates.length}] Analyzing thread "${candidate.subject?.slice(0, 50)}"...`);
      const analysis = await generateDraft(candidate, apiKey);

      if (!analysis || analysis.is_dead) {
        console.log(`  ⏭  Skipping (dead end: ${analysis?.dead_reason || "closed thread"})`);
        totalDeadEnds++;
        continue;
      }

      // Merge and resolve best company & role
      const resolvedCompany = analysis.company && analysis.company !== "Unknown"
        ? analysis.company
        : candidate.knownCompany || candidate.inferredCompany || "Unknown";

      const resolvedRole = analysis.role && analysis.role !== "General"
        ? analysis.role
        : candidate.knownRole || "Data Engineer";

      const resolvedContactName = analysis.contact_name || candidate.contactName || "";
      const resolvedContactEmail = analysis.contact_email || candidate.contactEmail || "";

      const fullCandidate = {
        ...candidate,
        company: resolvedCompany,
        role: resolvedRole,
        contact_name: resolvedContactName,
        contact_email: resolvedContactEmail,
        thread_summary: analysis.thread_summary || "",
        ai_draft: analysis.ai_draft || ""
      };

      console.log(`  ✅ Draft ready: ${fullCandidate.company} | ${fullCandidate.role} (${fullCandidate.days_elapsed}d ago)`);

      // Upsert immediately to Supabase so progress is never lost!
      if (!DRY_RUN) {
        await upsertCandidates([fullCandidate]);
      }

      totalDrafted++;
    } catch (err) {
      console.warn(`  ⚠️  Draft error on thread ${candidate.threadId}: ${err.message}`);
    }

    await sleep(400);
  }

  console.log(`\n🎉 Follow-up scan complete!`);
  console.log(`   - New drafts generated & saved: ${totalDrafted}`);
  console.log(`   - Already in Supabase: ${totalSkippedExisting}`);
  console.log(`   - Dead ends skipped: ${totalDeadEnds}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getAccessToken() {
  const required = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  const body = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID,
    client_secret: process.env.GMAIL_CLIENT_SECRET,
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const res = await fetch(TOKEN_URL, { method: "POST", body });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
}

async function getMyEmail(token) {
  const res = await gmailFetch(token, new URL(`${GMAIL_API}/profile`));
  const json = await res.json();
  return json.emailAddress;
}

async function loadApplicationsMap() {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const data = JSON.parse(raw);
    const map = new Map();
    for (const app of data.applications ?? []) {
      if (app.gmailThreadId) {
        map.set(app.gmailThreadId, app);
      }
      for (const msgId of app.gmailMessageIds ?? []) {
        map.set(msgId, app);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

async function loadExistingCandidatesMap() {
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/followup_candidates`);
    url.searchParams.set("select", "id,status");

    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) return new Map();
    const rows = await res.json();
    return new Map(Array.isArray(rows) ? rows.map((r) => [r.id, r.status]) : []);
  } catch {
    return new Map();
  }
}

async function listSentMessages(token) {
  const messages = [];
  let pageToken = "";
  const maxPages = 10;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${GMAIL_API}/messages`);
    url.searchParams.set("maxResults", "500");
    url.searchParams.set("q", SENT_QUERY);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await gmailFetch(token, url);
    const json = await res.json();
    messages.push(...(json.messages ?? []));

    pageToken = json.nextPageToken;
    if (!pageToken) break;
    await sleep(100);
  }

  return messages;
}

async function analyzeThread(token, threadId, myEmail, appMap) {
  const candidateId = hashThreadId(threadId);

  let thread;
  try {
    thread = await getThread(token, threadId);
  } catch (err) {
    console.warn(`  ⚠️  Could not fetch thread ${threadId}: ${err.message}`);
    return null;
  }

  const messages = thread.messages ?? [];
  if (!messages.length) return null;

  // Sort chronologically (oldest first)
  messages.sort((a, b) => Number(a.internalDate) - Number(b.internalDate));

  // Filter A: Last message must be FROM me
  const lastMsg = messages[messages.length - 1];
  const lastHeaders = headersMap(lastMsg);
  const lastFrom = lastHeaders.from ?? "";

  if (!emailBelongsToMe(lastFrom, myEmail)) return null;

  // Filter B: Business days since last sent >= threshold
  const lastSentAt = new Date(Number(lastMsg.internalDate));
  const businessDaysElapsed = countBusinessDays(lastSentAt, new Date());

  if (businessDaysElapsed < DEFAULT_THRESHOLD_BUSINESS_DAYS) return null;

  // Filter C: Count consecutive sent messages from me at the end
  let consecutiveMine = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const from = headersMap(messages[i]).from ?? "";
    if (emailBelongsToMe(from, myEmail)) {
      consecutiveMine++;
    } else {
      break;
    }
  }

  if (consecutiveMine > MAX_FOLLOWUPS) return null; // Already followed up twice

  // Filter D: Find recipient contact info
  const firstOtherMsg = messages.find((m) => !emailBelongsToMe(headersMap(m).from ?? "", myEmail));
  const myFirstMsg = messages.find((m) => emailBelongsToMe(headersMap(m).from ?? "", myEmail));

  const otherHeader = firstOtherMsg ? headersMap(firstOtherMsg).from : headersMap(myFirstMsg ?? {}).to;
  const { name: contactName, email: contactEmail } = extractNameAndEmail(otherHeader);

  if (contactEmail && isNoreply(contactEmail)) return null;

  // Check known application dataset match
  const matchedApp = appMap.get(threadId);
  const knownCompany = matchedApp?.company || "";
  const knownRole = matchedApp?.role || "";
  const inferredCompany = inferCompanyFromDomain(contactEmail);

  const subject = headersMap(messages[0]).subject ?? "";
  const threadContext = buildThreadContext(messages, myEmail);

  return {
    threadId,
    candidateId,
    subject,
    contactName,
    contactEmail,
    knownCompany,
    knownRole,
    inferredCompany,
    followup_count: consecutiveMine - 1, // 0 = first follow-up, 1 = second
    last_sent_at: lastSentAt.toISOString(),
    days_elapsed: businessDaysElapsed,
    threadContext
  };
}

function buildThreadContext(messages, myEmail) {
  const parts = [];
  for (const msg of messages) {
    const headers = headersMap(msg);
    const from = headers.from ?? "Unknown";
    const to = headers.to ?? "Unknown";
    const date = new Date(Number(msg.internalDate)).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric"
    });
    const body = extractBody(msg.payload).slice(0, 2500);
    const direction = emailBelongsToMe(from, myEmail) ? "[SENT BY TIRTH]" : "[RECEIVED FROM RECIPIENT]";
    parts.push(`--- ${direction} ${date} | From: ${from} | To: ${to} ---\n${body}`);
  }
  return parts.join("\n\n").slice(0, 8000);
}

async function generateDraft(candidate, apiKey) {
  const userPrompt = `Analyze this job-search email thread and write a follow-up draft if appropriate.

SUBJECT: ${candidate.subject}
RECIPIENT CONTACT: ${candidate.contactName ? `${candidate.contactName} (${candidate.contactEmail})` : candidate.contactEmail}
PRE-DETECTED COMPANY: ${candidate.knownCompany || candidate.inferredCompany || "None"}
PRE-DETECTED ROLE: ${candidate.knownRole || "None"}
FOLLOW-UP ATTEMPT: ${candidate.followup_count + 1} of 2
BUSINESS DAYS SINCE TIRTH'S LAST EMAIL: ${candidate.days_elapsed}

--- FULL CONVERSATION THREAD ---
${candidate.threadContext}
--- END CONVERSATION THREAD ---`;

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Tirth-1999/Job_Tracker",
      "X-Title": "Job Tracker Follow-Up Scanner"
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: DRAFT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.25
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseJsonSafely(content);
}

function parseJsonSafely(raw) {
  if (!raw) return null;
  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }
}

async function upsertCandidates(candidates) {
  const now = new Date().toISOString();
  const rows = candidates.map((c) => ({
    id: c.candidateId,
    thread_id: c.threadId,
    subject: (c.subject ?? "").slice(0, 500),
    company: (c.company ?? "Unknown").slice(0, 200),
    role: (c.role ?? "General").slice(0, 200),
    contact_name: (c.contact_name ?? "").slice(0, 200),
    contact_email: (c.contact_email ?? "").slice(0, 200),
    last_sent_at: c.last_sent_at,
    days_elapsed: c.days_elapsed,
    followup_count: c.followup_count,
    thread_summary: (c.thread_summary ?? "").slice(0, 1000),
    ai_draft: (c.ai_draft ?? "").slice(0, 8000),
    status: "pending",
    updated_at: now
  }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/followup_candidates`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(rows)
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`Supabase upsert notice (${res.status}): ${text}`);
  }
}

async function getThread(token, threadId) {
  const url = new URL(`${GMAIL_API}/threads/${threadId}`);
  url.searchParams.set("format", "full");
  const res = await gmailFetch(token, url);
  return res.json();
}

async function gmailFetch(token, url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 429 && attempt < retries - 1) {
      await sleep(800 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error(`Gmail API error: ${response.status} ${await response.text()}`);
    return response;
  }
}

function headersMap(msg) {
  return Object.fromEntries(
    (msg?.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value])
  );
}

function emailBelongsToMe(fromHeader, myEmail) {
  const email = extractEmail(fromHeader).toLowerCase();
  return email === myEmail.toLowerCase();
}

function extractEmail(header) {
  const match = (header ?? "").match(/<([^>]+)>/) || (header ?? "").match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return match ? match[1].trim() : (header ?? "").trim();
}

function extractNameAndEmail(header) {
  if (!header) return { name: "", email: "" };
  const emailMatch = header.match(/<([^>]+)>/) || header.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const email = emailMatch ? emailMatch[1].trim() : header.trim();
  let name = "";
  if (header.includes("<")) {
    name = header.slice(0, header.indexOf("<")).replace(/["']/g, "").trim();
  }
  return { name, email };
}

function inferCompanyFromDomain(email) {
  if (!email || !email.includes("@")) return "";
  const domain = email.split("@")[1].toLowerCase();
  const publicWebmails = new Set([
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
    "aol.com", "protonmail.com", "zoho.com", "mail.com", "ymail.com"
  ]);
  if (publicWebmails.has(domain)) return "";
  const mainPart = domain.split(".")[0];
  if (!mainPart || mainPart.length < 2) return "";
  return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
}

function isNoreply(email) {
  return NOREPLY_PATTERNS.some((p) => p.test(email));
}

function hashThreadId(threadId) {
  return crypto.createHash("sha256").update(threadId).digest("hex").slice(0, 32);
}

function countBusinessDays(fromDate, toDate) {
  let count = 0;
  const current = new Date(fromDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);

  while (current < end) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function extractBody(part) {
  if (!part) return "";
  const chunks = [];
  collectTextParts(part, chunks);
  return chunks.join("\n").replace(/\s+/g, " ").trim();
}

function collectTextParts(part, chunks) {
  if (part.mimeType === "text/plain" && part.body?.data) {
    chunks.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
  } else if (part.mimeType === "text/html" && part.body?.data) {
    const rawHtml = Buffer.from(part.body.data, "base64url").toString("utf8");
    const cleanText = rawHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
    if (cleanText) chunks.push(cleanText);
  }
  for (const child of part.parts ?? []) collectTextParts(child, chunks);
}

// ─── Run ──────────────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error("Fatal error in scan-followups.mjs:", err);
  process.exit(1);
});
