const LANES = [
  ["applied", "Applied"],
  ["initial_revert_needed", "Initial Revert Needed"],
  ["reply_needed", "Reply Needed"],
  ["interviewed", "Interviewed"],
  ["offered", "Offered"],
  ["rejected", "Rejected"]
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
  for (const app of applications) counts[app.status] = (counts[app.status] ?? 0) + 1;

  byId("stats").innerHTML = LANES.map(([key, label]) => {
    return `<article class="stat"><strong>${counts[key] ?? 0}</strong><span>${label}</span></article>`;
  }).join("");
}

function renderBoard(applications) {
  byId("board").innerHTML = LANES.map(([key, label]) => {
    const laneApps = applications.filter((app) => app.status === key);
    return `
      <section class="lane">
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

function renderCard(app) {
  return `
    <article class="card">
      <h3>${escapeHtml(app.company || "Unknown company")}</h3>
      <div class="role">${escapeHtml(app.role || "Unknown role")}</div>
      <div class="subject">${escapeHtml(app.latestSubject || "No subject")}</div>
      <div class="meta">
        <span class="pill">${formatDate(app.lastActivityAt)}</span>
        ${app.source === "gmail" ? `<span class="pill">Gmail</span>` : ""}
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
    row.statuses.add(labelForStatus(app.status));
    if ((app.lastActivityAt || "") > (row.lastActivityAt || "")) row.lastActivityAt = app.lastActivityAt;
  }

  const rows = [...companies.values()].sort((a, b) => a.company.localeCompare(b.company));
  byId("companies").innerHTML = rows.length ? `
    <table>
      <thead><tr><th>Company</th><th>Applications</th><th>Status</th><th>Last Activity</th></tr></thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.company)}</td>
            <td>${row.count}</td>
            <td>${escapeHtml([...row.statuses].join(", "))}</td>
            <td>${formatDate(row.lastActivityAt)}</td>
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
      <thead><tr><th>Company</th><th>Role</th><th>Status</th><th>Latest Email</th><th>Last Activity</th></tr></thead>
      <tbody>
        ${rows.map((app) => `
          <tr>
            <td>${escapeHtml(app.company || "Unknown company")}</td>
            <td>${escapeHtml(app.role || "Unknown role")}</td>
            <td>${escapeHtml(labelForStatus(app.status))}</td>
            <td>${escapeHtml(app.latestSubject || "No subject")}</td>
            <td>${formatDate(app.lastActivityAt)}</td>
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
  return LANES.find(([key]) => key === status)?.[1] ?? "Applied";
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

byId("refreshButton").addEventListener("click", loadData);

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
