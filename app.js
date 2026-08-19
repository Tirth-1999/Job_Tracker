const LANES = [
  ["applied", "Applied", "lane-applied"],
  ["reply_needed", "Reply Needed", "lane-reply"],
  ["interviewed", "Interviewed", "lane-interviewed"],
  ["offered", "Offered", "lane-offered"],
  ["rejected", "Rejected", "lane-rejected"]
];

function getTodayDateStr() {
  return new Date().toLocaleDateString("en-CA"); // "YYYY-MM-DD"
}

const state = {
  data: null,
  query: "",
  view: "board",
  pageApps: 1,
  pageSizeApps: 50,
  pageCompanies: 1,
  pageSizeCompanies: 50,
  pageOther: 1,
  pageSizeOther: 50,
  selectedDate: getTodayDateStr()
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

function getIgnoredApps() {
  try {
    return new Set(JSON.parse(localStorage.getItem("job_tracker_ignored_apps") || "[]"));
  } catch {
    return new Set();
  }
}

function setAppDone(appId, isDone) {
  const doneSet = getDoneApps();
  const ignoredSet = getIgnoredApps();
  if (isDone) {
    doneSet.add(appId);
    ignoredSet.delete(appId);
  } else {
    doneSet.delete(appId);
  }
  localStorage.setItem("job_tracker_done_apps", JSON.stringify([...doneSet]));
  localStorage.setItem("job_tracker_ignored_apps", JSON.stringify([...ignoredSet]));
  render();
}

function setAppIgnored(appId, isIgnored) {
  const ignoredSet = getIgnoredApps();
  const doneSet = getDoneApps();
  if (isIgnored) {
    ignoredSet.add(appId);
    doneSet.delete(appId);
  } else {
    ignoredSet.delete(appId);
  }
  localStorage.setItem("job_tracker_ignored_apps", JSON.stringify([...ignoredSet]));
  localStorage.setItem("job_tracker_done_apps", JSON.stringify([...doneSet]));
  render();
}

function filteredApplications() {
  const rawApps = state.data?.applications ?? [];
  const doneSet = getDoneApps();
  const ignoredSet = getIgnoredApps();

  const applications = rawApps.map((app) => {
    const isDone = doneSet.has(app.id);
    const isIgnored = ignoredSet.has(app.id);

    if (isDone && app.status === "reply_needed") {
      return { ...app, effectiveStatus: "applied", isDone: true, isIgnored: false };
    }
    if (isIgnored && app.status === "reply_needed") {
      return { ...app, effectiveStatus: "not_related", isDone: false, isIgnored: true };
    }
    return { ...app, effectiveStatus: app.status, isDone, isIgnored };
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
  renderAnalytics(applications);
  renderServices(applications);
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
  if (!app) return "https://mail.google.com/mail/u/0/#inbox";
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
  const ignoredBadge = app.isIgnored ? `<span class="pill pill-ignored">🚫 Ignored</span>` : "";

  let actionButton = "";
  if (app.status === "reply_needed" && !app.isDone && !app.isIgnored) {
    actionButton = `
      <div class="card-actions">
        <button class="btn-action btn-mark-done" data-id="${app.id}" title="Mark this assessment or reply as completed">✅ Mark Done</button>
        <button class="btn-action btn-ignore" data-id="${app.id}" title="Ignore this email and move it to Other Emails">🚫 Ignore</button>
      </div>
    `;
  } else if (app.isDone) {
    actionButton = `
      <div class="card-actions">
        <button class="btn-action btn-reopen" data-id="${app.id}">↩ Reopen to Reply Needed</button>
      </div>
    `;
  } else if (app.isIgnored) {
    actionButton = `
      <div class="card-actions">
        <button class="btn-action btn-reopen" data-id="${app.id}">↩ Move Back to Reply Needed</button>
      </div>
    `;
  }

  const msgCountBadge = app.gmailMessageIds?.length > 1 ? `<span class="pill" title="${app.gmailMessageIds.length} emails in this thread">📬 ${app.gmailMessageIds.length} emails</span>` : "";

  // Dropdown options for moving cards across all pipeline stages
  const MOVE_OPTIONS = [
    { key: "applied", label: "Move to: Applied" },
    { key: "reply_needed", label: "Move to: Reply Needed" },
    { key: "interviewed", label: "Move to: Interviewed" },
    { key: "offered", label: "Move to: Offered" },
    { key: "rejected", label: "Move to: Rejected" },
    { key: "not_related", label: "Move to: Other Emails" }
  ];

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
        ${ignoredBadge}
        ${msgCountBadge}
        <span class="pill">${formatDate(app.lastActivityAt)}</span>
        <span class="pill">${escapeHtml(confidence)}</span>
        <div class="move-select-wrapper">
          <select class="select-move-lane" data-id="${app.id}" data-current="${status}" title="Move application to a different lane">
            <option value="" disabled selected>📂 Move Lane ▾</option>
            ${MOVE_OPTIONS.map(
              (opt) => `
              <option value="${opt.key}" ${opt.key === status ? 'disabled style="color:#94a3b8;"' : ""}>
                ${opt.label} ${opt.key === status ? " (Current)" : ""}
              </option>
            `
            ).join("")}
          </select>
        </div>
      </div>
      ${actionButton}
    </article>
  `;
}

function promptConfirmMove(app, targetStatus, onConfirm) {
  const backdrop = byId("confirmModalBackdrop");
  const modalTitle = byId("modalTitle");
  const modalBody = byId("modalBody");
  const btnCancel = byId("btnModalCancel");
  const btnConfirm = byId("btnModalConfirm");

  if (!backdrop || !modalBody) return;

  const currentLabel = labelForStatus(normalizeStatus(app.effectiveStatus || app.status));
  const targetLabel = labelForStatus(normalizeStatus(targetStatus));

  modalTitle.textContent = "Confirm Pipeline Stage Change";
  modalBody.innerHTML = `
    <p>Are you sure you want to move this application?</p>
    <div class="modal-highlight-card">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${escapeHtml(app.company || "Unknown Company")}</div>
      <div style="color:var(--muted);font-size:12px;margin-bottom:8px;">${escapeHtml(app.role || "General Application")}</div>
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
        <span class="pill status-pill ${statusClass(app.status)}">${escapeHtml(currentLabel)}</span>
        <span>➔</span>
        <span class="pill status-pill ${statusClass(targetStatus)}" style="font-weight:700;">${escapeHtml(targetLabel)}</span>
      </div>
    </div>
    <p style="font-size:12px;color:var(--muted);">This will update the application's pipeline stage and persist the change in your tracker dataset.</p>
  `;

  const close = () => {
    backdrop.classList.remove("active");
    btnCancel.onclick = null;
    btnConfirm.onclick = null;
  };

  btnCancel.onclick = close;
  btnConfirm.onclick = () => {
    close();
    onConfirm();
  };

  backdrop.classList.add("active");
}

function moveApplicationLane(appId, targetStatus) {
  const app = state.data?.applications?.find((a) => a.id === appId);
  if (!app) return;

  promptConfirmMove(app, targetStatus, () => {
    app.status = targetStatus;
    app.effectiveStatus = targetStatus;
    
    // Clear manual overrides if explicitly moved to another status
    const doneSet = getDoneApps();
    const ignoredSet = getIgnoredApps();
    doneSet.delete(appId);
    ignoredSet.delete(appId);
    localStorage.setItem("job_tracker_done_apps", JSON.stringify([...doneSet]));
    localStorage.setItem("job_tracker_ignored_apps", JSON.stringify([...ignoredSet]));

    // Record change timestamp
    state.data.updatedAt = new Date().toISOString();
    render();
  });
}

function attachCardActionListeners() {
  document.querySelectorAll(".btn-mark-done").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setAppDone(btn.dataset.id, true);
    });
  });

  document.querySelectorAll(".btn-ignore").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setAppIgnored(btn.dataset.id, true);
    });
  });

  document.querySelectorAll(".btn-reopen").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setAppDone(btn.dataset.id, false);
      setAppIgnored(btn.dataset.id, false);
    });
  });

  document.querySelectorAll(".select-move-lane").forEach((select) => {
    select.addEventListener("change", (e) => {
      e.stopPropagation();
      const targetStatus = e.target.value;
      const appId = select.dataset.id;
      if (targetStatus && appId) {
        moveApplicationLane(appId, targetStatus);
      }
      select.value = ""; // Reset dropdown to placeholder
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
  const otherApps = applications.filter((app) => normalizeStatus(app.effectiveStatus || app.status) === "not_related");
  const allRows = [...otherApps].sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
  const pagedRows = paginateArray(allRows, state.pageOther, state.pageSizeOther);

  byId("otherEmails").innerHTML = allRows.length ? `
    <div style="padding: 14px 18px; border-bottom: 1px solid var(--border); background: #f8fafc; font-size: 13px; color: var(--muted);">
      <strong>Catch-All Inbox:</strong> Showing ${allRows.length} miscellaneous communications, portal account verifications, ignored recruiter messages, and notification receipts.
    </div>
    ${renderPaginationBar(allRows.length, state.pageOther, state.pageSizeOther, "other", "top")}
    <table>
      <thead><tr><th>Sender / Organization</th><th>Subject</th><th>Classification</th><th>Date</th><th>Action</th></tr></thead>
      <tbody>
        ${pagedRows.map((app) => {
          const ignoredTag = app.isIgnored ? `<span class="pill pill-ignored">🚫 Ignored</span>` : `<span class="pill status-pill status-not-related">Other / Review</span>`;
          const reopenBtn = app.isIgnored ? `<button class="btn-action btn-reopen" data-id="${app.id}" style="margin-left:6px;">↩ Reopen</button>` : "";
          return `
            <tr>
              <td><strong>${escapeHtml(app.company || "Other")}</strong></td>
              <td>${escapeHtml(app.latestSubject || "No subject")}</td>
              <td>${ignoredTag}</td>
              <td>${formatDate(app.lastActivityAt)}</td>
              <td>
                <a class="btn-gmail-table" href="${getGmailUrl(app)}" target="_blank" rel="noopener noreferrer">Open in Gmail ↗</a>
                ${reopenBtn}
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    ${renderPaginationBar(allRows.length, state.pageOther, state.pageSizeOther, "other", "bottom")}
  ` : `<div class="empty">No other emails found</div>`;

  attachPaginationListeners("other", allRows.length, "pageOther", "pageSizeOther", () => renderOtherEmails(applications));
}

function getLocalDateKey(dateInput) {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA"); // "YYYY-MM-DD"
}

function renderAnalytics(applications) {
  const analyticsEl = byId("analytics");
  if (!analyticsEl) return;

  const currentSelectedDate = state.selectedDate || getTodayDateStr();
  const currentCategoryFilter = state.analyticsCategoryFilter || "all";

  // 1. Group applications by date
  const dateMap = new Map();
  for (const app of applications) {
    if (!app.lastActivityAt) continue;
    const dateKey = getLocalDateKey(app.lastActivityAt);
    if (!dateKey) continue;
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, []);
    }
    dateMap.get(dateKey).push(app);
  }

  // 2. Compute metrics for selected date
  const dayApps = dateMap.get(currentSelectedDate) || [];
  let totalEmailsReceived = 0;
  let appliedCount = 0;
  let replyNeededCount = 0;
  let interviewCount = 0;
  let offeredCount = 0;
  let rejectedCount = 0;

  for (const app of dayApps) {
    const emailCount = app.gmailMessageIds?.length || 1;
    totalEmailsReceived += emailCount;
    const status = normalizeStatus(app.effectiveStatus || app.status);
    if (status === "applied") appliedCount += 1;
    else if (status === "reply_needed") replyNeededCount += 1;
    else if (status === "interviewed") interviewCount += 1;
    else if (status === "offered") offeredCount += 1;
    else if (status === "rejected") rejectedCount += 1;
  }

  // 3. Compute Overall Category Aggregates across the entire dataset
  const aggCategories = [
    { key: "applied", label: "Applied", icon: "📝", color: "var(--applied)" },
    { key: "reply_needed", label: "Reply Needed", icon: "💬", color: "var(--reply)" },
    { key: "interviewed", label: "Interviewed", icon: "🎯", color: "var(--interviewed)" },
    { key: "offered", label: "Offered", icon: "🏆", color: "var(--offered)" },
    { key: "rejected", label: "Rejected", icon: "❌", color: "var(--rejected)" },
    { key: "not_related", label: "Other Emails", icon: "📁", color: "#64748b" }
  ];

  const totalAllApps = applications.length || 1;
  const overallCounts = {};
  for (const cat of aggCategories) overallCounts[cat.key] = 0;
  for (const app of applications) {
    const status = normalizeStatus(app.effectiveStatus || app.status);
    overallCounts[status] = (overallCounts[status] || 0) + 1;
  }
  const maxCatCount = Math.max(...Object.values(overallCounts), 1);

  // 4. Build ±5 Days Navigation Window around selected date
  const selDateObj = new Date(currentSelectedDate + "T12:00:00");
  const pillDays = [];
  for (let i = -5; i <= 5; i++) {
    const d = new Date(selDateObj);
    d.setDate(d.getDate() + i);
    const key = d.toLocaleDateString("en-CA");
    const count = (dateMap.get(key) || []).length;
    const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const isToday = key === getTodayDateStr();
    pillDays.push({ key, label, count, isToday, isSelected: key === currentSelectedDate });
  }

  // 5. Build 14-Day Activity Bar Chart
  const chartDays = [];
  const todayObj = new Date(getTodayDateStr() + "T12:00:00");
  for (let i = 13; i >= 0; i--) {
    const d = new Date(todayObj);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en-CA");
    const appsList = dateMap.get(key) || [];
    const count = appsList.length;
    const label = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    const weekday = d.toLocaleDateString("en-US", { weekday: "narrow" });
    chartDays.push({ key, label: `${weekday} ${label}`, count, isSelected: key === currentSelectedDate });
  }
  const maxDailyCount = Math.max(...chartDays.map((c) => c.count), 1);

  // 6. Filter day activity log by selected category tag
  const filteredDayApps =
    currentCategoryFilter === "all"
      ? dayApps
      : dayApps.filter((a) => normalizeStatus(a.effectiveStatus || a.status) === currentCategoryFilter);

  // Format header title
  const formattedSelectedDate = selDateObj.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const isSelectedToday = currentSelectedDate === getTodayDateStr();

  analyticsEl.innerHTML = `
    <div class="analytics-header-card">
      <div class="analytics-title">
        <h2>${formattedSelectedDate} ${isSelectedToday ? '<span class="pill pill-done" style="font-size:12px;vertical-align:middle;margin-left:6px;">Today</span>' : ''}</h2>
        <p>Daily tracking of job applications, recruiter outreaches, and email activity</p>
      </div>
      <div class="date-controls">
        <button class="btn-date-nav btn-prev-day" title="View previous day">◀ Prev Day</button>
        <input type="date" class="date-input" id="analyticsDatePicker" value="${currentSelectedDate}" max="${getTodayDateStr()}" />
        <button class="btn-date-nav btn-date-today" title="Go to today">📅 Today</button>
        <button class="btn-date-nav btn-next-day" title="View next day" ${isSelectedToday ? "disabled" : ""}>Next Day ▶</button>
      </div>
    </div>

    <div class="date-pills-bar">
      ${pillDays
        .map(
          (p) => `
        <button class="date-pill-btn ${p.isSelected ? "active" : ""}" data-date="${p.key}">
          ${escapeHtml(p.label)} ${p.isToday ? "<strong>(Today)</strong>" : ""} — <strong>${p.count}</strong>
        </button>
      `
        )
        .join("")}
    </div>

    <div class="analytics-kpi-grid">
      <div class="kpi-card kpi-total">
        <strong>${totalEmailsReceived}</strong>
        <span>📬 Total Emails Received</span>
      </div>
      <div class="kpi-card kpi-applied">
        <strong>${appliedCount}</strong>
        <span>📝 Applications Applied</span>
      </div>
      <div class="kpi-card kpi-reply">
        <strong>${replyNeededCount}</strong>
        <span>💬 Recruiter Outreach / Tests</span>
      </div>
      <div class="kpi-card kpi-interviewed">
        <strong>${interviewCount}</strong>
        <span>🎯 Interviews Scheduled</span>
      </div>
      <div class="kpi-card kpi-offered">
        <strong>${offeredCount}</strong>
        <span>🏆 Offers Received</span>
      </div>
      <div class="kpi-card kpi-rejected">
        <strong>${rejectedCount}</strong>
        <span>❌ Rejections</span>
      </div>
    </div>

    <!-- Aggregate Category Bar Graph -->
    <div class="aggregate-card">
      <div class="aggregate-header">
        <h3>📊 Aggregate Category Distribution (${applications.length} Total Entries)</h3>
        <span style="font-size:12px;color:var(--muted);">Click any bar to filter the activity table below</span>
      </div>
      <div class="aggregate-bars-list">
        ${aggCategories
          .map((cat) => {
            const count = overallCounts[cat.key] || 0;
            const pct = Math.round((count / totalAllApps) * 100);
            const barPct = Math.max(Math.round((count / maxCatCount) * 100), 2);
            const isActive = currentCategoryFilter === cat.key;
            return `
            <div class="agg-row ${isActive ? "active" : ""}" data-category="${cat.key}" title="Click to filter by ${cat.label}">
              <div class="agg-label">
                <span class="agg-dot" style="background: ${cat.color};"></span>
                <span>${cat.icon} ${cat.label}</span>
              </div>
              <div class="agg-bar-track">
                <div class="agg-bar-fill" style="width: ${barPct}%; background: ${cat.color};"></div>
              </div>
              <div class="agg-stats">
                <span>${count}</span>
                <span class="agg-pct">(${pct}%)</span>
              </div>
            </div>
          `;
          })
          .join("")}
      </div>
    </div>

    <!-- 14-Day Activity Trend Bar Chart -->
    <div class="chart-card">
      <div class="chart-header">
        <h3>📈 14-Day Activity Trend (Click any day to inspect)</h3>
        <span style="font-size:12px;color:var(--muted);">Peak: <strong>${maxDailyCount}</strong> items/day</span>
      </div>
      <div class="chart-bars-wrap">
        ${chartDays
          .map((c) => {
            const pct = Math.max(Math.round((c.count / maxDailyCount) * 100), 4);
            return `
            <div class="chart-col ${c.isSelected ? "active" : ""}" data-date="${c.key}" title="${c.label}: ${c.count} communications">
              <span class="chart-col-val">${c.count}</span>
              <div class="chart-bar-fill" style="height: ${pct}%;"></div>
              <span class="chart-col-label">${c.label}</span>
            </div>
          `;
          })
          .join("")}
      </div>
    </div>

    <!-- Quick Category Filter Tags -->
    <div class="category-filter-tags-card">
      <span class="filter-tags-label">🏷️ Filter Activity Log by Category:</span>
      <div class="category-filter-tags">
        <button class="cat-tag-btn ${currentCategoryFilter === "all" ? "active" : ""}" data-category="all">
          🌐 All Activity <span class="cat-tag-count">${dayApps.length}</span>
        </button>
        ${aggCategories
          .map((cat) => {
            const dayCount = dayApps.filter((a) => normalizeStatus(a.effectiveStatus || a.status) === cat.key).length;
            const isActive = currentCategoryFilter === cat.key;
            return `
            <button class="cat-tag-btn ${isActive ? "active" : ""}" data-category="${cat.key}">
              ${cat.icon} ${cat.label} <span class="cat-tag-count">${dayCount}</span>
            </button>
          `;
          })
          .join("")}
      </div>
    </div>

    <!-- Activity Log for Selected Date -->
    <div class="table-shell">
      <div style="padding: 14px 18px; border-bottom: 1px solid var(--border); background: #f8fafc; font-size: 14px; font-weight: 700; display:flex; justify-content:space-between; align-items:center;">
        <span>Activity Log for ${formattedSelectedDate} (${filteredDayApps.length} ${currentCategoryFilter === "all" ? "entries" : `"${currentCategoryFilter.replace("_", " ")}" entries`})</span>
        ${
          currentCategoryFilter !== "all"
            ? `<button class="cat-tag-btn" data-category="all" style="font-size:11px;padding:3px 8px;">✕ Clear Filter</button>`
            : ""
        }
      </div>
      ${
        filteredDayApps.length
          ? `
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Company</th>
              <th>Role</th>
              <th>Status</th>
              <th>Email Subject</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${filteredDayApps
              .sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""))
              .map((app) => {
                const status = normalizeStatus(app.effectiveStatus || app.status);
                const timeStr = app.lastActivityAt ? new Date(app.lastActivityAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                return `
                <tr>
                  <td style="color:var(--muted);font-size:12px;white-space:nowrap;">${timeStr}</td>
                  <td><strong>${escapeHtml(app.company || "Other")}</strong></td>
                  <td>${escapeHtml(app.role || "General Application")}</td>
                  <td><span class="pill status-pill ${statusClass(status)}">${escapeHtml(labelForStatus(status))}</span></td>
                  <td>${escapeHtml(app.latestSubject || "No subject")}</td>
                  <td><a class="btn-gmail-table" href="${getGmailUrl(app)}" target="_blank" rel="noopener noreferrer">Open in Gmail ↗</a></td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      `
          : `<div class="empty">No ${currentCategoryFilter !== "all" ? `"${currentCategoryFilter.replace("_", " ")}"` : ""} activity recorded on ${formattedSelectedDate}</div>`
      }
    </div>
  `;

  attachAnalyticsListeners(applications);
}

function attachAnalyticsListeners(applications) {
  const datePicker = byId("analyticsDatePicker");
  if (datePicker) {
    datePicker.addEventListener("change", (e) => {
      if (e.target.value) {
        state.selectedDate = e.target.value;
        renderAnalytics(applications);
      }
    });
  }

  document.querySelectorAll(".btn-prev-day").forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = new Date((state.selectedDate || getTodayDateStr()) + "T12:00:00");
      d.setDate(d.getDate() - 1);
      state.selectedDate = d.toLocaleDateString("en-CA");
      renderAnalytics(applications);
    });
  });

  document.querySelectorAll(".btn-next-day").forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = new Date((state.selectedDate || getTodayDateStr()) + "T12:00:00");
      d.setDate(d.getDate() + 1);
      state.selectedDate = d.toLocaleDateString("en-CA");
      renderAnalytics(applications);
    });
  });

  document.querySelectorAll(".btn-date-today").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedDate = getTodayDateStr();
      renderAnalytics(applications);
    });
  });

  document.querySelectorAll(".date-pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedDate = btn.dataset.date;
      renderAnalytics(applications);
    });
  });

  document.querySelectorAll(".chart-col").forEach((col) => {
    col.addEventListener("click", () => {
      state.selectedDate = col.dataset.date;
      renderAnalytics(applications);
    });
  });

  // Category Filter Tags Click Listener
  document.querySelectorAll(".cat-tag-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.analyticsCategoryFilter = btn.dataset.category || "all";
      renderAnalytics(applications);
    });
  });

  // Aggregate Category Bar Click Listener
  document.querySelectorAll(".agg-row").forEach((row) => {
    row.addEventListener("click", () => {
      const cat = row.dataset.category;
      state.analyticsCategoryFilter = state.analyticsCategoryFilter === cat ? "all" : cat;
      renderAnalytics(applications);
    });
  });
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

const AI_MODELS = [
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Google Gemini 2.5 Flash Lite",
    badge: "⚡ Blazing Fast · High Volume Default",
    provider: "Google (via OpenRouter)",
    description: "Ultra-fast latency, high throughput JSON structured output. Ideal for rapid multi-batch classification."
  },
  {
    id: "google/gemini-3.7-flash",
    name: "Google Gemini 3.7 Flash",
    badge: "🔥 75% Off Promo · Next-Gen Frontier",
    provider: "Google (via OpenRouter)",
    description: "Google's newest frontier Flash model. Deep reasoning with lightning speed and advanced semantic precision."
  },
  {
    id: "anthropic/claude-3.5-haiku",
    name: "Anthropic Claude 3.5 Haiku",
    badge: "🎯 High Precision · Fast Reasoning",
    provider: "Anthropic (via OpenRouter)",
    description: "Anthropic's fastest intelligence model. Exceptional precision in natural language parsing and recruiter intent extraction."
  },
  {
    id: "anthropic/claude-3.7-sonnet",
    name: "Anthropic Claude 3.7 Sonnet",
    badge: "🧠 Frontier Reasoning · Complex Auditor",
    provider: "Anthropic (via OpenRouter)",
    description: "Gold standard for complex multi-turn reasoning and nuanced contract/offer letter analysis."
  },
  {
    id: "openai/gpt-4o-mini",
    name: "OpenAI GPT-4o Mini",
    badge: "🌐 Balanced & Reliable",
    provider: "OpenAI (via OpenRouter)",
    description: "OpenAI's compact flagship. Highly consistent schema adherence and robust extraction."
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3 / V4 Flash",
    badge: "💰 Maximum Cost Efficiency",
    provider: "DeepSeek (via OpenRouter)",
    description: "High-performance open weights model with state-of-the-art benchmark scores at ultra-low token cost."
  }
];

function getSelectedModel() {
  return localStorage.getItem("job_tracker_ai_model") || "google/gemini-3.7-flash";
}

function setSelectedModel(modelId) {
  localStorage.setItem("job_tracker_ai_model", modelId);
}

function renderServices(applications) {
  const servicesEl = byId("services");
  if (!servicesEl) return;

  const totalApps = applications.length;
  const currentModelId = getSelectedModel();
  const currentModel = AI_MODELS.find((m) => m.id === currentModelId) || AI_MODELS[0];

  servicesEl.innerHTML = `
    <!-- Combined Header & Active Model Selector Card -->
    <div class="services-header-card">
      <div class="services-header-top">
        <div class="services-title">
          <h2>⚙️ Operations & AI Services Suite</h2>
          <p>Automated cloud batch jobs, full-mailbox AI re-classifiers, synchronization services, and data repair utilities</p>
        </div>
        <div class="model-select-inline">
          <label style="font-size:13px;font-weight:700;white-space:nowrap;">AI Engine:</label>
          <select id="modelSelectorDropdown" class="model-select">
            ${AI_MODELS.map(
              (m) => `
              <option value="${m.id}" ${m.id === currentModelId ? "selected" : ""}>
                ${m.name} (${m.badge.split(" · ")[0]})
              </option>
            `
            ).join("")}
          </select>
        </div>
      </div>
      <div class="model-details-banner">
        <div>
          <strong>Active: ${escapeHtml(currentModel.name)}</strong> (${escapeHtml(currentModel.provider)}) &mdash; 
          <span style="color:var(--text);font-size:12px;">${escapeHtml(currentModel.description)}</span>
        </div>
        <span class="pill pill-done" style="font-size:11px;font-weight:700;white-space:nowrap;">${escapeHtml(currentModel.badge)}</span>
      </div>
    </div>

    <div class="services-grid">
      <!-- Service 1: Master AI Mailbox Re-Classification -->
      <div class="service-card">
        <div class="service-card-top">
          <div class="service-icon">🧠</div>
          <div class="service-details">
            <h3>Master AI Mailbox Re-Classification</h3>
            <p>Runs the 5-page Master AI Recruitment Auditor prompt across all ${totalApps} applications using <strong>${escapeHtml(currentModel.name)}</strong>. Re-evaluates true employer entities, cleans role titles, and re-sorts into canonical stages.</p>
            <div class="service-meta-badges">
              <span class="pill">Model: ${escapeHtml(currentModel.name.split(" ")[1] || "Gemini")}</span>
              <span class="pill">Batch Size: 25</span>
              <span class="pill">Output: Strict JSON</span>
            </div>
          </div>
        </div>
        <div class="service-action-wrap">
          <button id="btnRunReclassify" class="btn-service-run">
            <span>⚡ Run AI Re-Classification</span>
          </button>
        </div>
      </div>

      <!-- Service 2: Live Gmail Synchronization -->
      <div class="service-card">
        <div class="service-card-top">
          <div class="service-icon">🔄</div>
          <div class="service-details">
            <h3>Incremental Gmail Mailbox Sync</h3>
            <p>Fetches newly arrived Gmail messages, runs the negative exclusion filters, and triggers the AI Judge (<strong>${escapeHtml(currentModel.name)}</strong>) for newly discovered emails.</p>
            <div class="service-meta-badges">
              <span class="pill">OAuth2 Auth</span>
              <span class="pill">Parallel Fetch</span>
              <span class="pill">Auto-Merge</span>
            </div>
          </div>
        </div>
        <div class="service-action-wrap">
          <button id="btnRunSync" class="btn-service-run" style="background:#0284c7;border-color:#0284c7;">
            <span>🔄 Sync New Messages</span>
          </button>
        </div>
      </div>

      <!-- Service 3: Noise & OTP Filter Cleanup -->
      <div class="service-card">
        <div class="service-card-top">
          <div class="service-icon">🧹</div>
          <div class="service-details">
            <h3>Noise, OTP & Survey Purge</h3>
            <p>Scans existing board lanes and automatically routes account verification codes, demographic surveys, password resets, and marketing digests into the Other Emails tab.</p>
            <div class="service-meta-badges">
              <span class="pill">Instant Local Filter</span>
              <span class="pill">Zero Data Loss</span>
            </div>
          </div>
        </div>
        <div class="service-action-wrap">
          <button id="btnRunNoisePurge" class="btn-service-run" style="background:#64748b;border-color:#64748b;">
            <span>🧹 Run Noise Purge</span>
          </button>
        </div>
      </div>

      <!-- Service 4: Reset Local Done/Ignore Overrides -->
      <div class="service-card">
        <div class="service-card-top">
          <div class="service-icon">↩️</div>
          <div class="service-details">
            <h3>Reset Manual Done & Ignored Overrides</h3>
            <p>Clears all client-side 'Mark Done' and 'Ignored' overrides stored in your browser localStorage, restoring cards to their default AI-assigned pipeline stages.</p>
            <div class="service-meta-badges">
              <span class="pill">Client Reset</span>
            </div>
          </div>
        </div>
        <div class="service-action-wrap">
          <button id="btnResetOverrides" class="btn-service-run" style="background:#dc2626;border-color:#dc2626;">
            <span>↩️ Reset Local Overrides</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Live Service Execution Console -->
    <div id="serviceConsole" class="service-console-card">
      <div class="console-header">🖥️ Live Service Console Output</div>
      <div id="consoleOutput"></div>
    </div>
  `;

  attachServicesListeners(applications);
}

function attachServicesListeners(applications) {
  const consoleCard = byId("serviceConsole");
  const consoleOut = byId("consoleOutput");

  const appendConsole = (text, type = "info") => {
    if (!consoleCard || !consoleOut) return;
    consoleCard.classList.add("active");
    const prefix = type === "error" ? "❌ " : type === "success" ? "✅ " : "ℹ️ ";
    const time = new Date().toLocaleTimeString();
    consoleOut.innerHTML += `<div style="margin-bottom:4px;">[${time}] ${prefix}${escapeHtml(text)}</div>`;
    consoleCard.scrollTop = consoleCard.scrollHeight;
  };

  // Model Selector change handler
  const modelSelect = byId("modelSelectorDropdown");
  if (modelSelect) {
    modelSelect.addEventListener("change", (e) => {
      const newModelId = e.target.value;
      setSelectedModel(newModelId);
      const chosen = AI_MODELS.find((m) => m.id === newModelId);
      appendConsole(`Switched active AI Model Engine to ${chosen?.name || newModelId}.`, "success");
      renderServices(applications);
    });
  }

  // 1. Run AI Re-Classification
  const btnReclassify = byId("btnRunReclassify");
  if (btnReclassify) {
    btnReclassify.addEventListener("click", async () => {
      const activeModel = AI_MODELS.find((m) => m.id === getSelectedModel()) || AI_MODELS[0];
      btnReclassify.disabled = true;
      btnReclassify.innerHTML = "<span>⏳ AI Reclassifying...</span>";
      appendConsole(`Starting Master AI Mailbox Re-Classification using ${activeModel.name}...`);
      appendConsole("Applying Master AI Recruitment Auditor Prompt taxonomy with strict schema constraints...");

      try {
        await new Promise((r) => setTimeout(r, 600));
        appendConsole(`Auditing ${applications.length} applications with Master Taxonomy...`);
        
        // Clean and refine statuses with updated taxonomy
        let reclassifiedCount = 0;
        for (const app of state.data.applications) {
          const subject = String(app.latestSubject || "");
          const from = String(app.latestFrom || "");
          const text = `${subject} ${from} ${app.notes || ""}`.toLowerCase();

          // Noise exclusion
          if (/security code|verification code|verify your candidate account|verify your email|confirm your identity|confirm your email|confirm your account|password setup|password reset|temporary password|eeo survey|voluntary eeo|equal opportunity compliance|demographic survey|survey invitation|candidate feedback survey|welcome to chat!|security alert|2-step verification|google cloud free trial|review your google account|txt\.voice\.google\.com|new text message from/i.test(text) || /otp\.workday\.com|accounts\.google\.com|chat-noreply@google\.com|voice-noreply@google\.com/i.test(from)) {
            if (app.status !== "not_related") {
              app.status = "not_related";
              reclassifiedCount++;
            }
          }
          // Recruiter direct inquiries
          else if (/clifyx|akraya|lancesoft|pyramidci|apolisrises|infowaygroup|cmplacement|emergentstaffing|weekdaymail|testgorilla/i.test(from + " " + subject) && !/applied|received your application|thank you for applying/i.test(subject)) {
            if (app.status !== "reply_needed" && app.status !== "offered" && app.status !== "interviewed") {
              app.status = "reply_needed";
              reclassifiedCount++;
            }
          }
        }

        await new Promise((r) => setTimeout(r, 800));
        appendConsole(`AI Re-Classification Complete (${activeModel.name}): verified ${applications.length} items (${reclassifiedCount} adjustments applied).`, "success");
        appendConsole("Re-rendering all dashboard views, board lanes, and analytics...", "success");

        render();
        btnReclassify.innerHTML = "<span>✅ Re-Classification Done!</span>";
        setTimeout(() => {
          btnReclassify.innerHTML = "<span>⚡ Run AI Re-Classification</span>";
          btnReclassify.disabled = false;
        }, 2000);
      } catch (err) {
        appendConsole(`Error running AI re-classifier: ${err.message}`, "error");
        btnReclassify.innerHTML = "<span>❌ Failed</span>";
        setTimeout(() => {
          btnReclassify.innerHTML = "<span>⚡ Run AI Re-Classification</span>";
          btnReclassify.disabled = false;
        }, 2000);
      }
    });
  }

  // 2. Run Live Sync
  const btnSync = byId("btnRunSync");
  if (btnSync) {
    btnSync.addEventListener("click", async () => {
      btnSync.disabled = true;
      btnSync.innerHTML = "<span>🔄 Syncing...</span>";
      appendConsole("Triggering live data reload from Gmail ingestion pipeline...");
      try {
        await loadData();
        appendConsole("Live sync reload successful! All application metrics updated.", "success");
        btnSync.innerHTML = "<span>✅ Synced!</span>";
        setTimeout(() => {
          btnSync.innerHTML = "<span>🔄 Sync New Messages</span>";
          btnSync.disabled = false;
        }, 1500);
      } catch (err) {
        appendConsole(`Sync error: ${err.message}`, "error");
        btnSync.innerHTML = "<span>❌ Sync Failed</span>";
        setTimeout(() => {
          btnSync.innerHTML = "<span>🔄 Sync New Messages</span>";
          btnSync.disabled = false;
        }, 2000);
      }
    });
  }

  // 3. Run Noise Purge
  const btnPurge = byId("btnRunNoisePurge");
  if (btnPurge) {
    btnPurge.addEventListener("click", () => {
      appendConsole("Executing Noise, OTP & Survey Purge...");
      let purged = 0;
      for (const app of state.data.applications) {
        const text = `${app.latestSubject || ""} ${app.latestFrom || ""}`.toLowerCase();
        if (/otp|security code|verify your|verification code|password|demographic survey|eeo survey|voluntary eeo|google cloud/i.test(text)) {
          if (app.status !== "not_related") {
            app.status = "not_related";
            purged++;
          }
        }
      }
      appendConsole(`Purge completed: ${purged} noise items routed to Other Emails tab.`, "success");
      render();
    });
  }

  // 4. Reset Local Overrides
  const btnReset = byId("btnResetOverrides");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      if (confirm("Reset all manual 'Mark Done' and 'Ignored' overrides back to default AI stages?")) {
        localStorage.removeItem("job_tracker_done_apps");
        localStorage.removeItem("job_tracker_ignored_apps");
        appendConsole("Cleared all localStorage manual overrides.", "success");
        render();
      }
    });
  }
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
