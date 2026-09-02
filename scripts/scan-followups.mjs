import fsSync from "node:fs";
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

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-3.7-flash";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://dykamjxudtxkwgfllxxy.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_b2SuLtxZgeR-LGQRzMa3_A_lxV0bn75";

const DRY_RUN = process.env.GMAIL_FOLLOWUP_DRY_RUN === "true";

// Follow-up threshold: days since last sent with no reply. Default = 10 business days.
const DEFAULT_THRESHOLD_BUSINESS_DAYS = Number(process.env.FOLLOWUP_THRESHOLD_DAYS || "10");

// Maximum number of consecutive sent messages from me at end of thread before we stop following up.
// If this count is >= MAX_FOLLOWUPS, the thread is considered exhausted.
const MAX_FOLLOWUPS = 2; // 0-indexed count: 0 = eligible for 1st, 1 = eligible for 2nd, >=2 = stop

// How far back to scan SENT folder (in days)
const SENT_LOOKBACK_DAYS = 90;

// ─── Gmail sent search query ───────────────────────────────────────────────────
// Covers job applications, recruiter cold outreach you sent, networking, referrals
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
You are a professional email writer helping a job seeker named Tirth follow up on important job-search threads.
Tirth is a data engineer / data professional actively job seeking.

Your task is dual:
1. Determine if this thread is a "dead end" and should NOT receive a follow-up.
2. If it is NOT a dead end, write a personalized, professional follow-up email draft Tirth can send.

=====================================================================
DEAD END DETECTION — return is_dead: true if ANY of the following apply:
=====================================================================
- The other party explicitly said they have no current positions open (and Tirth already acknowledged/replied thanking them).
- The thread contains a clear rejection ("we've decided to move forward with other candidates", "we are not moving forward", "the position has been filled", "we wish you all the best", etc.).
- Tirth already replied to a rejection gracefully, so the thread is fully closed.
- The entire thread is automated emails only (ATS confirmations, noreply senders) with no human conversation.
- The other person asked Tirth to stop contacting them, or said they'll reach out if needed.
- The thread is clearly concluded and nothing productive can come from follow-up.
- The thread is a subscription, newsletter, or promotional email.

=====================================================================
DRAFT WRITING RULES — if is_dead: false, write a follow-up:
=====================================================================
- Keep it SHORT: 2-4 sentences maximum. Quality > quantity.
- PERSONALIZE to the specific conversation, company, role, and what was last discussed.
- Reference the specific context of the last email you sent (what you discussed, what you offered, what they said).
- Do NOT invent facts, qualifications, or promises that are not in the thread.
- Do NOT overstate Tirth's qualifications.
- Do NOT use em dashes (—) anywhere in the draft. Use commas or periods instead.
- Do NOT start with "I hope this email finds you well" or any generic opener. Start with something specific.
- Do NOT use phrases like "I wanted to circle back" or "just checking in" — be more direct and specific.
- Keep the tone professional, warm, and human. Not robotic or over-formal.
- The subject line should be "Re: [original subject]" — just reference it, don't recreate it.
- End with a clear but non-pushy call to action (e.g. asking if they have a moment to connect, if there's an update, or if any new positions opened).
- Do NOT include a greeting or sign-off. Output ONLY the body text of the email (the content between "Hi [Name]," and "Best, Tirth"). Tirth will add those himself.
- If the thread is networking/referral outreach with no job yet, the tone should be relationship-building.
- If the thread is about a specific job application or interview, ask for a status update.

=====================================================================
OUTPUT FORMAT — respond with valid JSON only, no markdown fences:
=====================================================================
{
  "is_dead": boolean,
  "dead_reason": "short explanation if is_dead is true, else empty string",
  "company": "company or organization name (if identifiable, else 'Unknown')",
  "role": "job role or position (if identifiable, else 'General')",
  "contact_name": "first name of the person Tirth was emailing (if identifiable, else '')",
  "contact_email": "their email address (if identifiable, else '')",
  "thread_summary": "1-2 sentence summary of what this conversation is about",
  "ai_draft": "the follow-up email body text (empty string if is_dead is true)"
}
`.trim();

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔍 Follow-Up Scanner starting...");
  if (DRY_RUN) console.log("⚠️  DRY RUN mode — nothing will be written to Supabase.");

  const token = await getAccessToken();
  const myEmail = await getMyEmail(token);
  console.log(`📧 Authenticated as: ${myEmail}`);

  // ── 1. Load already-dismissed thread IDs from Supabase (don't re-process them) ──
  const dismissedIds = await loadDismissedIds();
  console.log(`📋 ${dismissedIds.size} threads already dismissed (will be skipped).`);

  // ── 2. List sent messages ─────────────────────────────────────────────────────
  const sentMessages = await listSentMessages(token);
  console.log(`📤 Found ${sentMessages.length} sent messages matching job-search query.`);

  // ── 3. Group by thread, deduplicate ──────────────────────────────────────────
  const threadIds = [...new Set(sentMessages.map((m) => m.threadId).filter(Boolean))];
  console.log(`🧵 ${threadIds.length} unique threads to analyze.`);

  // ── 4. Process each thread ───────────────────────────────────────────────────
  const candidates = [];
  const THREAD_CHUNK = 5;

  for (let i = 0; i < threadIds.length; i += THREAD_CHUNK) {
    const chunk = threadIds.slice(i, i + THREAD_CHUNK);
    const results = await Promise.all(
      chunk.map((threadId) => analyzeThread(token, threadId, myEmail, dismissedIds))
    );
    const qualified = results.filter(Boolean);
    candidates.push(...qualified);

    if (i + THREAD_CHUNK < threadIds.length) {
      await sleep(200);
    }
  }

  console.log(`\n✅ ${candidates.length} threads qualify for follow-up.`);

  if (!candidates.length) {
    console.log("No follow-up candidates found. Exiting.");
    return;
  }

  // ── 5. Generate AI drafts for all candidates ──────────────────────────────────
  console.log("\n🤖 Generating AI drafts...");
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("⚠️  No OPENROUTER_API_KEY set — cannot generate AI drafts.");
    return;
  }

  const withDrafts = [];
  for (const candidate of candidates) {
    try {
      const analysis = await generateDraft(candidate, apiKey);
      if (!analysis || analysis.is_dead) {
        console.log(`  ⏭  Skipping (AI says dead): ${candidate.subject?.slice(0, 60)}`);
        continue;
      }
      withDrafts.push({ ...candidate, ...analysis });
      console.log(`  ✅ Draft ready: ${analysis.company || candidate.company} — ${analysis.role || "General"}`);
    } catch (err) {
      console.warn(`  ⚠️  Draft generation failed for thread ${candidate.threadId}: ${err.message}`);
    }
    await sleep(300);
  }

  console.log(`\n📝 ${withDrafts.length} follow-up drafts generated.`);

  if (!withDrafts.length) {
    console.log("All candidates were classified as dead ends by AI. Exiting.");
    return;
  }

  // ── 6. Upsert to Supabase ─────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log("\n[DRY RUN] Would upsert these follow-up candidates:");
    for (const d of withDrafts) {
      console.log(`  - ${d.company} | ${d.role} | ${d.contact_email} | Days: ${d.days_elapsed} | Attempt: ${d.followup_count + 1}`);
      console.log(`    Draft: ${d.ai_draft?.slice(0, 120)}...`);
    }
    return;
  }

  await upsertCandidates(withDrafts);
  console.log("\n🎉 Follow-up scan complete!");
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

async function listSentMessages(token) {
  const messages = [];
  let pageToken = "";
  const maxPages = 10; // Cap to avoid runaway

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

  // Fetch threadId for each message ref (they come with just id, not threadId)
  // Actually Gmail messages list does return threadId — let's verify and map
  return messages;
}

async function analyzeThread(token, threadId, myEmail, dismissedIds) {
  // Skip already-dismissed threads immediately
  const candidateId = hashThreadId(threadId);
  if (dismissedIds.has(candidateId)) return null;

  let thread;
  try {
    thread = await getThread(token, threadId);
  } catch (err) {
    console.warn(`  ⚠️  Could not fetch thread ${threadId}: ${err.message}`);
    return null;
  }

  const messages = thread.messages ?? [];
  if (!messages.length) return null;

  // Sort by internalDate ascending (oldest first)
  messages.sort((a, b) => Number(a.internalDate) - Number(b.internalDate));

  // ── Filter A: Last message must be FROM me ──────────────────────────────────
  const lastMsg = messages[messages.length - 1];
  const lastHeaders = headersMap(lastMsg);
  const lastFrom = lastHeaders.from ?? "";

  if (!emailBelongsToMe(lastFrom, myEmail)) return null;

  // ── Filter B: Days since last sent ≥ threshold ──────────────────────────────
  const lastSentAt = new Date(Number(lastMsg.internalDate));
  const businessDaysElapsed = countBusinessDays(lastSentAt, new Date());

  if (businessDaysElapsed < DEFAULT_THRESHOLD_BUSINESS_DAYS) return null;

  // ── Filter C: Count consecutive sent messages at end ─────────────────────────
  // Walk backwards from the last message counting consecutive mine-sent messages
  let consecutiveMine = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const from = headersMap(messages[i]).from ?? "";
    if (emailBelongsToMe(from, myEmail)) {
      consecutiveMine++;
    } else {
      break;
    }
  }

  // 1 = eligible for 1st follow-up, 2 = eligible for 2nd follow-up, >=3 = exhausted
  if (consecutiveMine > MAX_FOLLOWUPS) return null; // Already followed up twice, stop

  // ── Filter D: Skip threads where the recipient is a noreply address ──────────
  // Look at the first non-mine message to find the "contact" email
  const firstOtherMsg = messages.find((m) => !emailBelongsToMe(headersMap(m).from ?? "", myEmail));
  // If there's no reply at all (first message is from me), check the To: of my first message
  const myFirstMsg = messages.find((m) => emailBelongsToMe(headersMap(m).from ?? "", myEmail));
  const contactEmail = firstOtherMsg
    ? extractEmail(headersMap(firstOtherMsg).from ?? "")
    : extractEmail(headersMap(myFirstMsg ?? {}).to ?? "");

  if (contactEmail && isNoreply(contactEmail)) return null;

  // ── Build thread context for AI ──────────────────────────────────────────────
  const subject = headersMap(messages[0]).subject ?? "";
  const threadContext = buildThreadContext(messages, myEmail);

  return {
    threadId,
    candidateId,
    subject,
    contactEmail,
    followup_count: consecutiveMine - 1, // 0 = first follow-up eligible, 1 = second
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
    const date = new Date(Number(msg.internalDate)).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric"
    });
    const body = extractBody(msg.payload).slice(0, 2500);
    const direction = emailBelongsToMe(from, myEmail) ? "[SENT BY ME]" : "[RECEIVED]";
    parts.push(`--- ${direction} ${date} | From: ${from} ---\n${body}`);
  }
  return parts.join("\n\n").slice(0, 8000);
}

async function generateDraft(candidate, apiKey) {
  const userPrompt = `Analyze this email thread and decide if it needs a follow-up. If yes, write the draft.

SUBJECT: ${candidate.subject}
FOLLOW-UP ATTEMPT: ${candidate.followup_count + 1} of 2
DAYS SINCE MY LAST EMAIL: ${candidate.days_elapsed} business days

--- FULL THREAD ---
${candidate.threadContext}
--- END THREAD ---`;

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
      temperature: 0.3
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
  // Strip markdown fences if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Regex fallback: extract first JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* ignore */ }
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
    contact_email: (c.contact_email ?? c.contactEmail ?? "").slice(0, 200),
    last_sent_at: c.last_sent_at,
    days_elapsed: c.days_elapsed,
    followup_count: c.followup_count,
    thread_summary: (c.thread_summary ?? "").slice(0, 1000),
    ai_draft: (c.ai_draft ?? "").slice(0, 8000),
    status: "pending",
    updated_at: now
  }));

  // Batch upsert in chunks of 50
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/followup_candidates`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        // Only update non-dismissed rows — don't touch dismissed ones
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(chunk)
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`Supabase upsert warning (${res.status}): ${text}`);
    } else {
      console.log(`✅ Upserted ${chunk.length} follow-up candidates to Supabase.`);
    }
  }
}

async function loadDismissedIds() {
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/followup_candidates`);
    url.searchParams.set("select", "id");
    url.searchParams.set("status", "eq.dismissed");

    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: "application/json"
      }
    });

    if (!res.ok) return new Set();
    const rows = await res.json();
    return new Set(Array.isArray(rows) ? rows.map((r) => r.id) : []);
  } catch {
    return new Set();
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

function isNoreply(email) {
  return NOREPLY_PATTERNS.some((p) => p.test(email));
}

function hashThreadId(threadId) {
  return crypto.createHash("sha256").update(threadId).digest("hex").slice(0, 32);
}

/**
 * Count business days (Mon–Fri) between two dates.
 * Saturdays and Sundays are not counted.
 */
function countBusinessDays(fromDate, toDate) {
  let count = 0;
  const current = new Date(fromDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);

  while (current < end) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++; // Not Sunday (0) or Saturday (6)
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
