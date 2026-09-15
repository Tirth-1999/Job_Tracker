import fs from "node:fs/promises";
import { classifyDeterministic } from "../src/classification/rules.mjs";
import { isBadRole } from "../src/classification/normalize.mjs";

const DATA_PATH = new URL("../data/applications.json", import.meta.url);
const data = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
const apps = data.applications || [];

const summary = {
  total: apps.length,
  proposedStatusChanges: 0,
  safeAutoFixes: 0,
  reviewOnlyChanges: 0,
  byCurrentStatus: {},
  byProposedStatus: {},
  byRule: {},
  byReviewReason: {},
  suspiciousRoles: 0,
  roleEqualsCompany: 0,
  examples: []
};

for (const app of apps) {
  summary.byCurrentStatus[app.status] = (summary.byCurrentStatus[app.status] || 0) + 1;

  const proposed = classifyDeterministic({
    from: app.latestFrom || "",
    subject: app.latestSubject || "",
    body: app.notes || ""
  });

  const badRoleReason = getBadRoleReason(app);
  if (badRoleReason) summary.suspiciousRoles += 1;

  if (normalize(app.company) && normalize(app.company) === normalize(app.role)) {
    summary.roleEqualsCompany += 1;
  }

  if (!proposed || proposed.status === app.status) continue;

  const safety = classifyCleanupSafety(app.status, proposed.status, proposed.ruleId);
  summary.proposedStatusChanges += 1;
  if (safety.safe) {
    summary.safeAutoFixes += 1;
  } else {
    summary.reviewOnlyChanges += 1;
    summary.byReviewReason[safety.reason] = (summary.byReviewReason[safety.reason] || 0) + 1;
  }
  summary.byProposedStatus[proposed.status] = (summary.byProposedStatus[proposed.status] || 0) + 1;
  summary.byRule[proposed.ruleId] = (summary.byRule[proposed.ruleId] || 0) + 1;

  if (summary.examples.length < 40) {
    summary.examples.push({
      id: app.id,
      company: app.company,
      role: app.role,
      currentStatus: app.status,
      proposedStatus: proposed.status,
      rule: proposed.ruleId,
      reason: proposed.reason,
      cleanupDisposition: safety.safe ? "safe_auto_fix" : "review_only",
      reviewReason: safety.safe ? "" : safety.reason,
      subject: app.latestSubject,
      from: app.latestFrom,
      badRoleReason
    });
  }
}

console.log(JSON.stringify(summary, null, 2));

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getBadRoleReason(app) {
  const role = String(app.role || "");
  if (!isBadRole(role, app.company)) return "";
  if (!role || /^(general application|your application|your interest|this role|unknown|applying|sr|jr|you)$/i.test(role)) return "generic_role";
  if (normalize(app.company) && normalize(app.company) === normalize(role)) return "role_equals_company";
  if (/more success view similar jobs|using linkedin|candidate account|job alert|&nbsp|view similar jobs|you from jobright/i.test(role)) {
    return "artifact_phrase";
  }
  if (/^the\s+/i.test(role) || role.length > 75) return "likely_sentence_fragment";
  return "";
}

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

  if (["applied", "reply_needed", "interviewed"].includes(currentStatus) && proposedStatus === "offered") {
    return { safe: true, reason: "" };
  }

  return { safe: false, reason: "ambiguous_status_change" };
}
