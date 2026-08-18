const LANES = [
  ["applied", "Applied", "lane-applied"],
  ["reply_needed", "Reply Needed", "lane-reply"],
  ["interviewed", "Interviewed", "lane-interviewed"],
  ["offered", "Offered", "lane-offered"],
  ["rejected", "Rejected", "lane-rejected"],
  ["not_related", "Other / Review", "lane-not-related"]
];

const state = {
  data: null,
  query: "",
  view: "board"
};

const byId = (id) => document.getElementById(id);

async function loadData() {
  const response = await fetch(`./data/applications.json?t=${Date.now()}`);
  if (!response.ok) throw new Error(`Failed to load data: ${response.status}`);
  state.data = await response.json();
  render();
}

function filteredApplications() {
  const applications = state.data?.applications ?? [];
  const query = state.query.trim().toLowerCase();
  if (!query) return applications;

  return applications.filter((app) => {
    return [app.company, app.role, app.status, app.latestSubject, app.latestFrom, app.notes]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function render() {
  const applications = filteredApplications();
  renderStatus();
  renderStats(applications);
  renderBoard(applications);
  renderCompanies(applications);
  renderApplications(applications);
}

function renderStatus() {
  const updatedAt = state.data?.updatedAt;
  byId("syncStatus").textContent = updatedAt
    ? `Last synced ${new Date(updatedAt).toLocaleString()}`
    : "No sync has run yet";
}

function renderStats(applications) {
  const counts = Object.fromEntries(LANES.map(([key]) => [key, 0]));
  for (const app of applications) {
    const status = normalizeStatus(app.status);
    counts[status] = (counts[status] ?? 0) + 1;
  }

  byId("stats").innerHTML = LANES.map(([key, label, className]) => {
    return `<article class="stat ${className}"><strong>${counts[key] ?? 0}</strong><span>${label}</span></article>`;
  }).join("");
}

function renderBoard(applications) {
  byId("board").innerHTML = LANES.map(([key, label, className]) => {
    const laneApps = applications.filter((app) => normalizeStatus(app.status) === key);
    return `
      <section class="lane ${className}">
        <div class="lane-header">
          <span>${label}</span>
          <span class="lane-count">${laneApps.length}</span>
        </div>
        <div class="cards">
          ${laneApps.map(renderCard).join("") || `<div class="empty">No applications</div>`}
        </div>
      </section>
    `;
  }).join("");
}

function getGmailUrl(app) {
  if (app.gmailThreadId) {
    return `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(app.gmailThreadId)}`;
  }
  if (app.gmailMessageIds?.length) {
    return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(app.gmailMessageIds[0])}`;
  }
  if (app.company || app.latestSubject) {
    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(app.company || app.latestSubject)}`;
  }
  return "https://mail.google.com/mail/u/0/#inbox";
}

function renderCard(app) {
  const confidence = app.confidence ? `${app.confidence} confidence` : "unscored";
  const status = normalizeStatus(app.status);
  const gmailUrl = getGmailUrl(app);

  return `
    <article class="card ${statusClass(status)}">
      <div class="card-header">
        <h3>${escapeHtml(app.company || "Unknown company")}</h3>
        <a class="btn-gmail-icon" href="${gmailUrl}" target="_blank" rel="noopener noreferrer" title="Open this thread directly in Gmail">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
          Open
        </a>
      </div>
      <div class="role">${escapeHtml(app.role || "Unknown role")}</div>
      <div class="subject">${escapeHtml(app.latestSubject || "No subject")}</div>
      <div class="meta">
        <span class="pill status-pill ${statusClass(status)}">${escapeHtml(labelForStatus(status))}</span>
        <span class="pill">${formatDate(app.lastActivityAt)}</span>
        <span class="pill">${escapeHtml(confidence)}</span>
        <a class="pill pill-link" href="${gmailUrl}" target="_blank" rel="noopener noreferrer">📧 Gmail ↗</a>
      </div>
    </article>
  `;
}

function renderCompanies(applications) {
  const companies = new Map();
  for (const app of applications) {
    const key = normalizeCompany(app.company);
    if (!companies.has(key)) {
      companies.set(key, {
        company: app.company || "Unknown company",
        count: 0,
        statuses: new Set(),
        lastActivityAt: app.lastActivityAt
      });
    }
    const row = companies.get(key);
    row.count += 1;
    row.statuses.add(labelForStatus(normalizeStatus(app.status)));
    if ((app.lastActivityAt || "") > (row.lastActivityAt || "")) row.lastActivityAt = app.lastActivityAt;
  }

  const rows = [...companies.values()].sort((a, b) => a.company.localeCompare(b.company));
  byId("companies").innerHTML = rows.length ? `
    <table>
      <thead><tr><th>Company</th><th>Applications</th><th>Status</th><th>Last Activity</th><th>Action</th></tr></thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td><strong>${escapeHtml(row.company)}</strong></td>
            <td>${row.count}</td>
            <td>${[...row.statuses].map((status) => `<span class="pill">${escapeHtml(status)}</span>`).join(" ")}</td>
            <td>${formatDate(row.lastActivityAt)}</td>
            <td><a class="btn-gmail-table" href="https://mail.google.com/mail/u/0/#search/${encodeURIComponent(row.company)}" target="_blank" rel="noopener noreferrer">Search in Gmail ↗</a></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : `<div class="empty">No companies found</div>`;
}

function renderApplications(applications) {
  const rows = [...applications].sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
  byId("applications").innerHTML = rows.length ? `
    <table>
      <thead><tr><th>Company</th><th>Role</th><th>Status</th><th>Latest Email</th><th>Last Activity</th><th>Action</th></tr></thead>
      <tbody>
        ${rows.map((app) => `
          <tr>
            <td><strong>${escapeHtml(app.company || "Unknown company")}</strong></td>
            <td>${escapeHtml(app.role || "Unknown role")}</td>
            <td><span class="pill status-pill ${statusClass(normalizeStatus(app.status))}">${escapeHtml(labelForStatus(normalizeStatus(app.status)))}</span></td>
            <td>${escapeHtml(app.latestSubject || "No subject")}</td>
            <td>${formatDate(app.lastActivityAt)}</td>
            <td><a class="btn-gmail-table" href="${getGmailUrl(app)}" target="_blank" rel="noopener noreferrer">Open in Gmail ↗</a></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : `<div class="empty">No applications found</div>`;
}

function normalizeCompany(company) {
  return String(company || "unknown").trim().toLowerCase();
}

function labelForStatus(status) {
  return LANES.find(([key]) => key === normalizeStatus(status))?.[1] ?? "Applied";
}

function statusClass(status) {
  return `status-${normalizeStatus(status).replaceAll("_", "-")}`;
}

function normalizeStatus(status) {
  return status === "initial_revert_needed" ? "applied" : status || "applied";
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "Unknown";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

byId("searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

byId("refreshButton").addEventListener("click", async () => {
  const btn = byId("refreshButton");
  const origText = btn.textContent;
  btn.textContent = "🔄 Refreshing...";
  btn.disabled = true;
  try {
    await loadData();
    btn.textContent = "✅ Updated!";
    setTimeout(() => {
      btn.textContent = origText;
      btn.disabled = false;
    }, 1200);
  } catch (err) {
    btn.textContent = "❌ Failed";
    setTimeout(() => {
      btn.textContent = origText;
      btn.disabled = false;
    }, 2000);
  }
});

for (const button of document.querySelectorAll(".tab")) {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    byId(`${state.view}View`).classList.add("active");
  });
}

loadData().catch((error) => {
  byId("syncStatus").textContent = error.message;
});
