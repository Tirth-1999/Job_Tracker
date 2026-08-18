const LANES = [
  ["applied", "Applied", "lane-applied"],
  ["reply_needed", "Reply Needed", "lane-reply"],
  ["interviewed", "Interviewed", "lane-interviewed"],
  ["offered", "Offered", "lane-offered"],
  ["rejected", "Rejected", "lane-rejected"]
];

const state = {
  data: null,
  query: "",
  view: "board",
  pageApps: 1,
  pageSizeApps: 50,
  pageCompanies: 1,
  pageSizeCompanies: 50,
  pageOther: 1,
  pageSizeOther: 50
};

const byId = (id) => document.getElementById(id);

async function loadData() {
  const response = await fetch(`./data/applications.json?t=${Date.now()}`);
  if (!response.ok) throw new Error(`Failed to load data: ${response.status}`);
  state.data = await response.json();
  render();
}

function getDoneApps() {
  try {
    return new Set(JSON.parse(localStorage.getItem("job_tracker_done_apps") || "[]"));
  } catch {
    return new Set();
  }
}

function setAppDone(appId, isDone) {
  const doneSet = getDoneApps();
  if (isDone) {
    doneSet.add(appId);
  } else {
    doneSet.delete(appId);
  }
  localStorage.setItem("job_tracker_done_apps", JSON.stringify([...doneSet]));
  render();
}

function filteredApplications() {
  const rawApps = state.data?.applications ?? [];
  const doneSet = getDoneApps();

  const applications = rawApps.map((app) => {
    const isDone = doneSet.has(app.id);
    if (isDone && app.status === "reply_needed") {
      return { ...app, effectiveStatus: "applied", isDone: true };
    }
    return { ...app, effectiveStatus: app.status, isDone };
  });

  const query = state.query.trim();
  if (!query) return applications;

  const lowerQuery = query.toLowerCase();
  const wordRegex = new RegExp(`\\b${query.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i");

  return applications.filter((app) => {
    const company = String(app.company || "");
    const role = String(app.role || "");
    const subject = String(app.latestSubject || "");
    const from = String(app.latestFrom || "");

    // 1. Exact or whole-word match on Company, Role, Subject, or From
    if (wordRegex.test(company) || wordRegex.test(role) || wordRegex.test(subject) || wordRegex.test(from)) {
      return true;
    }

    // 2. Substring match on company or role or subject if query is 4+ characters
    if (lowerQuery.length > 3) {
      if (
        company.toLowerCase().includes(lowerQuery) ||
        role.toLowerCase().includes(lowerQuery) ||
        subject.toLowerCase().includes(lowerQuery) ||
        from.toLowerCase().includes(lowerQuery)
      ) {
        return true;
      }
    }

    return false;
  });
}

function render() {
  const applications = filteredApplications();
  renderStatus();
  renderStats(applications);
  renderBoard(applications);
  renderCompanies(applications);
  renderApplications(applications);
  renderOtherEmails(applications);
  attachCardActionListeners();
}

function renderStatus() {
  const updatedAt = state.data?.updatedAt;
  byId("syncStatus").textContent = updatedAt
    ? `Last synced ${new Date(updatedAt).toLocaleString()}`
    : "No sync has run yet";
}

function renderStats(applications) {
  const counts = Object.fromEntries(LANES.map(([key]) => [key, 0]));
  let otherCount = 0;

  for (const app of applications) {
    const status = normalizeStatus(app.effectiveStatus || app.status);
    if (status === "not_related") {
      otherCount += 1;
    } else {
      counts[status] = (counts[status] ?? 0) + 1;
    }
  }

  const laneStatsHtml = LANES.map(([key, label, className]) => {
    return `<article class="stat ${className}"><strong>${counts[key] ?? 0}</strong><span>${label}</span></article>`;
  }).join("");

  const otherStatHtml = `<article class="stat lane-not-related stat-clickable" title="Click to view Other Emails tab"><strong>${otherCount}</strong><span>Other Emails</span></article>`;

  byId("stats").innerHTML = laneStatsHtml + otherStatHtml;

  const otherStatEl = document.querySelector(".stat-clickable");
  if (otherStatEl) {
    otherStatEl.addEventListener("click", () => switchTab("otherEmails"));
  }
}

function renderBoard(applications) {
  byId("board").innerHTML = LANES.map(([key, label, className]) => {
    const laneApps = applications.filter((app) => normalizeStatus(app.effectiveStatus || app.status) === key);
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
  const status = normalizeStatus(app.effectiveStatus || app.status);
  const gmailUrl = getGmailUrl(app);

  const doneBadge = app.isDone ? `<span class="pill pill-done">✅ Action Completed</span>` : "";

  let actionButton = "";
  if (app.status === "reply_needed" && !app.isDone) {
    actionButton = `
      <div class="card-actions">
        <button class="btn-action btn-mark-done" data-id="${app.id}">✅ Mark Done</button>
      </div>
    `;
  } else if (app.isDone) {
    actionButton = `
      <div class="card-actions">
        <button class="btn-action btn-reopen" data-id="${app.id}">↩ Reopen to Reply Needed</button>
      </div>
    `;
  }

  const msgCountBadge = app.gmailMessageIds?.length > 1 ? `<span class="pill" title="${app.gmailMessageIds.length} emails in this thread">📬 ${app.gmailMessageIds.length} emails</span>` : "";

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
        ${doneBadge}
        ${msgCountBadge}
        <span class="pill">${formatDate(app.lastActivityAt)}</span>
        <span class="pill">${escapeHtml(confidence)}</span>
        <a class="pill pill-link" href="${gmailUrl}" target="_blank" rel="noopener noreferrer">📧 Gmail ↗</a>
      </div>
      ${actionButton}
    </article>
  `;
}

function attachCardActionListeners() {
  document.querySelectorAll(".btn-mark-done").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setAppDone(btn.dataset.id, true);
    });
  });

  document.querySelectorAll(".btn-reopen").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setAppDone(btn.dataset.id, false);
    });
  });
}

function renderPaginationBar(totalItems, currentPage, pageSize, prefix, pos = "bottom") {
  if (totalItems === 0) return "";
  const isAll = pageSize === "all";
  const numPageSize = isAll ? totalItems : Number(pageSize);
  const totalPages = isAll ? 1 : Math.ceil(totalItems / numPageSize);
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const start = isAll ? 1 : (safePage - 1) * numPageSize + 1;
  const end = isAll ? totalItems : Math.min(safePage * numPageSize, totalItems);

  return `
    <div class="pagination-bar pagination-${pos}">
      <div class="pagination-info">
        Showing <strong>${start}–${end}</strong> of <strong>${totalItems}</strong> entries
      </div>
      <div class="pagination-controls">
        <label class="page-size-selector">
          Rows:
          <select class="${prefix}PageSizeSelect">
            <option value="25" ${pageSize == 25 ? "selected" : ""}>25</option>
            <option value="50" ${pageSize == 50 ? "selected" : ""}>50</option>
            <option value="100" ${pageSize == 100 ? "selected" : ""}>100</option>
            <option value="all" ${pageSize === "all" ? "selected" : ""}>All (${totalItems})</option>
          </select>
        </label>
        <button class="${prefix}PrevBtn btn-page" ${safePage <= 1 ? "disabled" : ""}>◀ Prev</button>
        <span class="page-current">Page ${safePage} of ${totalPages}</span>
        <button class="${prefix}NextBtn btn-page" ${safePage >= totalPages ? "disabled" : ""}>Next ▶</button>
      </div>
    </div>
  `;
}

function paginateArray(items, currentPage, pageSize) {
  if (pageSize === "all") return items;
  const numPageSize = Number(pageSize);
  const totalPages = Math.ceil(items.length / numPageSize) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (safePage - 1) * numPageSize;
  return items.slice(start, start + numPageSize);
}

function renderCompanies(applications) {
  const companies = new Map();
  for (const app of applications) {
    if (normalizeStatus(app.effectiveStatus || app.status) === "not_related") continue;
    const key = normalizeCompany(app.company);
    if (!companies.has(key)) {
      companies.set(key, {
        company: app.company || "Unknown company",
        count: 0,
        statuses: new Set(),
        lastActivityAt: app.lastActivityAt,
        latestApp: app,
        allApps: []
      });
    }
    const row = companies.get(key);
    row.count += 1;
    row.statuses.add(labelForStatus(normalizeStatus(app.effectiveStatus || app.status)));
    row.allApps.push(app);
    if ((app.lastActivityAt || "") >= (row.lastActivityAt || "")) {
      row.lastActivityAt = app.lastActivityAt;
      row.latestApp = app;
    }
  }

  const allRows = [...companies.values()].sort((a, b) => a.company.localeCompare(b.company));
  const pagedRows = paginateArray(allRows, state.pageCompanies, state.pageSizeCompanies);

  byId("companies").innerHTML = allRows.length ? `
    ${renderPaginationBar(allRows.length, state.pageCompanies, state.pageSizeCompanies, "comp", "top")}
    <table>
      <thead><tr><th>Company</th><th>Applications</th><th>Status</th><th>Last Activity</th><th>Action</th></tr></thead>
      <tbody>
        ${pagedRows.map((row) => {
          const directUrl = getGmailUrl(row.latestApp);
          return `
            <tr>
              <td><strong>${escapeHtml(row.company)}</strong></td>
              <td>${row.count}</td>
              <td>${[...row.statuses].map((status) => `<span class="pill">${escapeHtml(status)}</span>`).join(" ")}</td>
              <td>${formatDate(row.lastActivityAt)}</td>
              <td><a class="btn-gmail-table" href="${directUrl}" target="_blank" rel="noopener noreferrer" title="Open the exact email thread for ${escapeHtml(row.company)} in Gmail">Open Thread in Gmail ↗</a></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    ${renderPaginationBar(allRows.length, state.pageCompanies, state.pageSizeCompanies, "comp", "bottom")}
  ` : `<div class="empty">No companies found</div>`;

  attachPaginationListeners("comp", allRows.length, "pageCompanies", "pageSizeCompanies", () => renderCompanies(applications));
}

function renderApplications(applications) {
  const jobApps = applications.filter((app) => normalizeStatus(app.status) !== "not_related");
  const allRows = [...jobApps].sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
  const pagedRows = paginateArray(allRows, state.pageApps, state.pageSizeApps);

  byId("applications").innerHTML = allRows.length ? `
    ${renderPaginationBar(allRows.length, state.pageApps, state.pageSizeApps, "apps", "top")}
    <table>
      <thead><tr><th>Company</th><th>Role</th><th>Status</th><th>Latest Email</th><th>Last Activity</th><th>Action</th></tr></thead>
      <tbody>
        ${pagedRows.map((app) => `
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
    ${renderPaginationBar(allRows.length, state.pageApps, state.pageSizeApps, "apps", "bottom")}
  ` : `<div class="empty">No applications found</div>`;

  attachPaginationListeners("apps", allRows.length, "pageApps", "pageSizeApps", () => renderApplications(applications));
}

function renderOtherEmails(applications) {
  const otherApps = applications.filter((app) => normalizeStatus(app.status) === "not_related");
  const allRows = [...otherApps].sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
  const pagedRows = paginateArray(allRows, state.pageOther, state.pageSizeOther);

  byId("otherEmails").innerHTML = allRows.length ? `
    <div style="padding: 14px 18px; border-bottom: 1px solid var(--border); background: #f8fafc; font-size: 13px; color: var(--muted);">
      <strong>Catch-All Inbox:</strong> Showing ${allRows.length} miscellaneous communications, portal account verifications, non-standard notifications, and recruiter digests.
    </div>
    ${renderPaginationBar(allRows.length, state.pageOther, state.pageSizeOther, "other", "top")}
    <table>
      <thead><tr><th>Sender / Organization</th><th>Subject</th><th>Classification</th><th>Date</th><th>Action</th></tr></thead>
      <tbody>
        ${pagedRows.map((app) => `
          <tr>
            <td><strong>${escapeHtml(app.company || "Other")}</strong></td>
            <td>${escapeHtml(app.latestSubject || "No subject")}</td>
            <td><span class="pill status-pill status-not-related">Other / Review</span></td>
            <td>${formatDate(app.lastActivityAt)}</td>
            <td><a class="btn-gmail-table" href="${getGmailUrl(app)}" target="_blank" rel="noopener noreferrer">Open in Gmail ↗</a></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${renderPaginationBar(allRows.length, state.pageOther, state.pageSizeOther, "other", "bottom")}
  ` : `<div class="empty">No other emails found</div>`;

  attachPaginationListeners("other", allRows.length, "pageOther", "pageSizeOther", () => renderOtherEmails(applications));
}

function attachPaginationListeners(prefix, totalItems, pageKey, pageSizeKey, rerenderFn) {
  document.querySelectorAll(`.${prefix}PrevBtn`).forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state[pageKey] > 1) {
        state[pageKey] -= 1;
        rerenderFn();
      }
    });
  });

  document.querySelectorAll(`.${prefix}NextBtn`).forEach((btn) => {
    btn.addEventListener("click", () => {
      const numPageSize = state[pageSizeKey] === "all" ? totalItems : Number(state[pageSizeKey]);
      const totalPages = Math.ceil(totalItems / numPageSize) || 1;
      if (state[pageKey] < totalPages) {
        state[pageKey] += 1;
        rerenderFn();
      }
    });
  });

  document.querySelectorAll(`.${prefix}PageSizeSelect`).forEach((select) => {
    select.addEventListener("change", (e) => {
      state[pageSizeKey] = e.target.value === "all" ? "all" : Number(e.target.value);
      state[pageKey] = 1;
      rerenderFn();
    });
  });
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

function switchTab(viewName) {
  state.view = viewName;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewName));
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  const viewEl = byId(`${viewName}View`);
  if (viewEl) viewEl.classList.add("active");
}

function exportToExcel() {
  const applications = state.data?.applications ?? [];
  if (!applications.length) {
    alert("No application data available to export.");
    return;
  }

  // Headers for Excel / CSV export
  const headers = [
    "Company",
    "Role",
    "Status",
    "Last Activity Date",
    "Latest Email Subject",
    "Latest From (Sender)",
    "Confidence",
    "Emails in Thread",
    "Direct Gmail Link",
    "Notes / Snippet"
  ];

  // Helper to safely escape CSV values for Excel
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = applications.map((app) => {
    const status = normalizeStatus(app.effectiveStatus || app.status);
    const gmailUrl = getGmailUrl(app);
    return [
      escapeCsv(app.company || "Unknown"),
      escapeCsv(app.role || "General Application"),
      escapeCsv(labelForStatus(status)),
      escapeCsv(app.lastActivityAt ? new Date(app.lastActivityAt).toLocaleDateString() : ""),
      escapeCsv(app.latestSubject || ""),
      escapeCsv(app.latestFrom || ""),
      escapeCsv(app.confidence || "high"),
      escapeCsv(app.gmailMessageIds?.length || 1),
      escapeCsv(gmailUrl),
      escapeCsv(app.notes || "")
    ].join(",");
  });

  // UTF-8 BOM (\uFEFF) ensures Excel displays international characters and punctuation cleanly
  const csvContent = "\uFEFF" + [headers.map((h) => `"${h}"`).join(","), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `job_applications_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

byId("searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  state.pageApps = 1;
  state.pageCompanies = 1;
  state.pageOther = 1;
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

const exportBtn = byId("exportButton");
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    exportToExcel();
  });
}

for (const button of document.querySelectorAll(".tab")) {
  button.addEventListener("click", () => {
    switchTab(button.dataset.view);
  });
}

loadData().catch((error) => {
  byId("syncStatus").textContent = error.message;
});
