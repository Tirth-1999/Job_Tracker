import fs from "node:fs";
import { execFileSync } from "node:child_process";

loadLocalEnv();

const BATCH_SIZE = numberArg("--batch-size", 50);
const DRY_RUN = !process.argv.includes("--apply");
const now = new Date().toISOString();

const before = JSON.parse(execFileSync("git", ["show", "HEAD:data/applications.json"], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024
}));
const after = JSON.parse(fs.readFileSync("data/applications.json", "utf8"));

const beforeById = new Map((before.applications || []).map((app) => [app.id, app]));
const changes = [];

for (const app of after.applications || []) {
  const old = beforeById.get(app.id);
  if (!old) continue;
  const statusChanged = old.status !== app.status || old.confidence !== app.confidence || old.aiDecision !== app.aiDecision;
  const roleChanged = old.role !== app.role;
  const companyChanged = old.company !== app.company;
  if (!statusChanged && !roleChanged && !companyChanged) continue;
  changes.push({
    id: app.id,
    oldCompany: old.company,
    newCompany: app.company,
    oldRole: old.role,
    newRole: app.role,
    oldStatus: old.status,
    newStatus: app.status,
    roleChanged,
    companyChanged,
    statusChanged,
    confidence: app.confidence || "high",
    aiDecision: app.aiDecision || app.reason || "deterministic reclassification",
    aiModel: app.aiModel || app.classifier || "deterministic_rules",
    aiConfidence: app.aiConfidence || app.confidence || "high"
  });
}

console.log(JSON.stringify({
  dryRun: DRY_RUN,
  changes: changes.length,
  roleChanges: changes.filter((change) => change.roleChanged).length,
  companyChanges: changes.filter((change) => change.companyChanged).length,
  statusChanges: changes.filter((change) => change.statusChanged).length,
  byNewStatus: countBy(changes, "newStatus"),
  examples: changes.slice(0, 20)
}, null, 2));

if (DRY_RUN || changes.length === 0) process.exit(0);

const sbUrl = process.env.SUPABASE_URL || "https://dykamjxudtxkwgfllxxy.supabase.co";
const sbKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_b2SuLtxZgeR-LGQRzMa3_A_lxV0bn75";
if (!sbKey) throw new Error("SUPABASE_ANON_KEY is required.");

for (let i = 0; i < changes.length; i += BATCH_SIZE) {
  const batch = changes.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(async (change) => {
    const res = await fetch(`${sbUrl}/rest/v1/applications?id=eq.${encodeURIComponent(change.id)}`, {
      method: "PATCH",
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        ...(change.statusChanged ? {
          status: change.newStatus,
          confidence: change.confidence,
          ai_decision: change.aiDecision,
          ai_model: change.aiModel,
          ai_classified_at: now,
          ai_confidence: change.aiConfidence
        } : {}),
        ...(change.companyChanged ? { company: change.newCompany } : {}),
        ...(change.roleChanged ? { role: change.newRole } : {}),
        updated_at: now
      })
    });

    if (!res.ok) {
      throw new Error(`Failed ${change.id}: HTTP ${res.status} ${await res.text()}`);
    }
  }));
  console.log(`Patched ${Math.min(i + BATCH_SIZE, changes.length)} / ${changes.length}`);
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "none";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function numberArg(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.slice(name.length + 1));
  return Number.isFinite(value) ? value : fallback;
}

function loadLocalEnv() {
  if (!fs.existsSync(".env")) return;
  const envContent = fs.readFileSync(".env", "utf8");
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
