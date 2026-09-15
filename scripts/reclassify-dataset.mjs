import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { classifyDeterministic } from "../src/classification/rules.mjs";

loadLocalEnv();

const DATA_PATH = path.resolve("data/applications.json");
const REPORT_PATH = path.resolve("data/reclassification-report.json");

const args = new Set(process.argv.slice(2));
const APPLY_JSON = args.has("--apply-json");
const APPLY_SUPABASE = args.has("--apply-supabase");
const INCLUDE_REVIEW = args.has("--include-review");
const BATCH_SIZE = numberArg("--batch-size", 50);
const LIMIT = numberArg("--limit", 0);

const data = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
const apps = data.applications || [];
const now = new Date().toISOString();

const candidates = [];
const reviewOnly = [];
const unchanged = [];

for (const app of apps) {
  const proposed = classifyDeterministic({
    from: app.latestFrom || "",
    subject: app.latestSubject || "",
    body: app.notes || ""
  });

  if (!proposed || proposed.status === app.status) {
    unchanged.push(app.id);
    continue;
  }

  const safety = classifyCleanupSafety(app.status, proposed.status, proposed.ruleId);
  const change = {
    id: app.id,
    company: app.company,
    role: app.role,
    from: app.latestFrom || "",
    subject: app.latestSubject || "",
    currentStatus: app.status,
    proposedStatus: proposed.status,
    confidence: proposed.confidence,
    ruleId: proposed.ruleId,
    reason: proposed.reason,
    safe: safety.safe,
    reviewReason: safety.reason
  };

  if (safety.safe || INCLUDE_REVIEW) candidates.push(change);
  else reviewOnly.push(change);
}

const selected = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;

const report = {
  generatedAt: now,
  mode: {
    applyJson: APPLY_JSON,
    applySupabase: APPLY_SUPABASE,
    includeReview: INCLUDE_REVIEW,
    limit: LIMIT,
    batchSize: BATCH_SIZE
  },
  totalApplications: apps.length,
  unchanged: unchanged.length,
  proposedChanges: candidates.length + reviewOnly.length,
  selectedChanges: selected.length,
  safeAutoFixes: candidates.filter((c) => c.safe).length,
  reviewOnlyChanges: reviewOnly.length + candidates.filter((c) => !c.safe).length,
  byCurrentStatus: countBy([...candidates, ...reviewOnly], "currentStatus"),
  byProposedStatus: countBy([...candidates, ...reviewOnly], "proposedStatus"),
  byRule: countBy([...candidates, ...reviewOnly], "ruleId"),
  selectedByProposedStatus: countBy(selected, "proposedStatus"),
  selectedByRule: countBy(selected, "ruleId"),
  reviewReasons: countBy([...reviewOnly, ...candidates.filter((c) => !c.safe)], "reviewReason"),
  selectedExamples: selected.slice(0, 50),
  reviewOnlyExamples: reviewOnly.slice(0, 50)
};

if (APPLY_JSON && selected.length) {
  const changeById = new Map(selected.map((change) => [change.id, change]));
  data.applications = apps.map((app) => {
    const change = changeById.get(app.id);
    if (!change) return app;
    return {
      ...app,
      status: change.proposedStatus,
      confidence: change.confidence,
      classifier: "deterministic_rules",
      reason: change.reason,
      aiDecision: change.reason,
      aiModel: "deterministic_rules",
      aiClassifiedAt: now,
      aiConfidence: change.confidence
    };
  });
  data.updatedAt = now;
  await fs.writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

if (APPLY_SUPABASE && selected.length) {
  await applySupabase(selected, now);
}

await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  reportPath: REPORT_PATH,
  totalApplications: report.totalApplications,
  proposedChanges: report.proposedChanges,
  selectedChanges: report.selectedChanges,
  safeAutoFixes: report.safeAutoFixes,
  reviewOnlyChanges: report.reviewOnlyChanges,
  selectedByProposedStatus: report.selectedByProposedStatus,
  selectedByRule: report.selectedByRule,
  appliedJson: APPLY_JSON,
  appliedSupabase: APPLY_SUPABASE
}, null, 2));

function classifyCleanupSafety(currentStatus, proposedStatus, ruleId) {
  if (currentStatus === "offered") {
    return { safe: false, reason: "never_auto_change_offer" };
  }
  if (currentStatus === "rejected" && proposedStatus !== "rejected") {
    return { safe: false, reason: "do_not_downgrade_rejected" };
  }
  if (currentStatus === "interviewed" && !["rejected", "offered"].includes(proposedStatus)) {
    return { safe: false, reason: "do_not_downgrade_interviewed" };
  }
  if (currentStatus === "not_related" && proposedStatus !== "not_related") {
    return { safe: false, reason: "reactivating_other_email_requires_review" };
  }
  if (proposedStatus === "rejected" && ruleId === "rejection") {
    return { safe: true, reason: "" };
  }
  if (currentStatus === "reply_needed" && proposedStatus === "applied") {
    return { safe: true, reason: "" };
  }
  if (["applied", "reply_needed"].includes(currentStatus) && proposedStatus === "not_related") {
    return { safe: true, reason: "" };
  }
  if (["applied", "reply_needed"].includes(currentStatus) && proposedStatus === "interviewed") {
    return { safe: true, reason: "" };
  }
  if (proposedStatus === "offered") {
    return { safe: false, reason: "offer_requires_review" };
  }
  return { safe: false, reason: "ambiguous_status_change" };
}

async function applySupabase(changes, classifiedAt) {
  const sbUrl = process.env.SUPABASE_URL || "https://dykamjxudtxkwgfllxxy.supabase.co";
  const sbKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_b2SuLtxZgeR-LGQRzMa3_A_lxV0bn75";
  if (!sbUrl || !sbKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required for --apply-supabase");

  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const batch = changes.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (change) => {
      const body = {
        status: change.proposedStatus,
        confidence: change.confidence,
        ai_decision: change.reason,
        ai_model: "deterministic_rules",
        ai_classified_at: classifiedAt,
        ai_confidence: change.confidence,
        updated_at: classifiedAt
      };

      const res = await fetch(`${sbUrl}/rest/v1/applications?id=eq.${encodeURIComponent(change.id)}`, {
        method: "PATCH",
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        throw new Error(`Supabase update failed for ${change.id}: HTTP ${res.status} ${await res.text()}`);
      }
    }));
  }
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
