import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { improveRole, isBadRole } from "../src/classification/normalize.mjs";

loadLocalEnv();

const DATA_PATH = path.resolve("data/applications.json");
const REPORT_PATH = path.resolve("data/role-repair-report.json");
const APPLY_JSON = process.argv.includes("--apply-json");
const APPLY_SUPABASE = process.argv.includes("--apply-supabase");
const STATUS_FILTER = argValue("--status", "all");
const BATCH_SIZE = Number(argValue("--batch-size", "50"));

const data = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
const apps = data.applications || [];
const now = new Date().toISOString();

const proposals = [];
const stillBad = [];

for (const app of apps) {
  if (STATUS_FILTER !== "all" && app.status !== STATUS_FILTER) continue;

  const badBefore = isBadRole(app.role, app.company);
  if (!badBefore) continue;

  const improvedRole = improveRole({
    currentRole: app.role,
    company: app.company,
    subject: app.latestSubject,
    body: app.notes,
    from: app.latestFrom
  });

  if (improvedRole && improvedRole !== app.role) {
    proposals.push({
      id: app.id,
      company: app.company,
      oldRole: app.role,
      newRole: improvedRole,
      status: app.status,
      subject: app.latestSubject,
      from: app.latestFrom
    });
  } else {
    stillBad.push({
      id: app.id,
      company: app.company,
      role: app.role,
      status: app.status,
      subject: app.latestSubject,
      from: app.latestFrom
    });
  }
}

if (APPLY_JSON && proposals.length) {
  const byId = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  data.applications = apps.map((app) => {
    const proposal = byId.get(app.id);
    if (!proposal) return app;
    return {
      ...app,
      role: proposal.newRole,
      updatedAt: now
    };
  });
  data.updatedAt = now;
  await fs.writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

if (APPLY_SUPABASE && proposals.length) {
  await applySupabase(proposals, now);
}

const report = {
  generatedAt: now,
  statusFilter: STATUS_FILTER,
  applyJson: APPLY_JSON,
  applySupabase: APPLY_SUPABASE,
  totalApplications: apps.length,
  proposals: proposals.length,
  stillBad: stillBad.length,
  proposalsByStatus: countBy(proposals, "status"),
  stillBadByStatus: countBy(stillBad, "status"),
  proposalExamples: proposals,
  stillBadExamples: stillBad.slice(0, 120)
};

await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  reportPath: REPORT_PATH,
  statusFilter: STATUS_FILTER,
  proposals: proposals.length,
  stillBad: stillBad.length,
  proposalsByStatus: report.proposalsByStatus,
  stillBadByStatus: report.stillBadByStatus,
  appliedJson: APPLY_JSON,
  appliedSupabase: APPLY_SUPABASE
}, null, 2));

async function applySupabase(proposalsToApply, updatedAt) {
  const sbUrl = process.env.SUPABASE_URL || "https://dykamjxudtxkwgfllxxy.supabase.co";
  const sbKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_b2SuLtxZgeR-LGQRzMa3_A_lxV0bn75";
  for (let i = 0; i < proposalsToApply.length; i += BATCH_SIZE) {
    const batch = proposalsToApply.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (proposal) => {
      const res = await fetch(`${sbUrl}/rest/v1/applications?id=eq.${encodeURIComponent(proposal.id)}`, {
        method: "PATCH",
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ role: proposal.newRole, updated_at: updatedAt })
      });
      if (!res.ok) throw new Error(`Failed ${proposal.id}: HTTP ${res.status} ${await res.text()}`);
    }));
    console.log(`Patched ${Math.min(i + BATCH_SIZE, proposalsToApply.length)} / ${proposalsToApply.length}`);
  }
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "none";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
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
