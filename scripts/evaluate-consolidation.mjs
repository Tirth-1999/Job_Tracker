import fs from "node:fs/promises";

const appSource = await fs.readFile(new URL("../app.js", import.meta.url), "utf8");
const start = appSource.indexOf("function sanitizeCompanyName");
const end = appSource.indexOf("// ─── Load: Supabase is the EXCLUSIVE source of truth");
if (start < 0 || end < 0 || end <= start) {
  throw new Error("Could not locate consolidation functions in app.js");
}

const moduleShim = { exports: {} };
const source = `${appSource.slice(start, end)}\nmodule.exports = { deduplicateAndConsolidateApplications };`;
new Function("module", "exports", source)(moduleShim, moduleShim.exports);

const fixtures = JSON.parse(await fs.readFile(new URL("../tests/consolidation-fixtures.json", import.meta.url), "utf8"));
const misses = [];

for (const fixture of fixtures) {
  const actual = moduleShim.exports.deduplicateAndConsolidateApplications(fixture.rows)
    .map(pickComparable)
    .sort(sortComparable);
  const expected = fixture.expected.map(pickComparable).sort(sortComparable);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    misses.push({
      name: fixture.name,
      expected,
      actual
    });
  }
}

console.log(JSON.stringify({
  total: fixtures.length,
  correct: fixtures.length - misses.length,
  accuracy: round((fixtures.length - misses.length) / fixtures.length),
  misses
}, null, 2));

if (misses.length) process.exitCode = 1;

function pickComparable(app) {
  return {
    id: app.id,
    company: app.company,
    role: app.role,
    status: app.status,
    latestSubject: app.latestSubject,
    reqId: app.reqId ?? null
  };
}

function sortComparable(a, b) {
  return a.id.localeCompare(b.id);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
