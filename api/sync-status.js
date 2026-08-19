// api/sync-status.js
// Vercel Serverless Function — Polls a GitHub Actions run status by run_id
// GITHUB_TOKEN is read server-side — never exposed to the browser.

const GITHUB_REPO = "Tirth-1999/Job_Tracker";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { run_id } = req.query;
  if (!run_id) return res.status(400).json({ error: "run_id query param is required" });

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "GITHUB_TOKEN not configured in Vercel." });
  }

  const runRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${run_id}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
  );

  if (!runRes.ok) {
    return res.status(runRes.status).json({ error: `GitHub API error: HTTP ${runRes.status}` });
  }

  const run = await runRes.json();

  return res.status(200).json({
    run_id: run.id,
    status: run.status,         // "queued" | "in_progress" | "completed"
    conclusion: run.conclusion, // "success" | "failure" | "cancelled" | null
    html_url: run.html_url      // link to the Actions run page
  });
}
