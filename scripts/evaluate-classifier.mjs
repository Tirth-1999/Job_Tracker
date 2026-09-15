import fs from "node:fs/promises";
import { classifyDeterministic } from "../src/classification/rules.mjs";

const fixturePath = new URL("../tests/classifier-fixtures.json", import.meta.url);
const fixtures = JSON.parse(await fs.readFile(fixturePath, "utf8"));

const labels = ["applied", "reply_needed", "interviewed", "offered", "rejected", "not_related"];
const matrix = Object.fromEntries(labels.map((label) => [label, Object.fromEntries(labels.map((inner) => [inner, 0]))]));
const misses = [];

for (const fixture of fixtures) {
  const classified = classifyDeterministic(fixture);
  const actual = classified?.status || "unclassified";
  const expected = fixture.expected;

  if (!matrix[expected]) matrix[expected] = {};
  matrix[expected][actual] = (matrix[expected][actual] || 0) + 1;

  if (actual !== expected) {
    misses.push({
      name: fixture.name,
      expected,
      actual,
      reason: classified?.reason || "no deterministic rule matched"
    });
  }
}

const perLabel = labels.map((label) => {
  const tp = matrix[label]?.[label] || 0;
  const fp = labels.reduce((sum, other) => sum + (other === label ? 0 : (matrix[other]?.[label] || 0)), 0);
  const fn = labels.reduce((sum, other) => sum + (other === label ? 0 : (matrix[label]?.[other] || 0)), 0)
    + (matrix[label]?.unclassified || 0);
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { label, tp, fp, fn, precision, recall };
});

const correct = fixtures.length - misses.length;
const accuracy = correct / fixtures.length;

console.log(JSON.stringify({
  total: fixtures.length,
  correct,
  accuracy: round(accuracy),
  perLabel: perLabel.map((row) => ({
    ...row,
    precision: round(row.precision),
    recall: round(row.recall)
  })),
  misses
}, null, 2));

if (misses.length) {
  process.exitCode = 1;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
