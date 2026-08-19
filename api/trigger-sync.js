// api/trigger-sync.js
// Vercel Serverless Function — Triggers Gmail Sync GitHub Actions workflow
// GITHUB_TOKEN is set in Vercel dashboard env vars — never exposed to the browser.

const GITHUB_REPO = "Tirth-1999/Job_Tracker";
const WORKFLOW_FILE = "gmail-sync.yml";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({
      error: "GITHUB_TOKEN not configured in Vercel. Add it under Project → Settings → Environment Variables."
    });
  }

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ref: "main" })
    }
  );

  if (!dispatchRes.ok) {
    const err = await dispatchRes.json().catch(() => ({}));
    return res.status(dispatchRes.status).json({
      error: err.message || `GitHub dispatch failed: HTTP ${dispatchRes.status}`
    });
  }

  await new Promise((r) => setTimeout(r, 3000));

  const runsRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1&branch=main`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
  );

  if (!runsRes.ok) {
    return res.status(200).json({ success: true, run_id: null, status: "queued" });
  }

  const runsData = await runsRes.json();
  const latestRun = runsData.workflow_runs?.[0];

  return res.status(200).json({
    success: true,
    run_id: latestRun?.id ?? null,
    status: latestRun?.status ?? "queued"
  });
}
