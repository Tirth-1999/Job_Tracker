import fs from "node:fs/promises";
import path from "node:path";

const DATA_PATH = path.resolve("data/applications.json");
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const AI_BATCH_SIZE = Number(process.env.AI_BATCH_SIZE || process.env.GEMINI_BATCH_SIZE || "20");
const ALLOWED_STATUSES = new Set(["applied", "reply_needed", "interviewed", "offered", "rejected"]);

const DEFAULT_RECENT_QUERY = [
  "newer_than:30d",
  "(",
  "\"thank you for applying\"",
  "OR \"application received\"",
  "OR \"application update\"",
  "OR \"your application was sent\"",
  "OR \"thanks for applying\"",
  "OR interview",
  "OR recruiter",
  "OR \"next steps\"",
  "OR \"schedule\"",
  "OR \"not moving forward\"",
  "OR \"unfortunately\"",
  "OR \"offer\"",
  ")",
  "-subject:(otp OR \"verification code\" OR \"security code\" OR password OR invoice OR receipt OR 2fa)"
].join(" ");

const DEFAULT_BACKFILL_QUERY = [
  "(",
  "\"thank you for applying\"",
  "OR \"thanks for applying\"",
  "OR \"application received\"",
  "OR \"your application was sent\"",
  "OR \"application update\"",
  "OR \"we received your application\"",
  "OR \"not moving forward\"",
  "OR \"unfortunately\"",
  "OR \"schedule interview\"",
  "OR \"next steps\"",
  "OR recruiter",
  "OR \"talent acquisition\"",
  "OR offer",
  ")",
  "-subject:(otp OR \"verification code\" OR \"security code\" OR password OR invoice OR receipt OR subscription OR 2fa)"
].join(" ");

const NOISE_SUBJECT_PATTERNS = [
  /\b(otp|one-time password|verification code|security code|2fa|two-factor)\b/i,
  /\b(reset your password|sign-in code|login code|verify your email|verify your account)\b/i,
  /\b(receipt|invoice|subscription renewal|sale ends|limited time offer)\b/i
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
  const candidateMessages = [];
  let skipped = 0;
  let changed = resetData;

  for (const messageRef of messages) {
    if (seenMessageIds.has(messageRef.id)) continue;

    const message = await getMessage(token, messageRef.id);
    const parsed = parseMessage(message);

    // Fast-path noise pre-filter (pure OTPs, security codes, billing receipts)
    if (isObviousNoise(parsed.subject)) {
      skipped += 1;
      continue;
    }

    candidateMessages.push({ message, parsed });
  }

  console.log(`Analyzing ${candidateMessages.length} candidate emails...`);

  const extractedItems = await processCandidateMessages(candidateMessages);

  for (const item of extractedItems) {
    if (!item || item.status === "ignore" || !item.company || isGenericCompany(item.company)) {
      skipped += 1;
      continue;
    }

    upsertApplication(data, {
      id: makeApplicationId(item.company, item.role),
      company: item.company,
      role: item.role || "General Application",
      status: item.status,
      confidence: item.confidence || "medium",
      classifier: item.classifier || "gemini",
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
  }

  if (changed) {
    data.applications = cleanupApplications(data.applications);
    data.updatedAt = new Date().toISOString();
    await fs.writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`Successfully updated applications data. Processed ${messages.length} messages, skipped ${skipped}.`);
  } else {
    console.log(`No matching Gmail changes found. Processed ${messages.length} messages, skipped ${skipped}.`);
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
  const query = process.env.GMAIL_QUERY || (isBackfill ? DEFAULT_BACKFILL_QUERY : DEFAULT_RECENT_QUERY);
  const maxResults = Number(process.env.GMAIL_MAX_RESULTS || (isBackfill ? "100" : "50"));
  const maxPages = Number(process.env.GMAIL_MAX_PAGES || (isBackfill ? "20" : "1"));
  const messages = [];
  let pageToken = process.env.GMAIL_PAGE_TOKEN || "";

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`${GMAIL_API}/messages`);
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("q", query);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await gmailFetch(token, url);
    const json = await response.json();
    messages.push(...(json.messages ?? []));

    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }

  console.log(`Gmail query: ${query}`);
  console.log(`Fetched ${messages.length} message references.`);
  return messages;
}

async function getMessage(token, id) {
  const url = new URL(`${GMAIL_API}/messages/${id}`);
  url.searchParams.set("format", "full");
  const response = await gmailFetch(token, url);
  return response.json();
}

async function gmailFetch(token, url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Gmail API failed: ${response.status} ${await response.text()}`);
  return response;
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
              enum: ["applied", "reply_needed", "interviewed", "offered", "rejected", "ignore"]
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
  const results = [];

  for (let i = 0; i < items.length; i += AI_BATCH_SIZE) {
    const batch = items.slice(i, i + AI_BATCH_SIZE);
    const batchPromptPayload = batch.map((item) => ({
      id: item.message.id,
      from: item.parsed.from.slice(0, 100),
      subject: item.parsed.subject.slice(0, 140),
      snippet: item.parsed.body.slice(0, 500)
    }));

    const systemPrompt = [
      "You are a specialized job application email extraction engine.",
      "Extract: 1) True hiring company name (strip ATS like Workday/Greenhouse/Lever/Ashby), 2) Job role title (standard title, never phrases like 'your application to...'), 3) Status (applied, reply_needed, interviewed, offered, rejected, ignore).",
      "Set is_job=false and status='ignore' for noise, OTPs, receipts, or non-job emails."
    ].join(" ");

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
                        enum: ["applied", "reply_needed", "interviewed", "offered", "rejected", "ignore"]
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

    for (const item of batch) {
      const aiResult = parsedMap.get(item.message.id);
      const isJob = aiResult?.is_job ?? aiResult?.is_job_application ?? false;

      if (aiResult && isJob && aiResult.status !== "ignore") {
        const cleanCompany = sanitizeCompanyName(aiResult.company);
        const cleanRoleName = sanitizeRole(aiResult.role);
        const validStatus = ALLOWED_STATUSES.has(aiResult.status) ? aiResult.status : "applied";

        results.push({
          message: item.message,
          parsed: item.parsed,
          company: cleanCompany,
          role: cleanRoleName,
          status: validStatus,
          confidence: aiResult.confidence || "medium",
          classifier: "openrouter",
          reason: "AI extracted"
        });
      } else if (!aiResult) {
        // Fallback for missing item in batch
        results.push(extractWithHeuristics(item));
      }
    }
  }

  return results;
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

function sanitizeCompanyName(company) {
  if (!company) return "Unknown Company";
  let cleaned = company
    .replace(/["'<>]/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/\S+@\S+/g, "")
    .replace(/\b(hiring team|careers|recruiting|recruiter|talent|jobs|notifications|no.?reply|noreply|workday|greenhouse|lever|ashby)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?,:;]+$/, "");

  if (!cleaned || cleaned.length < 2) return "Unknown Company";
  return titleCase(cleaned).slice(0, 80);
}

function sanitizeRole(role) {
  if (!role) return "General Application";
  let cleaned = role
    .split(/[.!?\n]/)[0]
    .replace(/\s+/g, " ")
    .replace(/^(your application to|taking the time to apply to our open|applying to|applying for|application for|interest in)\s+/i, "")
    .replace(/\s+(at|with|from)\s+[A-Z][A-Za-z0-9&.'\- ]+$/i, "")
    .trim()
    .slice(0, 80);

  if (!cleaned || cleaned.length < 2 || /^applying$/i.test(cleaned)) {
    return "General Application";
  }
  return titleCase(cleaned);
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
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
