import fsSync from "node:fs";

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

const sbUrl = process.env.SUPABASE_URL || "https://dykamjxudtxkwgfllxxy.supabase.co";
const sbKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_b2SuLtxZgeR-LGQRzMa3_A_lxV0bn75";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

function collectTextParts(part, chunks) {
  if (part.mimeType === "text/plain" && part.body?.data) {
    chunks.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
  } else if (part.mimeType === "text/html" && part.body?.data) {
    const rawHtml = Buffer.from(part.body.data, "base64url").toString("utf8");
    const cleanText = rawHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
      .replace(/&#\d+;/gi, " ").replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ").trim();
    if (cleanText) chunks.push(cleanText);
  }
  for (const child of part.parts ?? []) collectTextParts(child, chunks);
}

function extractBody(payload) {
  if (!payload) return "";
  const chunks = [];
  collectTextParts(payload, chunks);
  return chunks.join(" ").replace(/\s+/g, " ").slice(0, 4000).trim();
}

const REJECTION_RE = /won.t be moving forward|will not be moving forward|decided not to move forward|decided not to proceed|will not be proceeding|not proceeding with your|won.t be able to continue with your candidacy|not able to continue with your candidacy|decided to move forward with (candidates|other)|move forward with other candidates whose|moving forward with other candidates|moving forward with another candidate|pursue other candidates|pursuing other candidates|pursuing other applicants|selected other candidates|selected another candidate|chosen another candidate|chosen to move forward with other|not selected for this (role|position|opportunity)|not been selected|was not selected|ineligible for the role|deemed you (as )?ineligible|not a (match|fit) for this (role|position)|not the right fit|not a good fit at this time|qualifications more closely align|experience is more closely aligned|experience more closely aligns|more closely align with the requirements|other candidates whose (skills|experience|qualifications)|position has been filled|position (is|has been|was) (filled|closed|cancelled|canceled)|no longer under consideration|unable to offer you (a |the )?position|unable to offer you an interview|unable to extend an offer|cannot offer you an interview|have decided not to move forward|will not be progressing your|not be progressing your application|we have not selected|you have not been selected|we are unable to move forward with your|after careful (review|consideration).{0,120}(decided|won.t|will not|regret|sorry|unable|not|moving)|regret to inform|decision was not made lightly|will be pursuing other|decided to pursue other|have chosen to move forward with|there isn.t a fit|isn.t the right fit|not the right match|not a fit at this time|not a match at this time/i;

const FALSE_POSITIVE_RE = /if (you are|you were|we are) not (selected|able).{0,150}(please|check|visit|keep|our|feel|thank)|if we are unable to offer.{0,100}(encourage|invite|visit|thank)|we will (only )?(be )?in touch (only )?if your qualifications|we will reach out (to you )?if your (skills|qualifications|experience|background)|if your (qualifications|skills|experience|background) (match|align|fit)|only if your qualifications|will be in touch if your|will contact you if (your|we)|it is likely that we have decided|if you do not hear from us.{0,100}(likely|decided|moved)|if the position is no longer listed.{0,200}(decided|pursue|filled|canceled)/i;

function isRejection(fullText) {
  if (!REJECTION_RE.test(fullText)) return false;
  const idx = fullText.search(REJECTION_RE);
  const surrounding = fullText.slice(Math.max(0, idx - 80), idx + 250);
  return !FALSE_POSITIVE_RE.test(surrounding);
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID,
    client_secret: process.env.GMAIL_CLIENT_SECRET,
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const res = await fetch(TOKEN_URL, { method: "POST", body });
  if (!res.ok) throw new Error("Token refresh failed: " + res.status + " " + await res.text());
  return (await res.json()).access_token;
}

async function fetchMessage(token, msgId, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(GMAIL_API + "/messages/" + msgId + "?format=full", {
      headers: { Authorization: "Bearer " + token }
    });
    if (res.status === 429 && attempt < retries - 1) { await new Promise(r => setTimeout(r, 800 * (attempt + 1))); continue; }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Gmail " + res.status + ": " + await res.text());
    return res.json();
  }
}

async function run() {
  console.log("Fetching Supabase rows...");
  let allRows = [];
  let from = 0;
  while (true) {
    const res = await fetch(sbUrl + "/rest/v1/applications?select=*&order=last_activity_at.desc&offset=" + from + "&limit=1000", {
      headers: { apikey: sbKey, Authorization: "Bearer " + sbKey }
    });
    const page = await res.json();
    if (!page || page.length === 0) break;
    allRows.push(...page);
    if (page.length < 1000) break;
    from += 1000;
  }
  console.log("Total rows: " + allRows.length);

  const targets = allRows.filter(r =>
    r.status !== "offered" &&
    (!r.notes || r.notes.trim().length === 0) &&
    (r.gmail_message_ids || []).length >= 1
  );
  console.log("Rows to backfill: " + targets.length);

  const token = await getAccessToken();
  console.log("Got Gmail token.");

  let updatedNotes = 0, newRejections = 0, failed = 0;

  for (const row of targets) {
    const msgIds = row.gmail_message_ids || [];
    let combinedBody = "";

    for (const msgId of msgIds) {
      try {
        const msg = await fetchMessage(token, msgId);
        if (!msg) continue;
        const body = extractBody(msg.payload);
        if (body) combinedBody += " " + body;
        await new Promise(r => setTimeout(r, 60));
      } catch (err) {
        console.warn("  Failed msg " + msgId + ": " + err.message);
      }
    }

    combinedBody = combinedBody.replace(/\s+/g, " ").slice(0, 4000).trim();
    if (!combinedBody) {
      console.log("  [SKIP-EMPTY] " + row.company + " — no body after Gmail fetch");
      continue;
    }

    const fullText = (row.latest_subject || "") + " " + combinedBody;
    const isRej = isRejection(fullText) && row.status !== "rejected";

    const updatePayload = { notes: combinedBody, updated_at: new Date().toISOString() };
    if (isRej) {
      updatePayload.status = "rejected";
      updatePayload.ai_decision = "Candidate rejection notice (backfilled from Gmail body)";
      updatePayload.ai_model = "rule-based-backfill";
    }

    const patchRes = await fetch(sbUrl + "/rest/v1/applications?id=eq." + row.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", apikey: sbKey, Authorization: "Bearer " + sbKey, Prefer: "return=minimal" },
      body: JSON.stringify(updatePayload)
    });

    if (patchRes.status === 204) {
      updatedNotes++;
      if (isRej) { newRejections++; console.log("  ✅ REJECTED: [" + row.company + "] (" + row.role + ") | was: " + row.status); }
      else { console.log("  📝 NOTES: [" + row.company + "] (" + row.role + ") | status: " + row.status); }
    } else {
      failed++;
      console.log("  ❌ FAILED: " + row.id + " HTTP " + patchRes.status);
    }
    await new Promise(r => setTimeout(r, 80));
  }

  console.log("\n=== DONE: " + updatedNotes + " notes filled, " + newRejections + " new rejections, " + failed + " failed ===");
}

run().catch(console.error);
