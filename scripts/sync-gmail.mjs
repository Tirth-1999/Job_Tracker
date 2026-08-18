import fs from "node:fs/promises";
import path from "node:path";

const DATA_PATH = path.resolve("data/applications.json");
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

const STATUS_RULES = [
  {
    status: "rejected",
    patterns: ["unfortunately", "not moving forward", "other candidates", "will not be proceeding", "not selected"]
  },
  {
    status: "offered",
    patterns: ["offer", "pleased to offer", "congratulations", "welcome to the team"]
  },
  {
    status: "reply_needed",
    patterns: ["availability", "schedule", "when are you available", "please reply", "next steps", "follow up"]
  },
  {
    status: "interviewed",
    patterns: ["interview", "technical screen", "phone screen", "onsite", "final round"]
  },
  {
    status: "initial_revert_needed",
    patterns: ["application received", "thank you for applying", "received your application", "we have received"]
  }
];

const COMPANY_HINTS = [
  /(?:from|at)\s+([A-Z][A-Za-z0-9&.\- ]{1,50})/i,
  /^([A-Z][A-Za-z0-9&.\- ]{1,50})\s+(?:careers|recruiting|talent|jobs)$/i
];

async function main() {
  const data = await readData();
  const token = await getAccessToken();
  const messages = await listRecentMessages(token);
  let changed = false;

  for (const messageRef of messages) {
    if (data.applications.some((app) => app.gmailMessageIds?.includes(messageRef.id))) continue;

    const message = await getMessage(token, messageRef.id);
    const parsed = parseMessage(message);
    const status = classify(parsed);

    if (!status) continue;

    upsertApplication(data, {
      id: makeApplicationId(parsed),
      company: parsed.company,
      role: parsed.role,
      status,
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
    data.updatedAt = new Date().toISOString();
    await fs.writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
    console.log("Updated applications data.");
  } else {
    console.log("No matching Gmail changes found.");
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

async function listRecentMessages(token) {
  const query = process.env.GMAIL_QUERY || "newer_than:14d (application OR interview OR recruiter OR hiring OR offer)";
  const url = new URL(`${GMAIL_API}/messages`);
  url.searchParams.set("maxResults", process.env.GMAIL_MAX_RESULTS || "50");
  url.searchParams.set("q", query);

  const response = await gmailFetch(token, url);
  const json = await response.json();
  return json.messages ?? [];
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
  const company = inferCompany(from, subject);
  const role = inferRole(subject, body);

  return { subject, from, date, body, company, role };
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
  const haystack = `${parsed.subject} ${parsed.body}`.toLowerCase();
  return STATUS_RULES.find((rule) => rule.patterns.some((pattern) => haystack.includes(pattern)))?.status ?? null;
}

function inferCompany(from, subject) {
  const emailDomain = from.match(/@([A-Za-z0-9.-]+)/)?.[1]?.replace(/^mail\./, "");
  if (emailDomain && !["gmail.com", "googlemail.com", "outlook.com", "linkedin.com", "indeed.com"].includes(emailDomain)) {
    return titleCase(emailDomain.split(".")[0].replaceAll("-", " "));
  }

  for (const regex of COMPANY_HINTS) {
    const match = subject.match(regex);
    if (match?.[1]) return titleCase(match[1].trim());
  }

  return "Unknown company";
}

function inferRole(subject, body) {
  const text = `${subject}\n${body}`;
  const roleMatch = text.match(/(?:for|role|position|opening)[:\s]+([A-Za-z0-9,./&+\- ]{3,80})/i);
  if (roleMatch?.[1]) return cleanRole(roleMatch[1]);
  return "Unknown role";
}

function cleanRole(value) {
  return value.split(/[.!?\n]/)[0].replace(/\s+/g, " ").trim();
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function makeApplicationId(parsed) {
  return slugify(`${parsed.company}-${parsed.role}`);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `app-${Date.now()}`;
}

function upsertApplication(data, incoming) {
  const existing = data.applications.find((app) => app.id === incoming.id);
  if (!existing) {
    data.applications.push(incoming);
    return;
  }

  existing.status = incoming.status;
  existing.latestSubject = incoming.latestSubject;
  existing.latestFrom = incoming.latestFrom;
  existing.lastActivityAt = incoming.lastActivityAt;
  existing.gmailMessageIds = [...new Set([...(existing.gmailMessageIds ?? []), ...incoming.gmailMessageIds])];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
