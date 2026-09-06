// api/fetch-gmail-thread.js
// Vercel Serverless Function — Fetch live Gmail thread/message body via Gmail OAuth

import fs from "fs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

// In local development, load .env if environment variables are not set
function loadLocalEnv() {
  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_REFRESH_TOKEN) return;
  try {
    if (fs.existsSync(".env")) {
      const envContent = fs.readFileSync(".env", "utf8");
      envContent.split("\n").forEach((line) => {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (m) {
          const key = m[1];
          let value = m[2] || "";
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (!process.env[key]) process.env[key] = value;
        }
      });
    }
  } catch (err) {
    // Ignore error in serverless environment where fs might be read-only
  }
}

function extractThreadOrMessageId(input) {
  if (!input) return "";
  const s = String(input).trim();
  // 1. Clean hex string
  if (/^[a-f0-9]{16,}$/i.test(s)) return s;
  // 2. Gmail URL patterns
  // https://mail.google.com/mail/u/0/#inbox/19f3b328be6b9e56
  // https://mail.google.com/mail/u/0/#all/19f3b328be6b9e56
  // https://mail.google.com/mail/#all/19f3b328be6b9e56
  // https://mail.google.com/mail/u/0/#search/term/19f3b328be6b9e56
  const m = s.match(/(?:#|\/|%23)([a-f0-9]{16,})(?:[/?#&]|$)/i);
  if (m) return m[1];
  return "";
}

async function getGmailAccessToken() {
  loadLocalEnv();
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Gmail OAuth credentials (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN).");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const res = await fetch(TOKEN_URL, { method: "POST", body });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

function collectTextParts(part, chunks) {
  if (!part) return;
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

function extractBody(payload) {
  if (!payload) return "";
  const chunks = [];
  collectTextParts(payload, chunks);
  return chunks.join("\n\n").replace(/\s+/g, " ").slice(0, 5000);
}

function inferCompanyFromSenderAndSubject(from = "", subject = "") {
  // Extract name before <email>
  const matchName = from.match(/^([^<]+)<([^>]+)>/);
  let senderName = from;
  let senderDomain = "";
  if (matchName) {
    senderName = matchName[1].replace(/["']/g, "").trim();
    const email = matchName[2];
    senderDomain = (email.split("@")[1] || "").toLowerCase();
  } else if (from.includes("@")) {
    senderDomain = (from.split("@")[1] || "").toLowerCase();
  }

  // Filter out common public domains
  const publicDomains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "linkedin.com", "pandadoc.com"];
  if (senderDomain && !publicDomains.includes(senderDomain)) {
    const baseDomain = senderDomain.split(".")[0];
    if (baseDomain && baseDomain.length > 2) {
      return baseDomain.charAt(0).toUpperCase() + baseDomain.slice(1);
    }
  }

  if (senderName && senderName.length > 2 && !senderName.includes("@")) {
    return senderName;
  }

  return "Unknown Company";
}

function inferRoleFromSubject(subject = "") {
  // 1. Quoted role like “Junior data analyst/data scientist/ML/AI engineer”
  const mQuote = subject.match(/["“]([^"”]{4,60}?)["”]/);
  if (mQuote && mQuote[1] && !/^(the|our|this)$/i.test(mQuote[1])) {
    return mQuote[1].trim();
  }
  // 2. "hiring for [Role]" or "opportunity: [Role]"
  const mHiring = subject.match(/(?:hiring for|opportunity:?|role:?|position:?|application for:?)\s+([A-Za-z0-9/&.\- ]{4,50}?)(?:\s+(?:at|with|like|—|-|\()|$)/i);
  if (mHiring && mHiring[1] && !/^(the|our|this|a|an)$/i.test(mHiring[1].trim())) {
    return mHiring[1].trim();
  }
  if (/senior data engineer/i.test(subject)) return "Senior Data Engineer";
  if (/data engineer/i.test(subject)) return "Data Engineer";
  if (/senior business analyst/i.test(subject)) return "Senior Business Analyst";
  if (/business analyst/i.test(subject)) return "Business Analyst";
  if (/data analyst/i.test(subject)) return "Data Analyst";
  if (/ai engineer|machine learning/i.test(subject)) return "AI Engineer";
  if (/product manager/i.test(subject)) return "Product Manager";
  return "General Application";
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use POST or GET." });
  }

  try {
    const rawInput = req.body?.url || req.body?.threadId || req.query?.url || req.query?.id;
    if (!rawInput) {
      return res.status(400).json({ error: "Missing required parameter: 'url' or 'threadId'." });
    }

    const id = extractThreadOrMessageId(rawInput);
    if (!id) {
      return res.status(400).json({
        error: "Could not extract a valid Gmail thread or message ID from the provided URL. Please paste a valid Gmail link (e.g., https://mail.google.com/mail/u/0/#inbox/19f3b328be6b9e56) or a 16-character hex ID."
      });
    }

    const token = await getGmailAccessToken();

    // 1. Try fetching as a thread first
    let threadRes = await fetch(`${GMAIL_API}/threads/${id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    let messageData = null;
    let isThread = false;

    if (threadRes.ok) {
      const threadJson = await threadRes.json();
      isThread = true;
      const msgs = threadJson.messages || [];
      if (msgs.length > 0) {
        // Pick the latest message in the thread
        messageData = msgs[msgs.length - 1];
      }
    } else {
      // 2. Fallback: try fetching as a standalone message ID
      const msgRes = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (msgRes.ok) {
        messageData = await msgRes.json();
      }
    }

    if (!messageData) {
      return res.status(404).json({
        error: `Could not locate thread or message in Gmail with ID: ${id}. Ensure the ID is valid and accessible with your authenticated Gmail account.`
      });
    }

    const headers = Object.fromEntries(
      (messageData.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value])
    );

    const subject = headers.subject || "No Subject";
    const from = headers.from || "Unknown Sender";
    const to = headers.to || "";
    const date = headers.date || new Date().toISOString();
    const body = extractBody(messageData.payload);
    const snippet = messageData.snippet || body.slice(0, 160);

    const company = inferCompanyFromSenderAndSubject(from, subject);
    const role = inferRoleFromSubject(subject);

    return res.status(200).json({
      success: true,
      threadId: messageData.threadId || id,
      messageId: messageData.id,
      isThread,
      subject,
      from,
      to,
      date,
      body,
      snippet,
      company,
      role,
      gmailUrl: `https://mail.google.com/mail/#all/${encodeURIComponent(messageData.threadId || id)}`
    });
  } catch (err) {
    return res.status(500).json({
      error: `Error fetching Gmail thread: ${err.message}`
    });
  }
}
