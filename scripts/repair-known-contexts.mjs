import fs from "node:fs/promises";
import path from "node:path";
import { inferSpecialRole, isBadRole } from "../src/classification/normalize.mjs";

const DATA_PATH = path.resolve("data/applications.json");
const REPORT_PATH = path.resolve("data/known-context-repair-report.json");
const APPLY_JSON = process.argv.includes("--apply-json");

const data = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
const now = new Date().toISOString();
const proposals = [];

for (const app of data.applications || []) {
  const context = `${app.id || ""} ${app.company || ""} ${app.role || ""} ${app.latestSubject || ""} ${app.latestFrom || ""} ${app.notes || ""}`;
  const headerContext = `${app.company || ""} ${app.latestSubject || ""} ${app.latestFrom || ""}`;
  const patch = {};
  const reasons = [];

  if (/\bATC\b|atc\.xyz|atcllc|american technology consulting/i.test(context)) {
    if (app.status === "not_related" && !/\bATC\b|atc\.xyz|atcllc/i.test(headerContext)) continue;

    patch.company = "ATC";
    reasons.push("ATC sender/domain/thread context");

    const role = inferSpecialRole({
      company: "ATC",
      subject: app.latestSubject,
      body: app.notes,
      from: app.latestFrom
    });
    if (role && (isBadRole(app.role, app.company) || app.role !== role)) {
      patch.role = role;
      reasons.push("ATC role inferred from thread context");
    }
  }

  if (!Object.keys(patch).length) continue;

  const changed = Object.entries(patch).some(([key, value]) => app[key] !== value);
  if (!changed) continue;

  proposals.push({
    id: app.id,
    oldCompany: app.company,
    newCompany: patch.company || app.company,
    oldRole: app.role,
    newRole: patch.role || app.role,
    status: app.status,
    subject: app.latestSubject,
    from: app.latestFrom,
    reasons
  });
}

if (APPLY_JSON && proposals.length) {
  const byId = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  data.applications = (data.applications || []).map((app) => {
    const proposal = byId.get(app.id);
    if (!proposal) return app;
    return {
      ...app,
      company: proposal.newCompany,
      role: proposal.newRole,
      updatedAt: now
    };
  });
  data.updatedAt = now;
  await fs.writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

const report = {
  generatedAt: now,
  applyJson: APPLY_JSON,
  proposals: proposals.length,
  proposalsByStatus: countBy(proposals, "status"),
  proposals
};

await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  reportPath: REPORT_PATH,
  proposals: proposals.length,
  proposalsByStatus: report.proposalsByStatus,
  appliedJson: APPLY_JSON
}, null, 2));

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "none";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}
