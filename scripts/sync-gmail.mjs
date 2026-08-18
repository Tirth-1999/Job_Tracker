import fs from "node:fs/promises";
import path from "node:path";

const DATA_PATH = path.resolve("data/applications.json");
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

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
  ")",
  "-subject:(otp OR \"verification code\" OR \"security code\" OR password OR invoice OR receipt)"
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
  ")",
  "-subject:(otp OR \"verification code\" OR \"security code\" OR password OR invoice OR receipt OR subscription)"
].join(" ");

const ATS_DOMAINS = new Set([
  "ashbyhq.com",
  "bamboohr.com",
  "bamboohr.co.uk",
  "candidates.workablemail.com",
  "greenhouse-mail.io",
  "greenhouse.io",
  "hire.lever.co",
  "icims.com",
  "jobvite.com",
  "myworkday.com",
  "smartrecruiters.com",
  "workablemail.com",
  "workday.com"
]);

const GENERIC_COMPANY_WORDS = new Set([
  "app",
  "applytojob",
  "candidates",
  "careers",
  "greenhouse",
  "hire",
  "jobs",
  "lever",
  "mail",
  "notifications",
  "recruiting",
  "talent",
  "unknown company",
  "us",
  "workable"
]);

const NOISE_RULES = [
  "otp",
  "one-time password",
  "one time password",
  "verification code",
  "security code",
  "two-factor",
  "2fa",
  "reset your password",
  "sign-in code",
  "login code",
  "verify your email",
  "verify your account",
  "receipt",
  "invoice",
  "subscription",
  "newsletter",
  "unsubscribe",
  "sale ends",
  "limited time offer"
];

const REQUIRED_JOB_SIGNALS = [
  "application",
  "applied",
  "applying",
  "candidate",
  "careers",
  "hiring",
  "interview",
  "job",
  "position",
  "recruiter",
  "recruiting",
  "role",
  "talent acquisition"
];

const STATUS_RULES = [
  {
    status: "rejected",
    confidence: "high",
    patterns: [
      "unfortunately",
      "not moving forward",
      "other candidates",
      "will not be proceeding",
      "not selected",
      "decided not to move forward",
      "we will not be moving forward",
      "we are unable to offer"
    ]
  },
  {
    status: "offered",
    confidence: "high",
    patterns: [
      "pleased to offer",
      "extend an offer",
      "offer letter",
      "employment offer",
      "congratulations on your offer",
      "welcome to the team"
    ]
  },
  {
    status: "reply_needed",
    confidence: "medium",
    patterns: [
      "when are you available",
      "share your availability",
      "provide your availability",
      "schedule a call",
      "schedule an interview",
      "please reply",
      "please respond",
      "next steps",
      "follow up",
      "would like to connect"
    ]
  },
  {
    status: "interviewed",
    confidence: "medium",
    patterns: ["technical screen", "phone screen", "onsite", "final round", "interview confirmation", "interview scheduled"]
  },
  {
    status: "initial_revert_needed",
    confidence: "high",
    patterns: [
      "application received",
      "thank you for applying",
      "thanks for applying",
      "received your application",
      "we have received your application",
      "your application was sent"
    ]
  }
];

const COMPANY_HINTS = [
  /your application was sent to ([A-Z][A-Za-z0-9&.'\- ]{1,60})/i,
  /thank you for (?:your application to|applying to|applying at) ([A-Z][A-Za-z0-9&.'\- ]{1,60})/i,
  /thanks for applying to ([A-Z][A-Za-z0-9&.'\- ]{1,60})/i,
  /application (?:received|update) (?:from|for|at) ([A-Z][A-Za-z0-9&.'\- ]{1,60})/i,
  /application received .* at ([A-Z][A-Za-z0-9&.'\- ]{1,60})/i,
  /(?:from|at)\s+([A-Z][A-Za-z0-9&.\- ]{1,50})/i,
  /^([A-Z][A-Za-z0-9&.\- ]{1,50})\s+(?:careers|recruiting|talent|jobs)$/i
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
  let changed = resetData;
  let skipped = 0;

  for (const messageRef of messages) {
    if (seenMessageIds.has(messageRef.id)) continue;

    const message = await getMessage(token, messageRef.id);
    const parsed = parseMessage(message);
    const classification = classify(parsed);

    if (!classification) {
      skipped += 1;
      continue;
    }

    upsertApplication(data, {
      id: makeApplicationId(parsed),
      company: parsed.company,
      role: parsed.role,
      status: classification.status,
      confidence: classification.confidence,
      latestSubject: parsed.subject,
      latestFrom: parsed.from,
      lastActivityAt: parsed.date,
      source: "gmail",
      gmailThreadId: message.threadId,
      gmailMessageIds: [message.id],
      notes: ""
    });
    changed = true;
  }

  if (changed) {
    data.applications = cleanupApplications(data.applications);
    data.updatedAt = new Date().toISOString();
    await fs.writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`Updated applications data. Processed ${messages.length} messages, skipped ${skipped}.`);
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
  const fromName = from.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim() ?? "";
  const fromDomain = from.match(/@([A-Za-z0-9.-]+)/)?.[1]?.toLowerCase().replace(/^mail\./, "") ?? "";
  const date = headers.date ? new Date(headers.date).toISOString() : new Date(Number(message.internalDate)).toISOString();
  const body = extractBody(message.payload);
  const company = inferCompany({ from, fromName, fromDomain, subject, body });
  const role = inferRole(subject, body);

  return { subject, from, fromName, fromDomain, date, body, company, role };
}

function extractBody(part) {
  if (!part) return "";
  const chunks = [];
  collectTextParts(part, chunks);
  return chunks.join("\n").replace(/\s+/g, " ").slice(0, 12000);
}

function collectTextParts(part, chunks) {
  if (part.mimeType === "text/plain" && part.body?.data) {
    chunks.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
  }
  for (const child of part.parts ?? []) collectTextParts(child, chunks);
}

function classify(parsed) {
  const subject = parsed.subject.toLowerCase();
  const body = parsed.body.toLowerCase();
  const haystack = `${subject} ${body}`;

  if (NOISE_RULES.some((pattern) => haystack.includes(pattern))) return null;
  if (!REQUIRED_JOB_SIGNALS.some((pattern) => haystack.includes(pattern))) return null;

  const matched = STATUS_RULES.find((rule) => rule.patterns.some((pattern) => haystack.includes(pattern)));
  if (matched) return { status: matched.status, confidence: matched.confidence };

  if (/\binterview\b/.test(haystack)) return { status: "interviewed", confidence: "low" };
  if (/\b(applied|application|applying)\b/.test(haystack)) return { status: "applied", confidence: "low" };

  return null;
}

function inferCompany({ fromName, fromDomain, subject, body }) {
  const text = `${subject}\n${body.slice(0, 2000)}`;

  for (const regex of COMPANY_HINTS) {
    const match = text.match(regex);
    const company = normalizeCompanyName(match?.[1]);
    if (company) return company;
  }

  const senderCompany = normalizeCompanyName(fromName);
  if (senderCompany && !isGenericCompany(senderCompany)) return senderCompany;

  if (fromDomain && !isGenericDomain(fromDomain) && !isAtsDomain(fromDomain)) {
    const company = normalizeCompanyName(fromDomain.split(".")[0].replaceAll("-", " "));
    if (company) return company;
  }

  return "Unknown company";
}

function inferRole(subject, body) {
  const text = `${subject}\n${body}`;
  const roleMatch = text.match(/(?:for|role|position|opening|job title)[:\s]+([A-Za-z0-9,./&+\- ]{3,80})/i);
  if (roleMatch?.[1]) return cleanRole(roleMatch[1]);
  return "Unknown role";
}

function cleanRole(value) {
  return value
    .split(/[.!?\n]/)[0]
    .replace(/\s+/g, " ")
    .replace(/\s+(at|with|from)\s+[A-Z][A-Za-z0-9&.'\- ]+$/i, "")
    .trim()
    .slice(0, 80);
}

function normalizeCompanyName(value) {
  if (!value) return "";
  const cleaned = value
    .replace(/["'<>]/g, "")
    .replace(/\b(hiring team|careers|recruiting|recruiter|talent|jobs|notifications|no.?reply|noreply)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?,:;]+$/, "");

  if (!cleaned || isGenericCompany(cleaned)) return "";
  return titleCase(cleaned).slice(0, 80);
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

function makeApplicationId(parsed) {
  return slugify(`${parsed.company}-${parsed.role}`);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `app-${Date.now()}`;
}

function isAtsDomain(domain) {
  return [...ATS_DOMAINS].some((atsDomain) => domain === atsDomain || domain.endsWith(`.${atsDomain}`));
}

function isGenericDomain(domain) {
  return ["gmail.com", "googlemail.com", "outlook.com", "linkedin.com", "indeed.com"].includes(domain);
}

function isGenericCompany(company) {
  return GENERIC_COMPANY_WORDS.has(String(company).trim().toLowerCase());
}

function upsertApplication(data, incoming) {
  const existing = data.applications.find((app) => app.id === incoming.id);
  if (!existing) {
    data.applications.push(incoming);
    return;
  }

  existing.status = incoming.status;
  existing.confidence = incoming.confidence;
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
