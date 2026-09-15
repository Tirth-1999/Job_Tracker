import fs from "node:fs/promises";
import { inferSpecialRole, improveRole } from "../src/classification/normalize.mjs";

const fixturePath = new URL("../tests/role-normalizer-fixtures.json", import.meta.url);
const fixtures = JSON.parse(await fs.readFile(fixturePath, "utf8"));
const misses = [];

for (const fixture of fixtures) {
  const specialRole = inferSpecialRole({
    company: fixture.company,
    subject: fixture.subject,
    body: fixture.body,
    from: fixture.from
  });
  const improvedRole = improveRole({
    currentRole: fixture.currentRole,
    company: fixture.company,
    subject: fixture.subject,
    body: fixture.body,
    from: fixture.from
  });
  const actualRole = specialRole || improvedRole || fixture.currentRole;
  const actualCompany = /ATC|atc\.xyz|atcllc|american technology consulting/i.test(
    `${fixture.company} ${fixture.subject} ${fixture.from} ${fixture.body}`
  ) ? "ATC" : fixture.company;

  if (actualRole !== fixture.expectedRole || actualCompany !== fixture.expectedCompany) {
    misses.push({
      name: fixture.name,
      expectedRole: fixture.expectedRole,
      actualRole,
      expectedCompany: fixture.expectedCompany,
      actualCompany
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

function round(value) {
  return Math.round(value * 1000) / 1000;
}
