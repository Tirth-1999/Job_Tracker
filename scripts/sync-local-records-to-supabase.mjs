import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

loadLocalEnv();

const DATA_PATH = path.resolve("data/applications.json");
const IDS = argValue("--ids", "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const ONLY_CHANGED = process.argv.includes("--only-changed");
const DRY_RUN = !process.argv.includes("--apply");
const BATCH_SIZE = Number(argValue("--batch-size", "50"));

const data = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
const apps = data.applications || [];
const selected = IDS.length
  ? apps.filter((app) => IDS.includes(app.id))
  : apps;

if (IDS.length && selected.length !== IDS.length) {
  const found = new Set(selected.map((app) => app.id));
  const missing = IDS.filter((id) => !found.has(id));
  throw new Error(`Missing local application ids: ${missing.join(", ")}`);
}

const sbUrl = process.env.SUPABASE_URL || "https://dykamjxudtxkwgfllxxy.supabase.co";
const sbKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_b2SuLtxZgeR-LGQRzMa3_A_lxV0bn75";
const now = new Date().toISOString();
const updates = [];

for (const app of selected) {
  const remote = await fetchRemote(app.id);
  if (!remote) {
    updates.push({ id: app.id, reason: "missing_remote", app });
    continue;
  }

  const changed = remote.company !== app.company || remote.role !== app.role || remote.status !== app.status;
  if (!ONLY_CHANGED || changed) {
    updates.push({
      id: app.id,
      reason: changed ? "changed" : "selected",
      before: pickRemote(remote),
      after: pickLocal(app),
      app
    });
  }
}

console.log(JSON.stringify({
  dryRun: DRY_RUN,
  selected: selected.length,
  updates: updates.length,
  examples: updates.slice(0, 20).map(({ app, ...update }) => update)
}, null, 2));

if (DRY_RUN || updates.length === 0) process.exit(0);

for (let i = 0; i < updates.length; i += BATCH_SIZE) {
  const batch = updates.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(({ app }) => patchRemote(app, now)));
  console.log(`Patched ${Math.min(i + BATCH_SIZE, updates.length)} / ${updates.length}`);
}

async function fetchRemote(id) {
  const res = await fetch(`${sbUrl}/rest/v1/applications?select=id,company,role,status&id=eq.${encodeURIComponent(id)}`, {
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`
    }
  });
  if (!res.ok) throw new Error(`Read failed for ${id}: HTTP ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows[0] || null;
}

async function patchRemote(app, updatedAt) {
  const body = {
    company: app.company,
    role: app.role,
    status: app.status,
    confidence: app.confidence || "high",
    ai_decision: app.aiDecision || app.reason || "local record sync",
    ai_model: app.aiModel || app.classifier || "local_json",
    ai_classified_at: app.aiClassifiedAt || updatedAt,
    ai_confidence: app.aiConfidence || app.confidence || "high",
    updated_at: updatedAt
  };
  const res = await fetch(`${sbUrl}/rest/v1/applications?id=eq.${encodeURIComponent(app.id)}`, {
    method: "PATCH",
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Patch failed for ${app.id}: HTTP ${res.status} ${await res.text()}`);
}

function pickRemote(row) {
  return {
    company: row.company,
    role: row.role,
    status: row.status
  };
}

function pickLocal(app) {
  return {
    company: app.company,
    role: app.role,
    status: app.status
  };
}

function argValue(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return raw ? raw.slice(name.length + 1) : fallback;
}

function loadLocalEnv() {
  if (!fsSync.existsSync(".env")) return;
  const envContent = fsSync.readFileSync(".env", "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
