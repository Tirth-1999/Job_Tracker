import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

loadLocalEnv();

const DATA_PATH = path.resolve("data/applications.json");
const REPORT_PATH = path.resolve("data/company-repair-report.json");
const APPLY_JSON = process.argv.includes("--apply-json");
const APPLY_SUPABASE = process.argv.includes("--apply-supabase");
const BATCH_SIZE = Number(argValue("--batch-size", "50"));

const data = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
const apps = data.applications || [];
const now = new Date().toISOString();
const proposals = [];

for (const app of apps) {
  const proposed = inferCompany(app);
  if (proposed && proposed !== app.company) {
    proposals.push({
      id: app.id,
      oldCompany: app.company,
      newCompany: proposed,
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
    return { ...app, company: proposal.newCompany, updatedAt: now };
  });
  data.updatedAt = now;
  await fs.writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

if (APPLY_SUPABASE && proposals.length) {
  await applySupabase(proposals, now);
}

const report = {
  generatedAt: now,
  applyJson: APPLY_JSON,
  applySupabase: APPLY_SUPABASE,
  proposals: proposals.length,
  proposalsByStatus: countBy(proposals, "status"),
  proposalExamples: proposals
};

await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  reportPath: REPORT_PATH,
  proposals: proposals.length,
  proposalsByStatus: report.proposalsByStatus,
  appliedJson: APPLY_JSON,
  appliedSupabase: APPLY_SUPABASE
}, null, 2));

function inferCompany(app) {
  const current = String(app.company || "").trim();
  const from = String(app.latestFrom || "");
  if (/zensearch|jobright|seek|ziprecruiter|trueup|levels\.fyi|resume worded|salesforce|maven/i.test(`${current} ${from}`)) return "";
  if (/^from scratch$/i.test(current)) return "";
  if (app.status === "not_related") return "";

  const currentMatch = current.match(/^(.+?)\s+from\s+(.+)$/i);
  if (currentMatch?.[2]) return cleanCompany(currentMatch[2]);

  const fromName = from.match(/^"?([^"<]+?)"?\s*</)?.[1] || "";
  const fromMatch = fromName.match(/^(.+?)\s+from\s+(.+)$/i);
  if (fromMatch?.[2]) return cleanCompany(fromMatch[2]);

  if (/^colleague zone$/i.test(current) && /cvshealth@myworkday\.com/i.test(from)) return "CVS Health";
  if (/^my$/i.test(current) && /myworkday@thehartford\.com/i.test(from)) return "The Hartford";
  return "";
}

function cleanCompany(value) {
  const cleaned = String(value || "")
    .replace(/\s*<.*$/, "")
    .replace(/\s+/g, " ")
    .replace(/^["']|["']$/g, "")
    .trim()
    .replace(/\b(inc\.?|llc\.?|corp\.?|corporation)\.?$/i, (suffix) => suffix.replace(/\.$/, ""));
  if (/^(ot|unknown|other|msg)$/i.test(cleaned)) return "";
  return cleaned;
}

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
        body: JSON.stringify({ company: proposal.newCompany, updated_at: updatedAt })
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
