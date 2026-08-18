import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

// Auto-load local .env
if (fsSync.existsSync(".env")) {
  const envContent = fsSync.readFileSync(".env", "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^[\"']|[\"']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const RAW_EMAILS_PATH = path.resolve("data/raw_emails.json");
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

const SEARCH_QUERY = [
  "(",
  "from:(lever.co OR greenhouse-mail.io OR ashbyhq.com OR myworkday.com OR smartrecruiters.com OR workablemail.com OR icims.com OR bamboohr.com OR dover.com OR applytojob.com OR comeet-notifications.com OR careers OR recruiting OR talent OR hiring)",
  "OR subject:(\"thank you for applying\" OR \"thanks for applying\" OR \"application received\" OR \"we received your application\" OR \"your application to\" OR \"application update\" OR \"update on your application\" OR \"assessment invite\" OR \"video screening\" OR \"offer letter\" OR \"next steps\" OR \"action required\")",
  ")",
  "-subject:(otp OR \"verification code\" OR \"security code\" OR password OR receipt OR invoice OR \"welcome to chat\")"
].join(" ");

async function getAccessToken() {
  const required = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing ${key} in .env`);
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) throw new Error(`Token refresh failed: ${response.status} ${await response.text()}`);
  const json = await response.json();
  return json.access_token;
}

async function listAllMessages(token) {
  const messages = [];
  let pageToken = "";
  let page = 0;
  const maxPages = 20;

  console.log("🔍 Searching Gmail for all job emails...");

  while (page < maxPages) {
    page++;
    const url = new URL(`${GMAIL_API}/messages`);
    url.searchParams.set("maxResults", "100");
    url.searchParams.set("q", SEARCH_QUERY);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Gmail API list failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    if (json.messages) messages.push(...json.messages);

    console.log(`Page ${page}: found ${json.messages?.length || 0} messages (total so far: ${messages.length})`);
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }

  return messages;
}

function parseMessage(message) {
  const headers = Object.fromEntries((message.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const subject = headers.subject ?? "";
  const from = headers.from ?? "";
  const date = headers.date ? new Date(headers.date).toISOString() : new Date(Number(message.internalDate)).toISOString();
  const body = extractBody(message.payload);

  return { id: message.id, threadId: message.threadId, subject, from, date, body };
}

function extractBody(part) {
  if (!part) return "";
  const chunks = [];
  collectTextParts(part, chunks);
  return chunks.join("\n").replace(/\s+/g, " ").slice(0, 3000);
}

function collectTextParts(part, chunks) {
  if (part.mimeType === "text/plain" && part.body?.data) {
    chunks.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
  }
  if (part.parts) {
    for (const child of part.parts) collectTextParts(child, chunks);
  }
}

async function main() {
  console.log("🚀 Authenticating with Gmail API...");
  const token = await getAccessToken();
  console.log("✅ Authenticated successfully!\n");

  const messageRefs = await listAllMessages(token);
  console.log(`\n📥 Starting parallel download of ${messageRefs.length} emails...`);

  const CHUNK_SIZE = 30;
  const rawEmails = [];

  for (let i = 0; i < messageRefs.length; i += CHUNK_SIZE) {
    const chunk = messageRefs.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (ref) => {
        try {
          const url = new URL(`${GMAIL_API}/messages/${ref.id}`);
          url.searchParams.set("format", "full");
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) return null;
          const msg = await res.json();
          return parseMessage(msg);
        } catch (err) {
          return null;
        }
      })
    );

    rawEmails.push(...chunkResults.filter(Boolean));
    console.log(`Downloaded ${Math.min(i + CHUNK_SIZE, messageRefs.length)} / ${messageRefs.length} emails...`);
  }

  // Deduplicate by ID
  const uniqueEmails = [...new Map(rawEmails.map(e => [e.id, e])).values()];
  await fs.writeFile(RAW_EMAILS_PATH, JSON.stringify(uniqueEmails, null, 2));

  console.log(`\n🎉 DONE! Saved ${uniqueEmails.length} raw emails to ${RAW_EMAILS_PATH}`);
}

main().catch(console.error);
