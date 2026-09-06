const LANES = [
  ["applied", "Applied", "lane-applied"],
  ["reply_needed", "Reply Needed", "lane-reply"],
  ["interviewed", "Interview / Assessment", "lane-interviewed"],
  ["offered", "Offered", "lane-offered"],
  ["rejected", "Rejected", "lane-rejected"]
];

const ALLOWED_STATUSES = new Set(["applied", "reply_needed", "interviewed", "offered", "rejected", "not_related"]);

const GITHUB_REPO = "Tirth-1999/Job_Tracker";
const GITHUB_FILE_PATH = "data/applications.json";

// ─── Supabase Configuration ───────────────────────────────────────────────────
const SUPABASE_URL = "https://dykamjxudtxkwgfllxxy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_b2SuLtxZgeR-LGQRzMa3_A_lxV0bn75";
let supabaseClient = null;

function initSupabase() {
  // Already created — reuse
  if (supabaseClient) return supabaseClient;
  // CDN exports as window.supabase
  const lib = window.supabase ?? window.supabaseJs;
  if (!lib) {
    console.error("Supabase CDN library not found on window.supabase");
    return null;
  }
  try {
    supabaseClient = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } }
    });
    console.log("✅ Supabase client initialized:", SUPABASE_URL);
  } catch (err) {
    console.error("Failed to create Supabase client:", err.message);
    return null;
  }
  return supabaseClient;
}

// ─── Tirth Shah Portfolio & Career Context for AI Reply Generator ─────────────
const PORTFOLIO_DATA = {
  personalInfo: {
    name: "Tirth Shah",
    title: "Data and AI Engineer",
    tagline: "Business analysis, data engineering, BI, data science, and agentic AI systems for practical product and operations work",
    location: "Dallas, Texas",
    email: "tirth.shah@tamu.edu",
    phone: "979-635-2045",
    linkedin: "https://www.linkedin.com/in/tirth-chirayu-shah/",
    github: "https://github.com/Tirth-1999",
    portfolioUrl: "https://www.tirthcshah.me/"
  },
  education: [
    {
      degree: "Master of Science - MS in Management Information Systems",
      institution: "Texas A&M University",
      duration: "Aug 2024 - May 2026",
      gpa: "3.90/4.00",
      focus: "Data Engineering, Applied AI, Analytics, and Business Systems",
      honors: "MS-MIS Scholarship Recipient; President of Buddy Connect"
    },
    {
      degree: "Bachelor of Engineering - BE in Computer Engineering",
      institution: "Gujarat Technological University",
      duration: "Jul 2017 - Jul 2021",
      gpa: "9.50/10.00 CGPA",
      focus: "Data Science with Python"
    }
  ],
  experiences: [
    {
      company: "HCLTech / Verizon Business",
      position: "Global Engagement Management Intern (TMT / Verizon)",
      duration: "Feb 2026 - May 2026",
      highlights: "Designed agentic NWDAF operations architecture for Verizon $3.5B Managed Network Services partnership; co-built interactive 5G network intelligence prototype (React 19, TypeScript, Three.js, Zustand, LangChain)."
    },
    {
      company: "Mays Business School - Texas A&M University",
      position: "Data and AI Graduate Student Worker (Founding Engineer)",
      duration: "Nov 2025 - Feb 2026",
      highlights: "Founding engineer for Mays Flex Online admissions & marketing analytics platform (Edulytix) across 7 graduate programs; built Python ETL, 17-table SQLite warehouse, LangChain schema RAG, OpenRouter API multi-model assistant, cut manual reporting ~95%."
    },
    {
      company: "Utilities & Energy Services - Texas A&M University",
      position: "Data Engineer Student Worker",
      duration: "Apr 2025 - Nov 2025",
      highlights: "Shipped production Python and SQL Server automation across 13 projects (50K–500K+ daily records); designed free-tier Databricks + SQL Server architecture with Airflow DAG design; 8-stage CHP pipeline cut 3-hr daily manual process to 5 minutes (97% reduction, 99.5% reliability)."
    },
    {
      company: "Black Tie Concierge, Inc.",
      position: "Data & AI Product Strategy Intern (Founding Engineer)",
      duration: "May 2025 - Aug 2025",
      highlights: "Built full-stack booking platform in 12 weeks (Next.js, TypeScript, Supabase PostgreSQL, Stripe, Google Maps, Vercel), supporting $10K+ revenue and 3x early growth."
    },
    {
      company: "Tata Consultancy Services",
      position: "Data Engineer (Equifax Account)",
      duration: "Aug 2021 - Aug 2024",
      highlights: "On-prem to GCP cloud migration, multi-source credit data fabric (10M+ records/day, 45% identity match lift, 93% latency cut); led 5-person SAS-to-Python modernization POC (60+ scripts converted, 80% runtime cut, 50% compute savings, Airflow DAG orchestration, FCRA/HIPAA-aware PII masking)."
    },
    {
      company: "PMC Retail (Paul Mason Consulting)",
      position: "Business Analyst Intern",
      duration: "Sep 2020 - Apr 2021",
      highlights: "Supported Oracle Xstore POS modernization: retail workflows, UML use cases, user stories, UAT test scenarios, Scrum delivery."
    }
  ],
  skills: [
    "Python", "SQL", "Databricks", "Snowflake", "dbt", "Airflow", "Apache Spark", "PySpark",
    "GCP", "AWS", "Azure", "Agentic AI", "LangChain", "LangGraph", "RAG", "Vector Databases (ChromaDB, FAISS)",
    "Streamlit", "Power BI", "Next.js", "TypeScript", "React", "FastAPI", "Supabase PostgreSQL", "Docker"
  ],
  certifications: [
    "AI Engineer for Developers Associate (DataCamp)",
    "Academy Accreditation - AI Agent Fundamentals (Databricks)",
    "Academy Accreditation - Generative AI Fundamentals (Databricks)",
    "Introduction to LangChain (LangChain Academy)",
    "Professional Scrum Master I (PSM I)",
    "Microsoft Certified: Azure Data Engineer Associate"
  ]
};

// ─── Map in-memory app object → Supabase row ─────────────────────────────────
// manualAction: string like "move_to_interviewed" | "mark_done" | "ignore" | "reopen" | null
function appToSupabaseRow(app, manualAction = null) {
  const now = new Date().toISOString();
  const row = {
    id: app.id,
    company: app.company || "Unknown",
    role: app.role || "General Application",
    status: app.status,
    confidence: app.confidence || "high",
    last_activity_at: app.lastActivityAt || now,
    latest_subject: app.latestSubject || "",
    latest_from: app.latestFrom || "",
    gmail_thread_id: app.gmailThreadId || null,
    gmail_message_ids: app.gmailMessageIds || [],
    notes: app.notes || "",
    updated_at: now,
    // AI Classification & Decision Metadata
    ai_decision: app.aiDecision || null,
    ai_model: app.aiModel || null,
    ai_classified_at: app.aiClassifiedAt || null,
    ai_confidence: app.aiConfidence || app.confidence || "high"
  };
  // Audit trail columns
  if (manualAction === "reopen") {
    // Reopen explicitly clears the override so Gmail sync can manage it again
    row.is_manual_override = false;
    row.manual_action = null;
    row.manual_changed_at = null;
  } else if (manualAction) {
    row.is_manual_override = true;
    row.manual_action = manualAction;
    row.manual_changed_at = now;
  } else {
    row.is_manual_override = app.isManualOverride || false;
    row.manual_action = app.manualAction || null;
    row.manual_changed_at = app.manualChangedAt || null;
  }
  return row;
}

// ─── Primary sync: upsert ONE row to Supabase ────────────────────────────────
async function syncAppToSupabase(app, manualAction = null) {
  const sb = initSupabase();
  if (!sb) { console.warn("Supabase not available."); return false; }
  if (!app?.id) { console.warn("syncAppToSupabase: missing app id."); return false; }

  const row = appToSupabaseRow(app, manualAction);
  const { error, data } = await sb
    .from("applications")
    .upsert(row, { onConflict: "id" })
    .select("id, status, updated_at, is_manual_override, manual_action")
    .single();

  if (error) {
    console.error(`[Supabase] Upsert failed [${app.id}]:`, error.message);
    return false;
  }
  console.log(`[Supabase] Row confirmed: ${app.company} → status="${data?.status}", updated_at=${data?.updated_at}, manual=${data?.is_manual_override}, action=${data?.manual_action}`);
  return true;
}

// ─── Batch upsert many rows (AI re-classify / noise purge) ───────────────────
async function syncAllAppsToSupabase(apps, label = "batch") {
  const sb = initSupabase();
  if (!sb || !apps?.length) return;

  const rows = apps.map((app) => appToSupabaseRow(app, null));
  const CHUNK = 50;
  let ok = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from("applications").upsert(rows.slice(i, i + CHUNK), { onConflict: "id" });
    if (error) {
      console.error(`[Supabase] Batch chunk ${Math.floor(i / CHUNK) + 1} failed [${label}]:`, error.message);
    } else {
      ok += Math.min(CHUNK, rows.length - i);
    }
  }
  console.log(`[Supabase] Batch sync [${label}]: ${ok}/${rows.length} rows committed.`);
}

// ─── Trigger Gmail Sync via Vercel Serverless Proxy ──────────────────────────
// PAT lives in Vercel env vars — never sent to or stored in the browser.
async function triggerGmailSync(appendConsole, onProgress = null) {
  const setProgress = (label, pct) => {
    if (onProgress) onProgress(label, pct);
  };

  setProgress("Dispatching workflow to GitHub Actions...", 15);
  appendConsole("Dispatching Gmail Sync to GitHub Actions...");

  // 1. Ask our Vercel serverless function to trigger the workflow
  let triggerData;
  try {
    const res = await fetch("/api/trigger-sync", { method: "POST" });
    triggerData = await res.json();
    if (!res.ok || triggerData.error) {
      appendConsole(`Trigger failed: ${triggerData.error || "Unknown error"}`, "error");
      setProgress("Failed to dispatch workflow", 0);
      return { success: false };
    }
  } catch (err) {
    appendConsole(`Could not reach /api/trigger-sync: ${err.message}`, "error");
    setProgress("Network error reaching serverless endpoint", 0);
    return { success: false };
  }

  const runId = triggerData.run_id;
  appendConsole(`Workflow dispatched. Run ID: ${runId ?? "detecting..."}`, "success");
  setProgress("GitHub Actions runner initialized. Executing Gmail ingestion pipeline...", 30);

  if (!runId) {
    appendConsole("No run ID returned — GitHub may still be queueing it. Reloading data in 30s...", "error");
    await new Promise((r) => setTimeout(r, 30000));
    return { success: false };
  }

  // 2. Poll /api/sync-status until complete (up to 5 minutes)
  appendConsole("Polling workflow status... (Gmail sync typically takes 1–3 minutes)");
  for (let poll = 0; poll < 60; poll++) {
    await new Promise((r) => setTimeout(r, 5000));
    const elapsed = Math.round((poll + 1) * 5);
    const dynamicPct = Math.min(35 + Math.round(poll * 1.5), 90);
    setProgress(`Ingesting Gmail messages & querying AI Judge... (${elapsed}s elapsed)`, dynamicPct);

    try {
      const statusRes = await fetch(`/api/sync-status?run_id=${runId}`);
      const statusData = await statusRes.json();

      if (statusData.status === "completed") {
        if (statusData.conclusion === "success") {
          setProgress("Sync complete! Refreshing dataset from Supabase...", 95);
          appendConsole(`Gmail Sync completed (${elapsed}s). Reloading from Supabase...`, "success");
          return { success: true };
        } else {
          setProgress(`Workflow ${statusData.conclusion}`, 100);
          appendConsole(
            `Workflow finished: ${statusData.conclusion}. <a href="${statusData.html_url}" target="_blank">View run →</a>`,
            "error"
          );
          return { success: false };
        }
      }

      if (poll % 6 === 5) {
        appendConsole(`Still running... (${elapsed}s, status: ${statusData.status})`);
      }
    } catch (err) {
      // Transient fetch error — keep polling
      console.warn("Status poll error:", err.message);
    }
  }

  setProgress("Workflow timed out polling after 5 minutes", 90);
  appendConsole("Workflow still running after 5 minutes. Reloading data from Supabase now.", "error");
  return { success: false };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
  selectedDate: getTodayDateStr(),
  boardSort: "date_desc",
  boardTimeRange: "all",
  laneSorts: {},
  cardDensity: localStorage.getItem("board_card_density") || "detailed",
  // Starred tab
  starredIds: new Set(JSON.parse(localStorage.getItem("job_tracker_starred_ids") || "[]")),
  starredSort: "date_desc",
  // Follow-Up Needed tab
  followupCandidates: [],
  followupLoading: false,
  followupLoaded: false,
  followupThreshold: Number(localStorage.getItem("followup_threshold") ?? "10"),
  followupFilter: "all",
  followupSort: "days_desc",
  followupSearch: "",
  activeFollowupId: null,
  // Draft My Reply tab
  draftReplySelectedId: null,
  draftReplySearch: "",
  draftReplyFilter: "reply_needed", // "reply_needed" | "all_active" | "starred"
  draftReplyIntent: "interest", // "interest" | "interview" | "questions" | "followup" | "decline"
  draftReplyExtraContext: "",
  draftReplyOutput: "",
  draftReplyLoading: false,
  draftReplyError: null,
  draftReplyCopied: false
};

const byId = (id) => document.getElementById(id);
let realtimeChannel = null;

// ─── Row mapper (Supabase row → in-memory app) ────────────────────────────────
function rowToApp(row) {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    status: row.status,
    confidence: row.confidence,
    lastActivityAt: row.last_activity_at,
    latestSubject: row.latest_subject,
    latestFrom: row.latest_from,
    gmailThreadId: row.gmail_thread_id,
    gmailMessageIds: row.gmail_message_ids || [],
    notes: row.notes,
    updatedAt: row.updated_at,
    isManualOverride: row.is_manual_override || false,
    manualAction: row.manual_action || null,
    manualChangedAt: row.manual_changed_at || null,
    aiDecision: row.ai_decision || null,
    aiModel: row.ai_model || null,
    aiClassifiedAt: row.ai_classified_at || null,
    aiConfidence: row.ai_confidence || row.confidence || "high"
  };
}

// ─── Deduplication & Merging Engine ──────────────────────────────────────────
function sanitizeCompanyName(name, subject = "", from = "", notes = "") {
  let c = String(name || "").trim();
  c = c.replace(/,\s*Tirth\b.*$/i, "").trim();
  c = c.replace(/^Welcome to your\s+/i, "").replace(/^Welcome to\s+/i, "").trim();
  c = c.replace(/\s+(LLC|Inc|Corp|Corporation|Technologies|Services|Group|Co)\b/gi, "").trim();

  const combined = `${c} ${subject || ""} ${notes || ""} ${from || ""}`;

  // Direct Staffing / Employer Domain & Sender Pattern Matching
  if (/Emergent/i.test(combined)) return "Emergent Software";
  if (/infoway|infowaygroup\.com/i.test(combined)) return "Infoway Group";
  if (/\bATC\b|divya@atc\.xyz|atc\.xyz|ATC-\s*VIDEO|ATC Data Engineering|Shakthi/i.test(combined)) return "ATC";
  if (/Randstad|Randstand|Shreyang Joshi|randstadusa\.com/i.test(combined)) return "Randstad";
  if (/NC State/i.test(combined)) return "NC State";
  if (/Nodveta|nodveta\.com/i.test(combined)) return "Nodveta";
  if (/IBM|talent@ibm\.com/i.test(combined)) return "IBM";
  if (/Tsenta/i.test(combined)) return "Tsenta";
  if (/TestGorilla/i.test(combined)) return "TestGorilla";
  if (/Shield AI/i.test(combined)) return "Shield AI";
  if (/Akraya/i.test(combined)) return "Akraya";
  if (/Collabera/i.test(combined)) return "Collabera";
  if (/Kforce/i.test(combined)) return "Kforce";
  if (/Insight Global/i.test(combined)) return "Insight Global";
  if (/TEKsystems/i.test(combined)) return "TEKsystems";
  if (/Apex Systems/i.test(combined)) return "Apex Systems";
  if (/CyberCoders/i.test(combined)) return "CyberCoders";
  if (/Robert Half/i.test(combined)) return "Robert Half";

  const cNorm = c.toLowerCase();
  if (["tirth shah", "tirth", "tirthcshah", "unknown company", "unknown", ""].includes(cNorm)) {
    return "Unknown Company";
  }
  return c || "Unknown Company";
}

function cleanJobRole(role, subject = "", notes = "") {
  let r = String(role || "").trim();

  // Explicit Normalizations for Offer Rollout / PandaDoc / ATC:
  if (/ATC Offer Letter.*BA\b/i.test(subject) || /ATC Offer Letter.*BA\b/i.test(notes) || /Details Required For Offer Rollout/i.test(subject)) {
    return "Business Analyst";
  }
  if (/^offer rollout$/i.test(r) || /^tirthcshah1999$/i.test(r)) {
    if (/ATC/i.test(subject) || /ATC/i.test(notes)) return "Business Analyst";
    return "General Application";
  }
  if (/The Senior Data Engineer Position/i.test(r)) {
    return "Senior Data Engineer";
  }

  // Normalize "Sr." and "Jr."
  r = r.replace(/\bSr\.\s*/gi, "Senior ").replace(/\bJr\.\s*/gi, "Junior ");

  // Check if role is a truncated stub or generic
  const isStub = !r || r.length <= 3 || /^(sr|jr|you|unknown|applying)$/i.test(r) || r === "General Application";

  if (isStub) {
    const text = `${notes || ""} ${subject || ""}`;

    // Pattern 1: Workday style: "Job Application: Tirth Shah - R0003261 Sr. Data Engineer"
    const mAtc = text.match(/Job Application:\s*[^-\n]+[-–]\s*(?:R[0-9]+\s+)?([A-Za-z0-9/&.\- ]{4,60}?)(?:\s+on\s+[0-9]|\s*[-–(.,\n]|$)/i);
    if (mAtc && mAtc[1] && mAtc[1].trim().length > 3) {
      r = mAtc[1].trim();
    } else {
      // Pattern 2: "application for the [Role] position"
      const mPos = text.match(/(?:application for(?: the)?|applied for(?: the)?|applied to(?: the)?|position of|role of)\s+([A-Z][A-Za-z0-9/&.\- ]{3,55}?)(?:\s+position|\s+role|\s+at|\s+with|\s+on|\s*[-–(.,\n]|$)/i);
      if (mPos && mPos[1] && mPos[1].trim().length > 3 && !/^(the|our|this|a|an|review|following|any)$/i.test(mPos[1].trim())) {
        r = mPos[1].trim();
      } else {
        // Pattern 3: Subject matches
        const mSubj = (subject || "").match(/(?:applying for|application for|applied for|role:?|position:?)\s+([A-Za-z0-9/&.\- ]{4,55})/i);
        if (mSubj && mSubj[1] && mSubj[1].trim().length > 3 && !/^(the|our|this|a|an)$/i.test(mSubj[1].trim())) {
          r = mSubj[1].trim();
        }
      }
    }
  }

  r = r
    .replace(/\bSr\.\s*/gi, "Senior ")
    .replace(/\bJr\.\s*/gi, "Junior ")
    .replace(/\s+/g, " ")
    .replace(/\s*\(Open\)\s*$/i, "")
    .replace(/\s*\(Hybrid\)\s*$/i, "")
    .replace(/\s*\(Remote\)\s*$/i, "")
    .replace(/\|\s*.*$/i, "")
    .replace(/[-–,;:\s]+$/, "")
    .trim();

  if (!r || r.length <= 3 || /^(sr|jr|you|unknown)$/i.test(r)) {
    return "General Application";
  }

  return r;
}

function extractRequisitionId(text) {
  if (!text) return null;
  const reqMatch = text.match(/\b(?:req(?:uisition)?|ref|reference|job\s*id|job\s*#|posting\s*#)\s*[:#\-]?\s*([0-9A-Za-z]{4,15})\b/i);
  if (reqMatch && !/^(?:uired|uire|uest|uirements|uests)$/i.test(reqMatch[1])) return reqMatch[1];
  const numDash = text.match(/[-–]\s*([0-9]{5,8})\s*(?:[-–\s]|$)/);
  if (numDash) return numDash[1];
  const hashNum = text.match(/#\s*([0-9]{5,8})\b/);
  if (hashNum) return hashNum[1];
  return null;
}

function normalizeCompany(name) {
  if (!name) return "";
  let n = String(name).toLowerCase().trim();
  n = n.replace(/\b(inc\.?|llc\.?|corp\.?|corporation|co\.?|ltd\.?|hiring team|recruiting team|hiring|recruiting|careers|ta|talent acquisition)\b/gi, "").trim();
  return n.replace(/[^a-z0-9]/g, "");
}

function normalizeRoleName(role) {
  if (!role) return "general";
  let r = String(role).toLowerCase().trim();
  r = r.replace(/[^a-z0-9]/g, "");
  if (r.includes("general") || r.includes("unknown") || r.length < 3) return "general";
  return r;
}

function deduplicateAndConsolidateApplications(appList) {
  if (!Array.isArray(appList) || appList.length === 0) return [];

  const STATUS_PRIORITY = {
    offered: 6,
    interviewed: 5,
    reply_needed: 4,
    applied: 3,
    rejected: 2,
    not_related: 1
  };

  // Step 1: Pre-process metadata once in O(N) linear pass
  const prepared = new Array(appList.length);
  for (let i = 0; i < appList.length; i++) {
    const a = appList[i];
    const cleanComp = sanitizeCompanyName(a.company, a.latestSubject, a.latestFrom, a.notes);
    let s = a.status;
    if (cleanComp.toLowerCase() === "tirth shah" && s === "offered") s = "not_related";
    const normComp = normalizeCompany(cleanComp);
    const reqId = extractRequisitionId(`${a.latestSubject || ""} ${a.notes || ""}`);
    const cleanR = cleanJobRole(a.role, a.latestSubject, a.notes);
    const normRole = normalizeRoleName(cleanR);
    const msgIds = (a.gmailMessageIds || []).concat(a.id ? [a.id.replace(/^msg-/, "")] : []);

    prepared[i] = {
      app: { ...a, company: cleanComp, role: cleanR, status: s, reqId },
      normComp,
      normRole,
      reqId,
      msgIds,
      threadId: a.gmailThreadId || null
    };
  }

  // Step 2: Group using O(1) Hash Map indices
  const threadMap = new Map();
  const msgMap = new Map();
  const reqMap = new Map();
  const compRoleMap = new Map();
  const groups = [];

  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i];
    let targetGroup = null;

    // 1. Match Thread ID (emails in the exact same conversation thread always belong to same application)
    if (item.threadId && threadMap.has(item.threadId)) {
      targetGroup = threadMap.get(item.threadId);
    }

    // 2. Match Message IDs (shared email message ID)
    if (!targetGroup) {
      for (const mid of item.msgIds) {
        if (msgMap.has(mid)) {
          targetGroup = msgMap.get(mid);
          break;
        }
      }
    }

    // 3. Match Same Company + Same Explicit Requisition ID (must be non-empty and identical)
    if (!targetGroup && item.normComp && item.normComp !== "unknown" && item.reqId) {
      const reqKey = `${item.normComp}:${item.reqId.toLowerCase()}`;
      if (reqMap.has(reqKey)) {
        targetGroup = reqMap.get(reqKey);
      }
    }

    // 3.5 Match Same Company Offer (an offer at a company collapses offer letters, rollout paperwork, and offer emails)
    if (!targetGroup && item.normComp && item.normComp !== "unknown" && (item.app.status === "offered" || item.normRole === "offerrollout")) {
      const existingOfferGroup = groups.find((g) =>
        g.some((other) => other.normComp === item.normComp && (other.app.status === "offered" || other.normRole === "offerrollout"))
      );
      if (existingOfferGroup) {
        targetGroup = existingOfferGroup;
      }
    }

    // 4. Match Same Company + Same Role for Stage Progressions (e.g. Applied -> Interview / Rejection)
    if (!targetGroup && item.normComp && item.normComp !== "unknown") {
      const compRoleKey = `${item.normComp}:${item.normRole}`;
      if (compRoleMap.has(compRoleKey)) {
        const candidateGroup = compRoleMap.get(compRoleKey);

        // Strict Conflict Guard 1: If both have Requisition IDs and they differ -> DO NOT MERGE!
        const hasReqConflict = candidateGroup.some(
          (other) => item.reqId && other.reqId && item.reqId.toLowerCase() !== other.reqId.toLowerCase()
        );

        // Strict Conflict Guard 2: If both have specific non-generic roles and they differ -> DO NOT MERGE!
        const hasRoleConflict = candidateGroup.some(
          (other) => item.normRole !== "general" && other.normRole !== "general" && item.normRole !== other.normRole
        );

        if (!hasReqConflict && !hasRoleConflict) {
          // Check if this is an update to an existing card (one is applied, other is rejection/interview/reply/offer)
          const isProgression = candidateGroup.some((other) => {
            if ((item.app.status === "rejected" && other.app.status === "applied") || (item.app.status === "applied" && other.app.status === "rejected")) return true;
            if (item.app.status === "interviewed" || other.app.status === "interviewed") return true;
            if (item.app.status === "reply_needed" || other.app.status === "reply_needed") return true;
            if (item.app.status === "offered" || other.app.status === "offered") return true;
            return false;
          });

          // If both are separate applied receipts from different threads without matching reqId, DO NOT merge!
          if (isProgression) {
            targetGroup = candidateGroup;
          }
        }
      }
    }

    if (!targetGroup) {
      targetGroup = [];
      groups.push(targetGroup);
    }

    targetGroup.push(item);

    // Register indices for fast matching of subsequent items
    if (item.threadId) threadMap.set(item.threadId, targetGroup);
    for (const mid of item.msgIds) msgMap.set(mid, targetGroup);
    if (item.normComp && item.normComp !== "unknown" && item.reqId) {
      reqMap.set(`${item.normComp}:${item.reqId.toLowerCase()}`, targetGroup);
    }
    if (item.normComp && item.normComp !== "unknown") {
      compRoleMap.set(`${item.normComp}:${item.normRole}`, targetGroup);
      if (item.normRole !== "general") {
        compRoleMap.set(`${item.normComp}:general`, targetGroup);
      }
    }
  }

function resolveClusterStatus(appCluster) {
  if (!appCluster || appCluster.length === 0) return "applied";
  if (appCluster.length === 1) return appCluster[0].status;

  // 1. Any confirmed employment offer wins
  if (appCluster.some((a) => a.status === "offered")) return "offered";

  // 2. Sort by date descending (latest activity first)
  const sorted = [...appCluster].sort((a, b) =>
    (b.lastActivityAt || b.last_activity_at || "").localeCompare(a.lastActivityAt || a.last_activity_at || "")
  );
  const latest = sorted[0];

  // 3. If the most recent communication is a formal rejection, the application is rejected
  if (latest.status === "rejected") return "rejected";

  // 4. If any communication is an active interview/assessment, check if a rejection happened after
  const interviewApp = sorted.find((a) => a.status === "interviewed");
  if (interviewApp) {
    const rejectionAfter = sorted.find(
      (a) => a.status === "rejected" && (a.lastActivityAt || a.last_activity_at || "") > (interviewApp.lastActivityAt || interviewApp.last_activity_at || "")
    );
    if (rejectionAfter) return "rejected";
    return "interviewed";
  }

  // 5. If any communication is reply_needed, check if rejection happened after
  const replyApp = sorted.find((a) => a.status === "reply_needed");
  if (replyApp) {
    const rejectionAfter = sorted.find(
      (a) => a.status === "rejected" && (a.lastActivityAt || a.last_activity_at || "") > (replyApp.lastActivityAt || replyApp.last_activity_at || "")
    );
    if (rejectionAfter) return "rejected";
    return "reply_needed";
  }

  // 6. Between applied and rejected: rejected ALWAYS supersedes applied
  if (appCluster.some((a) => a.status === "rejected")) return "rejected";

  // 7. Standard applied if present
  if (appCluster.some((a) => a.status === "applied")) return "applied";

  return latest.status || "not_related";
}

  // Step 3: Consolidate each group into a single application
  const consolidated = new Array(groups.length);
  for (let g = 0; g < groups.length; g++) {
    const cluster = groups[g];
    if (cluster.length === 1) {
      consolidated[g] = cluster[0].app;
    } else {
      const appCluster = cluster.map((c) => c.app);
      const bestStatus = resolveClusterStatus(appCluster);
      const cleanComp = appCluster.find((a) => a.company && a.company.toLowerCase() !== "tirth shah" && a.company.toLowerCase() !== "unknown")?.company || appCluster[0].company;
      const cleanRole = appCluster.find((a) => a.role && a.role !== "General Application" && a.role !== "Unknown role" && a.role !== "Offer Rollout" && a.role.length > 3 && !/^(sr|jr|you|offer rollout|tirthcshah1999)$/i.test(a.role))?.role || cleanJobRole(appCluster[0].role, appCluster[0].latestSubject, appCluster[0].notes);
      appCluster.sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
      const latest = appCluster[0];
      const rawMsgIds = [...new Set(cluster.flatMap((c) => c.msgIds))];
      const allMsgIds = rawMsgIds.length > 5 ? (latest.gmailThreadId ? [latest.gmailThreadId] : rawMsgIds.slice(0, 2)) : rawMsgIds;
      const manualApp = appCluster.find((a) => a.isManualOverride);
      const clusterReqId = cluster.find((c) => c.reqId)?.reqId || null;

      consolidated[g] = {
        ...latest,
        id: appCluster.find((a) => a.status === bestStatus)?.id || latest.id,
        company: cleanComp,
        role: cleanRole,
        reqId: clusterReqId,
        status: bestStatus,
        effectiveStatus: bestStatus,
        gmailMessageIds: allMsgIds,
        gmailThreadId: latest.gmailThreadId || appCluster.find((a) => a.gmailThreadId)?.gmailThreadId || null,
        confidence: "high",
        isManualOverride: Boolean(manualApp),
        manualAction: manualApp ? manualApp.manualAction : null
      };
    }
  }

  return consolidated;
}

// ─── Load: Supabase is the EXCLUSIVE source of truth ─────────────────────────
async function loadData() {
  const sb = initSupabase();
  if (!sb) throw new Error("Supabase client could not be initialized.");

  let allRows = [];
  let from = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data: page, error } = await sb
      .from("applications")
      .select("*")
      .order("last_activity_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Supabase SELECT failed: ${error.message}`);
    if (!page || page.length === 0) break;
    allRows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const rawMapped = allRows.map(rowToApp);
  const deduplicated = deduplicateAndConsolidateApplications(rawMapped);

  state.data = {
    applications: deduplicated,
    updatedAt: new Date().toISOString()
  };

  console.log(`[Supabase] Loaded ${allRows.length} raw rows -> ${state.data.applications.length} consolidated applications.`);

  // ─── Realtime channel (subscribe once) ───────────────────────────────────
  if (!realtimeChannel) {
    realtimeChannel = sb
      .channel("applications-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applications" },
        (payload) => {
          console.log("[Realtime]", payload.eventType, payload.new?.id ?? payload.old?.id);
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const mapped = rowToApp(payload.new);
            const idx = state.data.applications.findIndex((a) => a.id === payload.new.id);
            if (idx !== -1) {
              const current = state.data.applications[idx];
              if (
                current.status === mapped.status &&
                current.role === mapped.role &&
                current.company === mapped.company &&
                current.isManualOverride === mapped.isManualOverride
              ) {
                return;
              }
              state.data.applications[idx] = mapped;
            } else {
              state.data.applications.unshift(mapped);
            }
            state.data.applications = deduplicateAndConsolidateApplications(state.data.applications);
            state.data.updatedAt = payload.new.updated_at;
            render();
          } else if (payload.eventType === "DELETE") {
            state.data.applications = state.data.applications.filter((a) => a.id !== payload.old.id);
            render();
          }
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("Realtime subscribe error:", err);
        else console.log("[Realtime] Channel status:", status);
      });
  }

  render();
}

// ─── setAppDone (Synchronized directly with Supabase) ──────────────────────────
async function setAppDone(appId, isDone) {
  const app = state.data?.applications?.find((a) => a.id === appId);
  if (app) {
    if (isDone) {
      if (app.status === "reply_needed") app.status = "applied";
      app.isManualOverride = true;
      app.manualAction = "mark_done";
      app.manualChangedAt = new Date().toISOString();
    } else {
      app.status = "reply_needed";
      app.isManualOverride = false;
      app.manualAction = null;
      app.manualChangedAt = null;
    }
    app.updatedAt = new Date().toISOString();
    state.data.updatedAt = app.updatedAt;
    state.data.applications = deduplicateAndConsolidateApplications(state.data.applications);
    render();
    syncAppToSupabase(app, isDone ? "mark_done" : "reopen").catch(console.error);
  }
}

// ─── setAppIgnored (Synchronized directly with Supabase) ───────────────────────
async function setAppIgnored(appId, isIgnored) {
  const app = state.data?.applications?.find((a) => a.id === appId);
  if (app) {
    if (isIgnored) {
      if (app.status === "reply_needed") app.status = "not_related";
      app.isManualOverride = true;
      app.manualAction = "ignore";
      app.manualChangedAt = new Date().toISOString();
    } else {
      app.status = "reply_needed";
      app.isManualOverride = false;
      app.manualAction = null;
      app.manualChangedAt = null;
    }
    app.updatedAt = new Date().toISOString();
    state.data.updatedAt = app.updatedAt;
    state.data.applications = deduplicateAndConsolidateApplications(state.data.applications);
    render();
    syncAppToSupabase(app, isIgnored ? "ignore" : "reopen").catch(console.error);
  }
}

// ─── Compute effectiveStatus directly from authoritative database record ───────
function computeEffectiveStatuses(apps) {
  if (!apps || !apps.length) return [];

  return apps.map((app) => {
    const isDone = app.isManualOverride && app.manualAction === "mark_done";
    const isIgnored = app.isManualOverride && app.manualAction === "ignore";

    if (isDone) {
      const eff = app.status === "reply_needed" ? "applied" : app.status;
      return { ...app, effectiveStatus: eff, isDone: true, isIgnored: false };
    }
    if (isIgnored) {
      const eff = app.status === "reply_needed" ? "not_related" : app.status;
      return { ...app, effectiveStatus: eff, isDone: false, isIgnored: true };
    }
    return { ...app, effectiveStatus: app.status, isDone: false, isIgnored: false };
  });
}

// ─── Apply search query filter on top of effective-status-decorated apps ─────
function filteredApplications(allApps) {
  const sourceApps = allApps || computeEffectiveStatuses(state.data?.applications ?? []);
  const query = state.query.trim();
  if (!query) return sourceApps;

  const lowerQuery = query.toLowerCase();
  const wordRegex = new RegExp(`\\b${query.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i");

  return sourceApps.filter((app) => {
    const company = String(app.company || "");
    const role = String(app.role || "");
    const subject = String(app.latestSubject || "");
    const from = String(app.latestFrom || "");

    if (wordRegex.test(company) || wordRegex.test(role) || wordRegex.test(subject) || wordRegex.test(from)) {
      return true;
    }

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

// ─── Lazy Active View Renderer: Renders ONLY the currently visible tab ──────
function render() {
  const currentView = state.view || "board";
  const allApps = computeEffectiveStatuses(state.data?.applications ?? []);
  const filteredApps = filteredApplications(allApps);

  renderStatus();
  renderStats(allApps);

  if (currentView === "board") {
    renderBoard(filteredApps);
  } else if (currentView === "starred") {
    renderStarred(filteredApps);
  } else if (currentView === "companies") {
    renderCompanies(filteredApps);
  } else if (currentView === "applications") {
    renderApplications(filteredApps);
  } else if (currentView === "otherEmails") {
    renderOtherEmails(filteredApps);
  } else if (currentView === "followup") {
    renderFollowUp();
  } else if (currentView === "draftReply") {
    renderDraftReply(allApps);
  } else if (currentView === "analytics") {
    renderAnalytics(allApps);
  } else if (currentView === "services") {
    renderServices(filteredApps);
  }
}

function renderStatus() {
  const updatedAt = state.data?.updatedAt;
  byId("syncStatus").textContent = updatedAt
    ? `Last synced ${new Date(updatedAt).toLocaleString()}`
    : "No sync has run yet";
}

function renderStats(applications) {
  // `applications` is already decorated with effectiveStatus by computeEffectiveStatuses() —
  // use it directly so the top-bar numbers always match the lane counts.
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
  updateStarredBadge();

  const otherStatEl = document.querySelector(".stat-clickable");
  if (otherStatEl) {
    otherStatEl.addEventListener("click", () => switchTab("otherEmails"));
  }
}

function filterByTimeRange(apps, timeRange) {
  if (!timeRange || timeRange === "all") return apps;
  const now = Date.now();
  const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : timeRange === "90d" ? 90 : 0;
  if (!days) return apps;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return apps.filter((a) => {
    if (!a.lastActivityAt) return false;
    const t = new Date(a.lastActivityAt).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  });
}

function sortApplications(apps, sortKey) {
  const list = [...apps];
  switch (sortKey) {
    case "date_asc":
      list.sort((a, b) => (a.lastActivityAt || "").localeCompare(b.lastActivityAt || ""));
      break;
    case "company_asc":
      list.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
      break;
    case "company_desc":
      list.sort((a, b) => (b.company || "").localeCompare(a.company || ""));
      break;
    case "date_desc":
    default:
      list.sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
      break;
  }
  return list;
}

const AVATAR_COLORS = [
  "#4f46e5",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0284c7",
  "#db2777",
  "#0d9488",
  "#e11d48",
  "#2563eb"
];

function getCompanyAvatar(company) {
  const clean = (company || "?").trim();
  const initial = clean.charAt(0).toUpperCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
  }
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  return `<div class="company-avatar" style="background-color:${color};" title="${escapeHtml(clean)}">${escapeHtml(initial)}</div>`;
}

function formatRelativeDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "Unknown";
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0) {
    if (diffHours === 0) {
      if (diffMin <= 1) return "Just now";
      return `${diffMin}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderBoard(applications) {
  const timeFilteredApps = filterByTimeRange(applications, state.boardTimeRange);

  const sortLabels = {
    date_desc: "Newest ↓",
    date_asc: "Oldest ↑",
    company_asc: "A-Z ↓",
    company_desc: "Z-A ↑"
  };

  const boardEl = byId("board");
  if (boardEl) {
    boardEl.className = `board ${state.cardDensity === "compact" ? "density-compact" : ""}`;
  }

  document.querySelectorAll(".btn-density").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.density === state.cardDensity);
  });

  if (boardEl) {
    boardEl.innerHTML = LANES.map(([key, label, className]) => {
      const rawLaneApps = timeFilteredApps.filter((app) => normalizeStatus(app.effectiveStatus || app.status) === key);
      const laneSortKey = state.laneSorts[key] || state.boardSort;
      const sortedLaneApps = sortApplications(rawLaneApps, laneSortKey);
      const currentSortLabel = sortLabels[laneSortKey] || "Sort";

      return `
        <section class="lane ${className}">
          <div class="lane-header">
            <div class="lane-header-left">
              <span class="lane-dot"></span>
              <span>${label}</span>
              <span class="lane-count">${sortedLaneApps.length}</span>
            </div>
            <button type="button" class="btn-lane-sort" data-lane="${key}" title="Sort this lane (Current: ${currentSortLabel})">
              ${currentSortLabel}
            </button>
          </div>
          <div class="cards">
            ${sortedLaneApps.map(renderCard).join("") || `<div class="empty">No applications</div>`}
          </div>
        </section>
      `;
    }).join("");
  }
}

function saveStarredIds() {
  localStorage.setItem("job_tracker_starred_ids", JSON.stringify([...state.starredIds]));
  updateStarredBadge();
}

function updateStarredBadge() {
  const badge = byId("starredCountBadge");
  if (!badge) return;
  const count = state.starredIds.size;
  badge.textContent = count;
  badge.style.display = count > 0 ? "inline-block" : "none";
}

function toggleStar(id) {
  if (state.starredIds.has(id)) {
    state.starredIds.delete(id);
  } else {
    state.starredIds.add(id);
  }
  saveStarredIds();
  if (state.view === "starred") {
    render();
  } else {
    document.querySelectorAll(`.btn-card-star[data-id="${id}"]`).forEach((btn) => {
      const isStarred = state.starredIds.has(id);
      btn.classList.toggle("starred", isStarred);
      btn.textContent = isStarred ? "★" : "☆";
      btn.title = isStarred ? "Starred — click to unstar" : "Star this application";
    });
  }
}

function renderStarred(applications) {
  const shell = byId("starred");
  if (!shell) return;

  const starredList = applications.filter((app) => state.starredIds.has(app.id));
  const sorted = sortApplications(starredList, state.starredSort || "date_desc");

  shell.innerHTML = `
    <div class="starred-header">
      <div class="starred-header-top">
        <div>
          <h2 class="starred-title">Starred Applications</h2>
          <p class="starred-subtitle">
            High-priority applications and conversations flagged for quick reference.
          </p>
        </div>
        <div class="starred-sort-wrap">
          <label for="starredSortSelect" class="starred-sort-label">Sort:</label>
          <select id="starredSortSelect" class="board-sort-select" aria-label="Sort starred applications">
            <option value="date_desc" ${(state.starredSort || 'date_desc') === 'date_desc' ? 'selected' : ''}>Newest Activity First</option>
            <option value="date_asc" ${(state.starredSort || 'date_desc') === 'date_asc' ? 'selected' : ''}>Oldest Activity First</option>
            <option value="company_asc" ${(state.starredSort || 'date_desc') === 'company_asc' ? 'selected' : ''}>Company A-Z</option>
            <option value="company_desc" ${(state.starredSort || 'date_desc') === 'company_desc' ? 'selected' : ''}>Company Z-A</option>
          </select>
        </div>
      </div>
    </div>

    ${sorted.length === 0 ? `
      <div class="starred-empty">
        <div class="starred-empty-icon">☆</div>
        <strong>No starred applications yet</strong>
        <p>Click the star icon (☆) on any job card in the Board to pin it here.</p>
      </div>
    ` : `
      <div class="starred-count-bar">
        Showing <strong>${sorted.length}</strong> starred application${sorted.length === 1 ? '' : 's'}
      </div>
      <div class="starred-cards-grid">
        ${sorted.map(renderCard).join('')}
      </div>
    `}
  `;
}

function getGmailUrl(app) {
  if (!app) return "https://mail.google.com/mail/#all";

  const subject = String(app.latestSubject || "").trim();
  const from = String(app.latestFrom || "").trim();
  const company = String(app.company || "").trim();

  // 1. Primary & most reliable across all Gmail web accounts: Exact Subject & Sender Search
  if (subject) {
    const cleanSubj = subject.replace(/^(re|fwd|fw|fwd\[\d+\]):\s*/gi, "").trim();
    const safeSubj = cleanSubj.replace(/"/g, " ").replace(/\s+/g, " ").trim();
    
    // Extract clean email from sender header if present
    const emailMatch = from.match(/<([^>]+)>/) || from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const senderEmail = emailMatch ? emailMatch[1] : "";

    // If we have a specific sender email (excluding generic multi-tenant ATS domains)
    if (senderEmail && !senderEmail.includes("myworkday.com") && !senderEmail.includes("greenhouse.io") && !senderEmail.includes("lever.co")) {
      return `https://mail.google.com/mail/#search/${encodeURIComponent(`from:${senderEmail} subject:("${safeSubj}")`)}`;
    }
    
    return `https://mail.google.com/mail/#search/${encodeURIComponent(`subject:("${safeSubj}")`)}`;
  }

  // 2. Secondary fallback: thread ID if present
  if (app.gmailThreadId && String(app.gmailThreadId).trim()) {
    return `https://mail.google.com/mail/#all/${encodeURIComponent(String(app.gmailThreadId).trim())}`;
  }

  // 3. Tertiary fallback: Company query
  if (company && company !== "Unknown" && company !== "Other") {
    return `https://mail.google.com/mail/#search/${encodeURIComponent(`"${company}" application OR interview OR offer`)}`;
  }

  return "https://mail.google.com/mail/#all";
}

function renderCard(app) {
  const status = normalizeStatus(app.effectiveStatus || app.status);
  const gmailUrl = getGmailUrl(app);

  const isStarred = state.starredIds.has(app.id);
  const starBtn = `
    <button type="button" class="btn-card-star ${isStarred ? "starred" : ""}" data-id="${app.id}" title="${isStarred ? "Starred — click to unstar" : "Star this application"}">
      ${isStarred ? "★" : "☆"}
    </button>
  `;

  // Dropdown options for moving cards across all pipeline stages
  const MOVE_OPTIONS = [
    { key: "applied", label: "Applied" },
    { key: "reply_needed", label: "Reply Needed" },
    { key: "interviewed", label: "Interview" },
    { key: "offered", label: "Offered" },
    { key: "rejected", label: "Rejected" },
    { key: "not_related", label: "Other" }
  ];

  const cleanRole = cleanJobRole(app.role, app.latestSubject, app.notes);

  // Authentic thread count badge (only when genuine conversation with 2-5 emails)
  const msgCount = Array.isArray(app.gmailMessageIds) ? app.gmailMessageIds.length : 1;
  const msgCountBadge = (msgCount > 1 && msgCount <= 5)
    ? `<span class="badge-thread-count" title="${msgCount} authentic emails in this thread">${msgCount} emails</span>`
    : "";

  // Requisition ID badge
  const reqBadge = app.reqId
    ? `<span class="badge-req" title="Job Requisition ID: ${escapeHtml(app.reqId)}">Req #${escapeHtml(app.reqId)}</span>`
    : "";

  let actionButton = "";
  if (status === "reply_needed" && !app.isDone && !app.isIgnored) {
    actionButton = `
      <div class="card-actions" style="margin-top:8px;">
        <button class="btn-action btn-mark-done" data-id="${app.id}" title="Mark this assessment or reply as completed">Mark Done</button>
        <button class="btn-action btn-ignore" data-id="${app.id}" title="Ignore this email and move it to Other Emails">Ignore</button>
      </div>
    `;
  } else if (app.isDone) {
    actionButton = `
      <div class="card-actions" style="margin-top:8px;">
        <button class="btn-action btn-reopen" data-id="${app.id}">Reopen to Reply Needed</button>
      </div>
    `;
  } else if (app.isIgnored) {
    actionButton = `
      <div class="card-actions" style="margin-top:8px;">
        <button class="btn-action btn-reopen" data-id="${app.id}">Move Back to Reply Needed</button>
      </div>
    `;
  }

  const statusTooltip = app.isManualOverride
    ? `Manually updated: ${app.manualAction || "Override"}`
    : (app.aiDecision ? `AI Classification: ${app.aiDecision}` : "");

  const subjectText = app.latestSubject ? escapeHtml(app.latestSubject) : "No subject recorded";

  return `
    <article class="card ${statusClass(status)}" data-id="${app.id}">
      <div class="card-header">
        <div class="card-company-group">
          ${getCompanyAvatar(app.company)}
          <a class="card-company-link" href="${gmailUrl}" target="_blank" rel="noopener noreferrer" title="Search ${escapeHtml(app.company || 'Company')} in Gmail">
            <h3 class="company-name">${escapeHtml(app.company || "Unknown Company")}</h3>
          </a>
        </div>
        <div class="card-header-actions">
          ${starBtn}
          <a class="btn-card-gmail" href="${gmailUrl}" target="_blank" rel="noopener noreferrer" title="Open exact email thread in Gmail">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
          </a>
        </div>
      </div>

      <div class="card-role-row">
        <span class="card-role">${escapeHtml(cleanRole)}</span>
        ${reqBadge}
      </div>

      <a class="card-subject-link" href="${gmailUrl}" target="_blank" rel="noopener noreferrer" title="Subject Context: ${subjectText}">
        <div class="card-context">
          <span class="context-label">Context:</span>
          <span class="context-text">${subjectText}</span>
        </div>
      </a>

      <div class="card-footer">
        <div class="card-footer-left">
          <span class="pill status-pill ${statusClass(status)}" ${statusTooltip ? `title="${escapeHtml(statusTooltip)}"` : ""}>${escapeHtml(labelForStatus(status))}</span>
          ${msgCountBadge}
          <span class="card-date" title="${app.lastActivityAt ? new Date(app.lastActivityAt).toLocaleString() : ""}">${formatRelativeDate(app.lastActivityAt)}</span>
        </div>
        <select class="select-move-lane" data-id="${app.id}" data-current="${status}" title="Move application to a different stage">
          <option value="" disabled selected>Move ▾</option>
          ${MOVE_OPTIONS.map(
            (opt) => `
            <option value="${opt.key}" ${opt.key === status ? 'disabled style="color:#94a3b8;"' : ""}>
              ${opt.label} ${opt.key === status ? "(Current)" : ""}
            </option>
          `
          ).join("")}
        </select>
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

  const currentStatus = normalizeStatus(app.effectiveStatus || app.status);
  const targetStatusNorm = normalizeStatus(targetStatus);
  const currentLabel = labelForStatus(currentStatus);
  const targetLabel = labelForStatus(targetStatusNorm);

  modalTitle.textContent = "Confirm Pipeline Stage Change";
  modalBody.innerHTML = `
    <p>Are you sure you want to move this application?</p>
    <div class="modal-highlight-card">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${escapeHtml(app.company || "Unknown Company")}</div>
      <div style="color:var(--muted);font-size:12px;margin-bottom:8px;">${escapeHtml(app.role || "General Application")}</div>
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
        <span class="pill status-pill ${statusClass(currentStatus)}">${escapeHtml(currentLabel)}</span>
        <span>➔</span>
        <span class="pill status-pill ${statusClass(targetStatusNorm)}" style="font-weight:700;">${escapeHtml(targetLabel)}</span>
      </div>
    </div>
    <p style="font-size:12px;color:var(--muted);">
      ${targetStatusNorm === "not_related" 
        ? "This email will be moved to the <strong>Other Emails</strong> tab and excluded from active job pipeline lanes." 
        : `This will move the application to the <strong>${escapeHtml(targetLabel)}</strong> lane and sync directly to Supabase.`}
    </p>
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
    const now = new Date().toISOString();
    app.status = targetStatus;
    app.effectiveStatus = targetStatus;
    app.updatedAt = now;
    app.isManualOverride = true;
    app.manualAction = targetStatus === "not_related" ? "move_to_not_related" : `move_to_${targetStatus}`;
    app.manualChangedAt = now;

    state.data.updatedAt = now;
    state.data.applications = deduplicateAndConsolidateApplications(state.data.applications);
    render();

    // Instant background sync directly to Supabase
    syncAppToSupabase(app, app.manualAction).catch((err) => {
      console.error("Supabase lane move sync error:", err);
    });
  });
}

function initCardActionDelegation() {
  document.addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".tab");
    if (tabBtn && tabBtn.dataset.view) {
      e.preventDefault();
      switchTab(tabBtn.dataset.view);
      return;
    }

    const timePill = e.target.closest(".board-time-pill");
    if (timePill && timePill.dataset.time) {
      e.preventDefault();
      state.boardTimeRange = timePill.dataset.time;
      document.querySelectorAll(".board-time-pill").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.time === state.boardTimeRange);
      });
      renderBoard(getFilteredApplications());
      return;
    }

    const laneSortBtn = e.target.closest(".btn-lane-sort");
    if (laneSortBtn && laneSortBtn.dataset.lane) {
      e.preventDefault();
      const laneKey = laneSortBtn.dataset.lane;
      const current = state.laneSorts[laneKey] || state.boardSort;
      const CYCLE = ["date_desc", "date_asc", "company_asc", "company_desc"];
      const nextIdx = (CYCLE.indexOf(current) + 1) % CYCLE.length;
      state.laneSorts[laneKey] = CYCLE[nextIdx];
      renderBoard(getFilteredApplications());
      return;
    }

    const densityBtn = e.target.closest(".btn-density");
    if (densityBtn && densityBtn.dataset.density) {
      e.preventDefault();
      state.cardDensity = densityBtn.dataset.density;
      localStorage.setItem("board_card_density", state.cardDensity);
      document.querySelectorAll(".btn-density").forEach((b) => {
        b.classList.toggle("active", b.dataset.density === state.cardDensity);
      });
      const boardEl = byId("board");
      if (boardEl) {
        boardEl.classList.toggle("density-compact", state.cardDensity === "compact");
      }
      return;
    }

    const starBtn = e.target.closest(".btn-card-star");
    if (starBtn && starBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      toggleStar(starBtn.dataset.id);
      return;
    }

    const dismissAuditBtn = e.target.closest(".btn-dismiss-audit");
    if (dismissAuditBtn) {
      e.preventDefault();
      state.latestAuditReport = null;
      localStorage.removeItem("job_tracker_latest_reclassify_audit");
      render();
      return;
    }

    const markDoneBtn = e.target.closest(".btn-mark-done");
    if (markDoneBtn) {
      e.preventDefault();
      e.stopPropagation();
      setAppDone(markDoneBtn.dataset.id, true);
      return;
    }

    const ignoreBtn = e.target.closest(".btn-ignore");
    if (ignoreBtn) {
      e.preventDefault();
      e.stopPropagation();
      setAppIgnored(ignoreBtn.dataset.id, true);
      return;
    }

    const reopenBtn = e.target.closest(".btn-reopen");
    if (reopenBtn) {
      e.preventDefault();
      e.stopPropagation();
      setAppDone(reopenBtn.dataset.id, false);
      setAppIgnored(reopenBtn.dataset.id, false);
      return;
    }

    // ── Follow-Up Needed tab actions ─────────────────────────────────────────
    const filterChip = e.target.closest(".followup-filter-chip");
    if (filterChip && filterChip.dataset.filter) {
      e.preventDefault();
      state.followupFilter = filterChip.dataset.filter;
      renderFollowUp();
      return;
    }

    const refreshFollowupBtn = e.target.closest("#btnFollowupRefresh");
    if (refreshFollowupBtn) {
      e.preventDefault();
      state.followupLoaded = false;
      renderFollowUp();
      return;
    }

    const quickCopyBtn = e.target.closest(".btn-quick-copy");
    if (quickCopyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = quickCopyBtn.dataset.id;
      const candidate = state.followupCandidates.find((c) => c.id === id);
      if (candidate && candidate.ai_draft) {
        navigator.clipboard.writeText(candidate.ai_draft).then(() => {
          const oldText = quickCopyBtn.textContent;
          quickCopyBtn.textContent = "Copied!";
          setTimeout(() => { quickCopyBtn.textContent = oldText; }, 2000);
        }).catch(() => {});
      }
      return;
    }

    const quickDismissBtn = e.target.closest(".btn-quick-dismiss");
    if (quickDismissBtn) {
      e.preventDefault();
      e.stopPropagation();
      markFollowupDismissed(quickDismissBtn.dataset.id);
      return;
    }

    const reviewDraftBtn = e.target.closest(".btn-review-draft");
    if (reviewDraftBtn) {
      e.preventDefault();
      e.stopPropagation();
      openFollowupModal(reviewDraftBtn.dataset.id);
      return;
    }

    const card = e.target.closest(".followup-card");
    if (card && !e.target.closest("button") && !e.target.closest("a")) {
      e.preventDefault();
      openFollowupModal(card.dataset.id);
      return;
    }

    // Modal buttons
    if (e.target.closest("#btnFollowupModalClose")) {
      e.preventDefault();
      closeFollowupModal();
      return;
    }

    if (e.target.closest("#btnFollowupModalCopy")) {
      e.preventDefault();
      const textarea = byId("followupModalDraftText");
      const btn = byId("#btnFollowupModalCopy") || e.target.closest("#btnFollowupModalCopy");
      if (textarea) {
        navigator.clipboard.writeText(textarea.value).then(() => {
          if (btn) {
            btn.textContent = "Copied!";
            setTimeout(() => { btn.textContent = "Copy Draft"; }, 2000);
          }
        }).catch(() => {});
      }
      return;
    }

    if (e.target.closest("#btnFollowupModalDone")) {
      e.preventDefault();
      const textarea = byId("followupModalDraftText");
      if (textarea) {
        navigator.clipboard.writeText(textarea.value).catch(() => {});
      }
      if (state.activeFollowupId) {
        const id = state.activeFollowupId;
        closeFollowupModal();
        markFollowupActioned(id);
      }
      return;
    }

    if (e.target.closest("#btnFollowupModalDismiss")) {
      e.preventDefault();
      if (state.activeFollowupId) {
        const id = state.activeFollowupId;
        closeFollowupModal();
        markFollowupDismissed(id);
      }
      return;
    }

    const modalBackdrop = e.target;
    if (modalBackdrop && modalBackdrop.id === "followupModalBackdrop") {
      closeFollowupModal();
      return;
    }
  });

  // Live search input for follow-up
  document.addEventListener("input", (e) => {
    if (e.target && e.target.id === "followupSearchInput") {
      state.followupSearch = e.target.value;
      renderFollowUpGridOnly();
    }
  });

  // Sort & slider change listeners
  document.addEventListener("change", (e) => {
    const select = e.target.closest(".select-move-lane");
    if (select) {
      e.stopPropagation();
      const targetStatus = select.value;
      const appId = select.dataset.id;
      if (targetStatus && appId) {
        moveApplicationLane(appId, targetStatus);
      }
      select.value = "";
    }

    const sortSelect = e.target.closest("#followupSortSelect");
    if (sortSelect) {
      state.followupSort = sortSelect.value;
      renderFollowUp();
      return;
    }

    const boardSortSelect = e.target.closest("#boardSortSelect");
    if (boardSortSelect) {
      state.boardSort = boardSortSelect.value;
      state.laneSorts = {};
      renderBoard(getFilteredApplications());
      return;
    }

    const starredSortSelect = e.target.closest("#starredSortSelect");
    if (starredSortSelect) {
      state.starredSort = starredSortSelect.value;
      renderStarred(getFilteredApplications());
      return;
    }

    const thresholdSlider = e.target.closest("#followupThresholdSlider") || e.target.closest(".followup-threshold-slider");
    if (thresholdSlider) {
      const val = Number(thresholdSlider.value);
      state.followupThreshold = val;
      localStorage.setItem("followup_threshold", String(val));
      renderFollowUp();
    }
  });

  // Escape key closes modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.activeFollowupId) {
      closeFollowupModal();
    }
  });
}

// ─── Follow-Up Needed Tab (Grid UI & Review Modal) ────────────────────────────

function getFilteredAndSortedFollowups() {
  const threshold = state.followupThreshold;
  const allCandidates = state.followupCandidates ?? [];

  // Filter 1: Min business days elapsed
  let list = allCandidates.filter((c) => (c.days_elapsed ?? 0) >= threshold);

  // Compute counts for filter chips
  const totalCount = list.length;
  const urgentCount = list.filter((c) => (c.days_elapsed ?? 0) >= 15).length;
  const attempt1Count = list.filter((c) => (c.followup_count ?? 0) === 0).length;
  const attempt2Count = list.filter((c) => (c.followup_count ?? 0) === 1).length;

  // Filter 2: Filter chip
  if (state.followupFilter === "urgent") {
    list = list.filter((c) => (c.days_elapsed ?? 0) >= 15);
  } else if (state.followupFilter === "attempt1") {
    list = list.filter((c) => (c.followup_count ?? 0) === 0);
  } else if (state.followupFilter === "attempt2") {
    list = list.filter((c) => (c.followup_count ?? 0) === 1);
  }

  // Filter 3: Search query
  const q = (state.followupSearch || "").trim().toLowerCase();
  if (q) {
    list = list.filter((c) => {
      const comp = String(c.company || "").toLowerCase();
      const role = String(c.role || "").toLowerCase();
      const contact = String(c.contact_name || "").toLowerCase();
      const email = String(c.contact_email || "").toLowerCase();
      const subj = String(c.subject || "").toLowerCase();
      return comp.includes(q) || role.includes(q) || contact.includes(q) || email.includes(q) || subj.includes(q);
    });
  }

  // Sorting
  if (state.followupSort === "days_asc") {
    list.sort((a, b) => (a.days_elapsed ?? 0) - (b.days_elapsed ?? 0));
  } else if (state.followupSort === "company_asc") {
    list.sort((a, b) => String(a.company || "").localeCompare(String(b.company || "")));
  } else {
    // default: days_desc
    list.sort((a, b) => (b.days_elapsed ?? 0) - (a.days_elapsed ?? 0));
  }

  return { list, totalCount, urgentCount, attempt1Count, attempt2Count };
}

async function renderFollowUp() {
  const shell = byId("followup");
  if (!shell) return;

  if (!state.followupLoaded && !state.followupLoading) {
    shell.innerHTML = `<div class="followup-loading"><span class="followup-spinner"></span> Loading follow-up candidates from database...</div>`;
    state.followupLoading = true;
    try {
      await loadFollowupCandidates();
      state.followupLoaded = true;
    } catch (err) {
      shell.innerHTML = `<div class="empty">Failed to load follow-up data: ${escapeHtml(err.message)}</div>`;
      state.followupLoading = false;
      return;
    }
    state.followupLoading = false;
  }

  if (state.followupLoading) return;

  const threshold = state.followupThreshold;
  const { list, totalCount, urgentCount, attempt1Count, attempt2Count } = getFilteredAndSortedFollowups();

  shell.innerHTML = `
    <div class="followup-header">
      <div class="followup-header-top">
        <div>
          <h2 class="followup-title">Follow-Up Needed</h2>
          <p class="followup-subtitle">
            Threads awaiting a response. Click any card to review the draft or copy directly.
          </p>
        </div>
        <div class="followup-header-actions">
          <button class="btn-followup-refresh" id="btnFollowupRefresh">Refresh</button>
        </div>
      </div>

      <div class="followup-controls-strip">
        <div class="followup-search-box">
          <input
            type="search"
            id="followupSearchInput"
            placeholder="Search company, role, contact..."
            value="${escapeHtml(state.followupSearch)}"
          />
        </div>

        <div class="followup-filter-chips">
          <button class="followup-filter-chip ${state.followupFilter === 'all' ? 'active' : ''}" data-filter="all">
            All (${totalCount})
          </button>
          <button class="followup-filter-chip ${state.followupFilter === 'urgent' ? 'active' : ''}" data-filter="urgent">
            Urgent 15d+ (${urgentCount})
          </button>
          <button class="followup-filter-chip ${state.followupFilter === 'attempt1' ? 'active' : ''}" data-filter="attempt1">
            Attempt #1 (${attempt1Count})
          </button>
          <button class="followup-filter-chip ${state.followupFilter === 'attempt2' ? 'active' : ''}" data-filter="attempt2">
            Attempt #2 (${attempt2Count})
          </button>
        </div>

        <div class="followup-sort-wrap">
          <select id="followupSortSelect" class="followup-sort-select" aria-label="Sort follow-up cards">
            <option value="days_desc" ${state.followupSort === 'days_desc' ? 'selected' : ''}>Longest Waiting First</option>
            <option value="days_asc" ${state.followupSort === 'days_asc' ? 'selected' : ''}>Most Recent First</option>
            <option value="company_asc" ${state.followupSort === 'company_asc' ? 'selected' : ''}>Company A-Z</option>
          </select>
        </div>

        <div class="followup-threshold-row">
          <label class="followup-threshold-label-text">Min waiting:</label>
          <input
            type="range"
            min="7" max="21" step="1"
            value="${threshold}"
            class="followup-threshold-slider"
            id="followupThresholdSlider"
            aria-label="Follow-up threshold in business days"
          />
          <span class="followup-threshold-label">${threshold} business days</span>
        </div>
      </div>
    </div>

    <div class="followup-count-bar" id="followupCountBar">
      Showing <strong>${list.length}</strong> of <strong>${totalCount}</strong> follow-up opportunities
    </div>

    <div id="followupCardsContainer">
      ${list.length === 0 ? `
        <div class="followup-empty">
          <div class="followup-empty-icon">All clear</div>
          <strong>No matching follow-up threads found</strong>
          <p>Try adjusting your search query, filter chips, or minimum waiting threshold.</p>
        </div>
      ` : `
        <div class="followup-cards-grid" id="followupCardsGrid">
          ${list.map(renderFollowUpCard).join("")}
        </div>
      `}
    </div>
  `;
}

// Partial re-render when typing in search to preserve input focus
function renderFollowUpGridOnly() {
  const container = byId("followupCardsContainer");
  const countBar = byId("followupCountBar");
  if (!container || !countBar) {
    renderFollowUp();
    return;
  }

  const { list, totalCount } = getFilteredAndSortedFollowups();

  countBar.innerHTML = `Showing <strong>${list.length}</strong> of <strong>${totalCount}</strong> follow-up opportunities`;

  if (list.length === 0) {
    container.innerHTML = `
      <div class="followup-empty">
        <div class="followup-empty-icon">All clear</div>
        <strong>No matching follow-up threads found</strong>
        <p>Try adjusting your search query, filter chips, or minimum waiting threshold.</p>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="followup-cards-grid" id="followupCardsGrid">
        ${list.map(renderFollowUpCard).join("")}
      </div>
    `;
  }
}

function renderFollowUpCard(c) {
  const days = c.days_elapsed ?? 0;
  const dayClass = days >= 15 ? "days-urgent" : days >= 10 ? "days-warning" : "days-ok";
  const attemptNum = (c.followup_count ?? 0) + 1;
  const attemptBadge = `<span class="followup-attempt-badge attempt-${attemptNum}">Attempt #${attemptNum}</span>`;

  const company = escapeHtml(c.company || "Unknown");
  const role = escapeHtml(c.role || "General");
  const contactName = escapeHtml(c.contact_name || "");
  const contactEmail = escapeHtml(c.contact_email || "");
  const subject = escapeHtml(c.subject || "No subject");
  const summary = escapeHtml(c.thread_summary || c.ai_draft || "");

  const contactDisplay = contactName
    ? `${contactName}${contactEmail ? ` · ${contactEmail}` : ""}`
    : (contactEmail || "Recruiter");

  return `
    <div class="followup-card" data-id="${c.id}">
      <div class="followup-card-top">
        <strong class="followup-company" title="${company}">${company}</strong>
        <span class="followup-days-badge ${dayClass}">${days}d ago</span>
      </div>

      <div class="followup-role-row">
        <span class="followup-role" title="${role}">${role}</span>
        ${attemptBadge}
      </div>

      <div class="followup-contact" title="${contactDisplay}">${contactDisplay}</div>

      <div class="followup-subject-line" title="Re: ${subject}">Re: ${subject}</div>

      <div class="followup-summary-box">
        ${summary}
      </div>

      <div class="followup-card-footer">
        <button class="btn-review-draft" data-id="${c.id}">Review Draft</button>
        <button class="btn-quick-copy" data-id="${c.id}" title="Copy draft to clipboard">Copy</button>
        <button class="btn-quick-dismiss" data-id="${c.id}" title="Skip and remove from list">Skip</button>
      </div>
    </div>
  `;
}

function getGmailSearchUrlForFollowup(c) {
  if (c.thread_id) {
    return `https://mail.google.com/mail/#all/${encodeURIComponent(c.thread_id)}`;
  }
  if (c.contact_email) {
    return `https://mail.google.com/mail/#search/${encodeURIComponent(c.contact_email)}`;
  }
  if (c.company) {
    return `https://mail.google.com/mail/#search/${encodeURIComponent(c.company)}`;
  }
  return "https://mail.google.com/mail/#all";
}

function openFollowupModal(id) {
  const candidate = state.followupCandidates.find((c) => c.id === id);
  if (!candidate) return;

  state.activeFollowupId = id;
  const modalBox = byId("followupModalBox");
  const backdrop = byId("followupModalBackdrop");
  if (!modalBox || !backdrop) return;

  const days = candidate.days_elapsed ?? 0;
  const attemptNum = (candidate.followup_count ?? 0) + 1;
  const company = escapeHtml(candidate.company || "Unknown");
  const role = escapeHtml(candidate.role || "General");
  const contactName = escapeHtml(candidate.contact_name || "");
  const contactEmail = escapeHtml(candidate.contact_email || "");
  const subject = escapeHtml(candidate.subject || "No subject");
  const summary = escapeHtml(candidate.thread_summary || "");
  const draft = candidate.ai_draft || "";
  const gmailUrl = getGmailSearchUrlForFollowup(candidate);

  const sentDate = candidate.last_sent_at
    ? new Date(candidate.last_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Unknown";

  modalBox.innerHTML = `
    <div class="modal-header followup-modal-header">
      <div>
        <div class="followup-modal-eyebrow">${days} business days waiting · Follow-up #${attemptNum} of 2</div>
        <h3 class="followup-modal-company">${company}</h3>
        <div class="followup-modal-role">${role}</div>
      </div>
      <button class="btn-modal-close" id="btnFollowupModalClose" type="button" aria-label="Close dialog">&times;</button>
    </div>

    <div class="modal-body followup-modal-body">
      <div class="followup-modal-meta-grid">
        <div class="followup-meta-item">
          <span class="meta-label">Recipient:</span>
          <span class="meta-val">${contactName ? `<strong>${contactName}</strong> ` : ""}${contactEmail ? `&lt;${contactEmail}&gt;` : "Not specified"}</span>
        </div>
        <div class="followup-meta-item">
          <span class="meta-label">Subject:</span>
          <span class="meta-val">Re: ${subject}</span>
        </div>
        <div class="followup-meta-item">
          <span class="meta-label">Last Sent:</span>
          <span class="meta-val">${sentDate} (${days} business days ago)</span>
        </div>
      </div>

      ${summary ? `
        <div class="followup-modal-summary-wrap">
          <strong>Context:</strong> ${summary}
        </div>
      ` : ""}

      <div class="followup-modal-draft-wrap">
        <div class="followup-draft-label">
          <span>AI-Generated Draft Reply</span>
          <span class="followup-draft-hint">Editable &mdash; adjust as desired before copying</span>
        </div>
        <textarea id="followupModalDraftText" class="followup-modal-draft-textarea" rows="7">${escapeHtml(draft)}</textarea>
      </div>
    </div>

    <div class="modal-actions followup-modal-actions">
      <div class="followup-modal-actions-left">
        <a href="${gmailUrl}" target="_blank" rel="noopener noreferrer" class="btn-modal-gmail">Open Gmail &nearr;</a>
        <button class="btn-modal-copy" id="btnFollowupModalCopy" type="button">Copy Draft</button>
      </div>
      <div class="followup-modal-actions-right">
        <button class="btn-modal-dismiss" id="btnFollowupModalDismiss" type="button">Skip &mdash; Not Needed</button>
        <button class="btn-modal-done" id="btnFollowupModalDone" type="button">Done &mdash; Copy &amp; Mark Sent</button>
      </div>
    </div>
  `;

  backdrop.classList.add("active");
}

function closeFollowupModal() {
  const backdrop = byId("followupModalBackdrop");
  if (backdrop) backdrop.classList.remove("active");
  state.activeFollowupId = null;
}

async function loadFollowupCandidates() {
  const sb = initSupabase();
  if (!sb) throw new Error("Supabase not initialized");

  const { data, error } = await sb
    .from("followup_candidates")
    .select("*")
    .eq("status", "pending")
    .order("days_elapsed", { ascending: false });

  if (error) throw new Error(error.message);
  state.followupCandidates = data ?? [];
}

async function markFollowupActioned(id) {
  state.followupCandidates = state.followupCandidates.filter((c) => c.id !== id);
  renderFollowUp();

  try {
    const sb = initSupabase();
    if (sb) {
      await sb
        .from("followup_candidates")
        .update({ status: "actioned", updated_at: new Date().toISOString() })
        .eq("id", id);
    }
  } catch (err) {
    console.error("Failed to mark follow-up as actioned:", err);
  }
}

async function markFollowupDismissed(id) {
  state.followupCandidates = state.followupCandidates.filter((c) => c.id !== id);
  renderFollowUp();

  try {
    const sb = initSupabase();
    if (sb) {
      await sb
        .from("followup_candidates")
        .update({ status: "dismissed", updated_at: new Date().toISOString() })
        .eq("id", id);
    }
  } catch (err) {
    console.error("Failed to mark follow-up as dismissed:", err);
  }
}

// ─── Draft My Reply Tab (On-Demand AI Email Reply Drafter) ─────────────────────

function getRelevantPortfolioHighlights(roleName = "") {
  const r = (roleName || "").toLowerCase();
  if (r.includes("data eng") || r.includes("etl") || r.includes("pipeline") || r.includes("warehouse") || r.includes("spark")) {
    return {
      title: "Data Engineering & Lakehouse Highlights",
      summary: "TCS / Equifax GCP credit data fabric (10M+ records/day, 45% match lift); Texas A&M UES energy operations automation across 13 pipelines (50K–500K daily records); Databricks lakehouse, Airflow DAG orchestration, Python & SQL Server optimization."
    };
  }
  if (r.includes("ai") || r.includes("ml") || r.includes("machine learning") || r.includes("prompt") || r.includes("agent") || r.includes("llm")) {
    return {
      title: "Agentic AI & LLM Systems Highlights",
      summary: "Mays Business School LangChain schema RAG & OpenRouter multi-model assistant (Gemini, ChromaDB, guarded text-to-SQL); HCLTech/Verizon 5G agentic NWDAF prototype; TAMU Datathon 2025 1st place winner; DataCamp AI Engineer Associate certified."
    };
  }
  if (r.includes("analyst") || r.includes("business") || r.includes("product") || r.includes("bi") || r.includes("intelligence")) {
    return {
      title: "Business Analysis & Product Delivery Highlights",
      summary: "Mays Flex Online founding engineer (cut reporting ~95%, saving 100+ staff hrs/yr); PMC Retail Oracle Xstore POS modernization (Scrum, UML, user stories, UAT); BlackTieCars 0-to-1 platform ($10K+ revenue, 3x growth); PSM I certified."
    };
  }
  return {
    title: "Data & AI Engineering Profile Match",
    summary: "Texas A&M M.S. MIS (GPA 3.90, May 2026); Equifax cloud migration & data fabric at TCS (10M+ records/day); Mays Business School AI platform founding engineer; production Python, SQL, Databricks, LangChain, and cloud platforms."
  };
}

function generateLocalSmartDraft(app, intent = "interest", extraContext = "") {
  const comp = app.company || "the company";
  const role = app.role || "this position";
  const sender = (app.latestFrom || "").split("<")[0].replace(/"/g, "").trim() || "Hiring Team";
  const firstName = sender.split(" ")[0] || "Hiring Manager";
  const highlights = getRelevantPortfolioHighlights(role).summary;

  if (intent === "interview") {
    return `Subject: Re: ${app.latestSubject || `Interview Invitation - ${role} at ${comp}`}

Dear ${firstName},

Thank you very much for reaching out and for the invitation to speak regarding the ${role} position at ${comp}. I would be delighted to connect and discuss how my background in data engineering, analytics, and practical AI systems can contribute to your team.

I am available for a conversation at the following times (Central Time):
- Tuesday & Thursday: 9:00 AM – 1:00 PM or 2:00 PM – 5:00 PM CT
- Wednesday & Friday: 10:00 AM – 3:00 PM CT

If any of these windows work for your schedule, please let me know, or feel free to share a calendar link and I will gladly select an open slot. 

I look forward to our conversation!

Warm regards,

Tirth Shah
Data and AI Engineer
Dallas, Texas | (979) 635-2045
tirth.shah@tamu.edu | linkedin.com/in/tirth-chirayu-shah | github.com/Tirth-1999`;
  }

  if (intent === "questions") {
    return `Subject: Re: ${app.latestSubject || `${role} Opportunity at ${comp}`}

Hi ${firstName},

Thank you for contacting me regarding the ${role} opportunity at ${comp}. The position sounds like an exciting opportunity that aligns closely with my experience in data engineering and scalable AI systems.

Before we proceed to an introductory call, I would love to clarify a couple of quick details:
1. What are the primary core technologies and data stack that the team is currently working with (e.g., cloud platforms, orchestration, or modern data architectures)?
2. What are the key near-term initiatives or deliverables the team is looking for this role to own?

I have attached my resume and portfolio (https://www.tirthcshah.me/) for your reference, and I look forward to your thoughts.

Best regards,

Tirth Shah
Data and AI Engineer
Dallas, Texas | (979) 635-2045
tirth.shah@tamu.edu | linkedin.com/in/tirth-chirayu-shah | github.com/Tirth-1999`;
  }

  if (intent === "followup") {
    return `Subject: Following up: ${role} application - Tirth Shah

Hi ${firstName},

I hope you are having a productive week.

I am writing to follow up on my application and our previous correspondence regarding the ${role} position at ${comp}. I remain very enthusiastic about the opportunity to bring my experience in building reliable data platforms and AI systems (${highlights}) to ${comp}.

Please let me know if there are any additional details or work samples I can provide to support your review. I look forward to hearing about the next steps in the process.

Thank you again for your time and consideration!

Sincerely,

Tirth Shah
Data and AI Engineer
Dallas, Texas | (979) 635-2045
tirth.shah@tamu.edu | linkedin.com/in/tirth-chirayu-shah | github.com/Tirth-1999`;
  }

  if (intent === "decline") {
    return `Subject: Re: ${app.latestSubject || `Opportunity at ${comp}`}

Dear ${firstName},

Thank you very much for reaching out and considering me for the ${role} opportunity at ${comp}.

While I appreciate your interest in my background, I am currently focusing on opportunities that align specifically with my current trajectory in senior data platforms and agentic AI systems, so I will have to respectfully decline at this time.

I would love to stay connected on LinkedIn (https://www.linkedin.com/in/tirth-chirayu-shah/) for potential future collaborations as things evolve. Thank you again for your time and professional outreach.

Best regards,

Tirth Shah
Data and AI Engineer
Dallas, Texas | (979) 635-2045
tirth.shah@tamu.edu`;
  }

  // Default: interest
  return `Subject: Re: ${app.latestSubject || `${role} Opportunity at ${comp}`}

Hi ${firstName},

Thank you for reaching out regarding the ${role} opening at ${comp}. I am very interested in learning more about the role and your team's objectives.

By way of brief introduction, I recently completed my M.S. in Management Information Systems from Texas A&M University (GPA 3.90/4.00) following three years as a Data Engineer on the Equifax credit engagement at TCS. My core focus is building production-grade data pipelines, analytics warehouses, and practical AI systems—such as converting 60+ legacy scripts to modern Python/Airflow at TCS (cutting runtime ~80%), automating Texas A&M campus energy operations across 13 workflows, and founding the Mays Flex Online AI analytics platform.

Given this background, I would welcome the chance to connect for a brief 15-minute conversation to learn more about ${comp}'s priorities and discuss how I can add immediate value. Please let me know what times might work best for you this week.

Thank you again, and I look forward to speaking!

Warm regards,

Tirth Shah
Data and AI Engineer
Dallas, Texas | (979) 635-2045
tirth.shah@tamu.edu | linkedin.com/in/tirth-chirayu-shah | github.com/Tirth-1999`;
}

function renderDraftReply(applications) {
  const shell = byId("draftReply");
  if (!shell) return;

  const currentSearch = (state.draftReplySearch || "").trim().toLowerCase();
  const currentFilter = state.draftReplyFilter || "reply_needed";
  const currentIntent = state.draftReplyIntent || "interest";

  // Filter application candidates
  // Merge live-fetched Gmail threads with tracked applications
  const liveFetched = state.fetchedLiveApps || [];
  const combinedApps = [...liveFetched, ...applications];

  let candidateApps = combinedApps.filter((a) => {
    if (a.isLiveFetched) return true;
    const s = normalizeStatus(a.effectiveStatus || a.status);
    if (s === "not_related") return false;
    if (currentFilter === "reply_needed") return s === "reply_needed";
    if (currentFilter === "starred") return state.starredIds.has(a.id);
    return true; // "all_active"
  });

  if (currentSearch) {
    candidateApps = candidateApps.filter((a) => {
      const c = (a.company || "").toLowerCase();
      const r = (a.role || "").toLowerCase();
      const s = (a.latestSubject || "").toLowerCase();
      const f = (a.latestFrom || "").toLowerCase();
      return c.includes(currentSearch) || r.includes(currentSearch) || s.includes(currentSearch) || f.includes(currentSearch);
    });
  }

  // Sort: newest activity first
  candidateApps.sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));

  // Ensure an application is selected
  if (!state.draftReplySelectedId && candidateApps.length > 0) {
    state.draftReplySelectedId = candidateApps[0].id;
  }

  const selectedApp = combinedApps.find((a) => a.id === state.draftReplySelectedId) || candidateApps[0] || null;

  // Counts for filter pills
  const replyNeededTotal = applications.filter((a) => normalizeStatus(a.effectiveStatus || a.status) === "reply_needed").length;
  const allActiveTotal = applications.filter((a) => normalizeStatus(a.effectiveStatus || a.status) !== "not_related").length;
  const starredTotal = state.starredIds.size;

  const highlights = selectedApp ? getRelevantPortfolioHighlights(selectedApp.role) : null;
  const activeModelId = getSelectedModel();
  const activeModel = AI_MODELS.find((m) => m.id === activeModelId) || AI_MODELS[0];

  shell.innerHTML = `
    <!-- Header Card -->
    <div class="draft-reply-header-card">
      <div class="draft-reply-title">
        <h2>
          <span>Draft My Reply</span>
          <span class="pill pill-done" style="font-size:11px;background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe;">
            AI Engine: ${escapeHtml(activeModel.name)}
          </span>
        </h2>
        <p>AI-assisted recruiter email replies grounded in your verified portfolio, job history, and specific thread memory.</p>
      </div>
      <div class="draft-reply-controls">
        <div class="draft-reply-url-box">
          <div style="display:flex;gap:8px;align-items:center;width:100%;">
            <input type="text" id="draftReplySearchInput" class="draft-reply-search-input" placeholder="Paste Gmail thread URL (https://mail.google.com/...) or search company, role..." value="${escapeHtml(state.draftReplySearch || "")}" style="flex:1;" />
            <button type="button" id="btnFetchGmailUrl" class="btn-fetch-gmail-url" ${state.draftReplyFetchingUrl ? "disabled" : ""} title="Fetch live email body directly from Gmail using the link or thread ID">
              ${
                state.draftReplyFetchingUrl
                  ? `<span class="followup-spinner" style="width:14px;height:14px;border-width:2px;"></span> Fetching from Gmail...`
                  : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Fetch from Gmail`
              }
            </button>
          </div>
          ${state.draftReplyFetchError ? `<div class="draft-reply-fetch-error">${escapeHtml(state.draftReplyFetchError)}</div>` : ""}
          ${state.draftReplyFetchSuccess ? `<div class="draft-reply-fetch-success">${escapeHtml(state.draftReplyFetchSuccess)}</div>` : ""}
        </div>
        <div class="draft-reply-filter-pills">
          <button type="button" class="draft-reply-pill-btn ${currentFilter === "reply_needed" ? "active" : ""}" data-filter="reply_needed">
            Reply Needed (${replyNeededTotal})
          </button>
          <button type="button" class="draft-reply-pill-btn ${currentFilter === "all_active" ? "active" : ""}" data-filter="all_active">
            All Pipeline (${allActiveTotal})
          </button>
          <button type="button" class="draft-reply-pill-btn ${currentFilter === "starred" ? "active" : ""}" data-filter="starred">
            Starred (${starredTotal})
          </button>
        </div>
      </div>
    </div>

    <!-- 2-Column Workbench Layout -->
    <div class="draft-reply-layout">
      <!-- Left Column: Recruiter Communication List -->
      <div class="draft-reply-list-pane">
        <div class="draft-reply-list-header">
          <span>Awaiting Response (${candidateApps.length})</span>
          <span style="font-size:11px;color:var(--muted);text-transform:none;font-weight:normal;">Click to select</span>
        </div>
        <div class="draft-reply-list-items">
          ${
            candidateApps.length === 0
              ? `<div style="padding:32px 16px;text-align:center;color:var(--muted);font-size:13px;">No applications match the filter.</div>`
              : candidateApps
                  .map((app) => {
                    const isSelected = selectedApp && selectedApp.id === app.id;
                    const st = normalizeStatus(app.effectiveStatus || app.status);
                    const daysAgo = app.lastActivityAt ? Math.floor((Date.now() - new Date(app.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
                    const cleanComp = escapeHtml(app.company || "Unknown");
                    const cleanRole = escapeHtml(app.role || "General");
                    const cleanFrom = escapeHtml((app.latestFrom || "Unknown sender").replace(/<.*?>/, "").trim());
                    const cleanSubj = escapeHtml(app.latestSubject || "No Subject");
                    const gmailUrl = getGmailUrl(app);

                    return `
                    <div class="draft-reply-item-card ${isSelected ? "active" : ""}" data-id="${app.id}">
                      <div class="draft-reply-item-top">
                        <span class="draft-reply-item-company">${cleanComp}</span>
                        <span class="pill status-pill ${statusClass(st)}" style="font-size:10px;padding:2px 6px;">${escapeHtml(labelForStatus(st))}</span>
                      </div>
                      <div class="draft-reply-item-role">${cleanRole}</div>
                      <div class="draft-reply-item-sender" title="${escapeHtml(app.latestFrom || "")}">From: ${cleanFrom}</div>
                      <div class="draft-reply-item-subject" title="${cleanSubj}">"${cleanSubj}"</div>
                      <div class="draft-reply-item-meta">
                        <span class="draft-reply-item-date">${daysAgo > 0 ? `${daysAgo}d ago` : "Today"}</span>
                        <a href="${gmailUrl}" target="_blank" rel="noopener noreferrer" class="draft-reply-gmail-link" style="padding:2px 6px;font-size:11px;" onclick="event.stopPropagation();">
                          Gmail ↗
                        </a>
                      </div>
                    </div>
                  `;
                  })
                  .join("")
          }
        </div>
      </div>

      <!-- Right Column: Reply Drafting Workbench -->
      <div class="draft-reply-workbench">
        ${
          !selectedApp
            ? `
          <div class="draft-reply-empty-state">
            <div class="draft-reply-empty-icon">✉️</div>
            <h3>Select a Conversation to Draft a Reply</h3>
            <p>Choose any recruiter outreach or thread from the left column to preview the thread and generate an AI-tailored reply.</p>
          </div>
        `
            : `
          <!-- Target Application Context Header Card -->
          <div class="draft-reply-job-card">
            <div class="draft-reply-job-info">
              <div class="draft-reply-job-title">${escapeHtml(selectedApp.company)} — <span style="font-weight:normal;color:#475569;">${escapeHtml(selectedApp.role)}</span></div>
              <div class="draft-reply-job-sub">
                Sender: <strong>${escapeHtml(selectedApp.latestFrom || "Unknown")}</strong> &bull; Subject: "${escapeHtml(selectedApp.latestSubject || "No Subject")}"
              </div>
            </div>
            <a href="${getGmailUrl(selectedApp)}" target="_blank" rel="noopener noreferrer" class="draft-reply-gmail-link" title="Open the exact thread in Gmail">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Open Thread in Gmail
            </a>
          </div>

          <!-- Dynamic Portfolio Match Card -->
          ${
            highlights
              ? `
            <div class="draft-reply-highlights-box">
              <div class="draft-reply-highlights-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Portfolio Grounding Match: ${escapeHtml(highlights.title)}</span>
              </div>
              <p class="draft-reply-highlights-text">${escapeHtml(highlights.summary)}</p>
            </div>
          `
              : ""
          }

          <!-- Reply Intent Selector -->
          <div class="draft-reply-intent-wrap">
            <label class="draft-reply-section-label">Select Reply Goal &amp; Tone:</label>
            <div class="draft-reply-intent-pills">
              <button type="button" class="draft-reply-intent-btn ${currentIntent === "interest" ? "active" : ""}" data-intent="interest">
                ✨ Express Interest &amp; Connect
              </button>
              <button type="button" class="draft-reply-intent-btn ${currentIntent === "interview" ? "active" : ""}" data-intent="interview">
                📅 Accept Interview &amp; Provide Availability
              </button>
              <button type="button" class="draft-reply-intent-btn ${currentIntent === "questions" ? "active" : ""}" data-intent="questions">
                ❓ Ask Clarifying Questions
              </button>
              <button type="button" class="draft-reply-intent-btn ${currentIntent === "followup" ? "active" : ""}" data-intent="followup">
                💼 Follow-Up on Status
              </button>
              <button type="button" class="draft-reply-intent-btn ${currentIntent === "decline" ? "active" : ""}" data-intent="decline">
                🙏 Respectfully Decline
              </button>
            </div>
          </div>

          <!-- Optional Context / Message Paste Area -->
          <div class="draft-reply-context-wrap">
            <label class="draft-reply-section-label" for="draftReplyExtraContextInput">
              Paste Recruiter Message or Additional Notes (Optional):
            </label>
            <textarea id="draftReplyExtraContextInput" class="draft-reply-context-textarea" placeholder="Paste the recruiter's specific message, questions asked, or details like preferred time slots to include in the draft...">${escapeHtml(state.draftReplyExtraContext || "")}</textarea>
          </div>

          <!-- Generate Action Button -->
          <div>
            <button type="button" id="btnGenerateReplyDraft" class="draft-reply-generate-btn" ${state.draftReplyLoading ? "disabled" : ""}>
              ${
                state.draftReplyLoading
                  ? `<span class="followup-spinner" style="width:16px;height:16px;border-width:2px;"></span> Generating Draft with ${escapeHtml(activeModel.name)}...`
                  : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Generate Reply Draft`
              }
            </button>
          </div>

          <!-- Generated Reply Output Box -->
          ${
            state.draftReplyOutput
              ? `
            <div class="draft-reply-output-wrap">
              <div class="draft-reply-output-header">
                <span class="draft-reply-section-label" style="color:#1d4ed8;">
                  ✨ Generated Email Reply (Ready to Send):
                </span>
                <div class="draft-reply-actions-row">
                  <button type="button" id="btnCopyReplyDraft" class="btn-draft-copy ${state.draftReplyCopied ? "copied" : ""}">
                    ${
                      state.draftReplyCopied
                        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied to Clipboard!`
                        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Draft`
                    }
                  </button>
                  <a href="${getGmailUrl(selectedApp)}" target="_blank" rel="noopener noreferrer" class="btn-draft-gmail">
                    Open in Gmail &amp; Send ↗
                  </a>
                  <button type="button" id="btnRegenerateDraft" class="btn-draft-regenerate" title="Regenerate draft">
                    ↻ Regenerate
                  </button>
                </div>
              </div>
              <textarea id="draftReplyOutputTextarea" class="draft-reply-output-textarea" rows="12">${escapeHtml(state.draftReplyOutput)}</textarea>
            </div>
          `
              : ""
          }
        `
        }
      </div>
    </div>
  `;

  attachDraftReplyListeners(applications);
}

function attachDraftReplyListeners(applications) {
  function extractThreadOrMessageId(input) {
    if (!input) return "";
    const s = String(input).trim();
    if (/^[a-f0-9]{16,}$/i.test(s)) return s;
    const m = s.match(/(?:#|\/|%23)([a-f0-9]{16,})(?:[/?#&]|$)/i);
    if (m) return m[1];
    return "";
  }

  const handleFetchGmail = async () => {
    const query = (state.draftReplySearch || "").trim();
    const threadId = extractThreadOrMessageId(query);

    if (!query) {
      state.draftReplyFetchError = "Please paste a Gmail thread URL (e.g. https://mail.google.com/mail/u/0/#inbox/...) into the search bar first.";
      state.draftReplyFetchSuccess = null;
      renderDraftReply(applications);
      return;
    }

    state.draftReplyFetchingUrl = true;
    state.draftReplyFetchError = null;
    state.draftReplyFetchSuccess = null;
    renderDraftReply(applications);

    try {
      const res = await fetch("/api/fetch-gmail-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: query, threadId })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status} fetching Gmail thread`);
      }

      const data = await res.json();
      if (!data.body && !data.snippet) {
        throw new Error("No readable email content returned from Gmail.");
      }

      // Check if this thread matches an existing application
      const matchedApp = applications.find(
        (a) => a.gmailThreadId === data.threadId || (a.gmailMessageIds || []).includes(data.threadId) || (a.gmailMessageIds || []).includes(data.messageId)
      );

      if (matchedApp) {
        state.draftReplySelectedId = matchedApp.id;
        state.draftReplyExtraContext = data.body || data.snippet;
        state.draftReplyFetchSuccess = `✅ Live Gmail thread fetched for ${matchedApp.company}! Recruiter message body loaded below.`;
      } else {
        // Create an ad-hoc live fetched application card
        const liveApp = {
          id: `gmail-${data.threadId}`,
          company: data.company || "Company",
          role: data.role || "General Application",
          status: "reply_needed",
          latestSubject: data.subject || "No Subject",
          latestFrom: data.from || "Recruiter",
          gmailThreadId: data.threadId,
          gmailMessageIds: [data.messageId || data.threadId],
          lastActivityAt: data.date || new Date().toISOString(),
          notes: data.snippet || data.body.slice(0, 300),
          isLiveFetched: true
        };

        state.fetchedLiveApps = state.fetchedLiveApps || [];
        state.fetchedLiveApps = state.fetchedLiveApps.filter((a) => a.gmailThreadId !== data.threadId);
        state.fetchedLiveApps.unshift(liveApp);

        state.draftReplySelectedId = liveApp.id;
        state.draftReplyExtraContext = data.body || data.snippet;
        state.draftReplyFetchSuccess = `✅ Fetched live email from Gmail (${data.company}: "${data.subject}"). Recruiter body loaded below!`;
      }

      state.draftReplyOutput = "";
      state.draftReplyCopied = false;
    } catch (err) {
      console.error("Fetch Gmail thread error:", err);
      // Fallback: If network failed or serverless offline, check if local application matches the ID
      if (threadId) {
        const localMatch = applications.find(
          (a) => a.gmailThreadId === threadId || (a.gmailMessageIds || []).includes(threadId)
        );
        if (localMatch) {
          state.draftReplySelectedId = localMatch.id;
          state.draftReplyExtraContext = localMatch.notes || "";
          state.draftReplyFetchSuccess = `Found matching application from local tracker (${localMatch.company})!`;
          state.draftReplyFetchingUrl = false;
          renderDraftReply(applications);
          return;
        }
      }
      state.draftReplyFetchError = `Could not fetch from Gmail: ${err.message}. You can still paste the email body manually in the box below.`;
    } finally {
      state.draftReplyFetchingUrl = false;
      renderDraftReply(applications);
    }
  };

  // Search input & Enter key
  const searchInput = byId("draftReplySearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.draftReplySearch = e.target.value;
      state.draftReplyFetchError = null;
      renderDraftReply(applications);
      const newSearchInput = byId("draftReplySearchInput");
      if (newSearchInput) {
        newSearchInput.focus();
        newSearchInput.setSelectionRange(newSearchInput.value.length, newSearchInput.value.length);
      }
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = (searchInput.value || "").trim();
        if (val.includes("mail.google.com") || /^[a-f0-9]{16,}$/i.test(val)) {
          e.preventDefault();
          handleFetchGmail();
        }
      }
    });
  }

  // Fetch from Gmail URL button
  const btnFetchUrl = byId("btnFetchGmailUrl");
  if (btnFetchUrl) {
    btnFetchUrl.addEventListener("click", handleFetchGmail);
  }

  // Filter pills
  document.querySelectorAll(".draft-reply-pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.draftReplyFilter = btn.dataset.filter;
      state.draftReplySelectedId = null; // reset to top match in filtered list
      renderDraftReply(applications);
    });
  });

  // Thread item selection
  document.querySelectorAll(".draft-reply-item-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      if (id && id !== state.draftReplySelectedId) {
        state.draftReplySelectedId = id;
        state.draftReplyOutput = "";
        state.draftReplyCopied = false;
        renderDraftReply(applications);
      }
    });
  });

  // Intent selector pills
  document.querySelectorAll(".draft-reply-intent-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.draftReplyIntent = btn.dataset.intent;
      renderDraftReply(applications);
    });
  });

  // Extra context textarea change listener
  const contextInput = byId("draftReplyExtraContextInput");
  if (contextInput) {
    contextInput.addEventListener("input", (e) => {
      state.draftReplyExtraContext = e.target.value;
    });
  }

  // Output textarea live edit listener
  const outputTextarea = byId("draftReplyOutputTextarea");
  if (outputTextarea) {
    outputTextarea.addEventListener("input", (e) => {
      state.draftReplyOutput = e.target.value;
    });
  }

  // Copy Draft Button
  const btnCopy = byId("btnCopyReplyDraft");
  if (btnCopy && outputTextarea) {
    btnCopy.addEventListener("click", () => {
      const textToCopy = outputTextarea.value;
      navigator.clipboard.writeText(textToCopy).then(() => {
        state.draftReplyCopied = true;
        btnCopy.classList.add("copied");
        btnCopy.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied to Clipboard!`;
        setTimeout(() => {
          state.draftReplyCopied = false;
          if (btnCopy) {
            btnCopy.classList.remove("copied");
            btnCopy.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Draft`;
          }
        }, 2500);
      });
    });
  }

  // Generate Draft Button
  const btnGenerate = byId("btnGenerateReplyDraft");
  const btnRegenerate = byId("btnRegenerateDraft");
  const runGeneration = async () => {
    const combinedApps = [...(state.fetchedLiveApps || []), ...applications];
    const selectedApp = combinedApps.find((a) => a.id === state.draftReplySelectedId);
    if (!selectedApp) return;

    state.draftReplyLoading = true;
    state.draftReplyCopied = false;
    renderDraftReply(applications);

    const activeModelId = getSelectedModel();
    const customOrKey = getOpenRouterKey();

    try {
      const reqHeaders = { "Content-Type": "application/json" };
      if (customOrKey) {
        reqHeaders["Authorization"] = `Bearer ${customOrKey}`;
      }

      // 1. Try serverless /api/generate-reply
      const response = await fetch("/api/generate-reply", {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({
          app: selectedApp,
          intent: state.draftReplyIntent || "interest",
          extraContext: state.draftReplyExtraContext || "",
          model: activeModelId
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.draft) {
          state.draftReplyOutput = data.draft;
          state.draftReplyLoading = false;
          renderDraftReply(applications);
          return;
        }
      }

      // 2. Direct browser OpenRouter fallback if API route not running
      if (customOrKey) {
        const directRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${customOrKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/Tirth-1999/Job_Tracker",
            "X-Title": "Job Tracker Draft My Reply"
          },
          body: JSON.stringify({
            model: activeModelId,
            messages: [
              {
                role: "system",
                content: `You are an expert executive talent agent for Tirth Shah. Write an authentic, polite, professional email reply from Tirth Shah ("I") to a recruiter. Keep it concise (2-4 paragraphs). Ground in his verified background (Texas A&M MS-MIS, Equifax credit data at TCS, Mays Business School analytics platform, UES energy automation).`
              },
              {
                role: "user",
                content: `Company: ${selectedApp.company}\nRole: ${selectedApp.role}\nRecruiter: ${selectedApp.latestFrom}\nSubject: ${selectedApp.latestSubject}\nIntent: ${state.draftReplyIntent}\nExtra Notes: ${state.draftReplyExtraContext || "None"}\nWrite the email reply now.`
              }
            ],
            temperature: 0.4
          })
        });

        if (directRes.ok) {
          const directJson = await directRes.json();
          const draft = directJson.choices?.[0]?.message?.content;
          if (draft) {
            state.draftReplyOutput = draft.trim();
            state.draftReplyLoading = false;
            renderDraftReply(applications);
            return;
          }
        }
      }

      // 3. Smart local template generator fallback
      state.draftReplyOutput = generateLocalSmartDraft(selectedApp, state.draftReplyIntent || "interest", state.draftReplyExtraContext || "");
    } catch (err) {
      console.warn("AI generation fell back to smart local template:", err.message);
      state.draftReplyOutput = generateLocalSmartDraft(selectedApp, state.draftReplyIntent || "interest", state.draftReplyExtraContext || "");
    } finally {
      state.draftReplyLoading = false;
      renderDraftReply(applications);
    }
  };

  if (btnGenerate) btnGenerate.addEventListener("click", runGeneration);
  if (btnRegenerate) btnRegenerate.addEventListener("click", runGeneration);
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
  const jobApps = applications.filter((app) => normalizeStatus(app.effectiveStatus || app.status) !== "not_related");
  const allRows = [...jobApps].sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
  const pagedRows = paginateArray(allRows, state.pageApps, state.pageSizeApps);

  byId("applications").innerHTML = allRows.length ? `
    ${renderPaginationBar(allRows.length, state.pageApps, state.pageSizeApps, "apps", "top")}
    <table>
      <thead><tr><th>Company</th><th>Role</th><th>Status</th><th>AI Decision</th><th>Latest Email</th><th>Last Activity</th><th>Action</th></tr></thead>
      <tbody>
        ${pagedRows.map((app) => {
          const status = normalizeStatus(app.effectiveStatus || app.status);
          const aiTag = app.aiDecision
            ? `<span class="pill pill-ai" title="AI Engine: ${escapeHtml(app.aiModel || 'Gemini Flash')}&#10;Decision: ${escapeHtml(app.aiDecision)}&#10;Evaluated: ${app.aiClassifiedAt ? new Date(app.aiClassifiedAt).toLocaleString() : 'Recently'}">AI: ${escapeHtml(app.aiDecision)}</span>`
            : `<span style="color:var(--muted);font-size:11px;">Default</span>`;
          return `
            <tr>
              <td><strong>${escapeHtml(app.company || "Unknown company")}</strong></td>
              <td>${escapeHtml(app.role || "Unknown role")}</td>
              <td><span class="pill status-pill ${statusClass(status)}">${escapeHtml(labelForStatus(status))}</span></td>
              <td>${aiTag}</td>
              <td>${escapeHtml(app.latestSubject || "No subject")}</td>
              <td>${formatDate(app.lastActivityAt)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                  <a class="btn-gmail-table" href="${getGmailUrl(app)}" target="_blank" rel="noopener noreferrer">Open ↗</a>
                  <select class="select-move-lane" data-id="${app.id}" data-current="${status}" style="font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid var(--border);" title="Change stage">
                    <option value="" disabled selected>Move ▾</option>
                    <option value="applied" ${status === "applied" ? "disabled" : ""}>Applied</option>
                    <option value="reply_needed" ${status === "reply_needed" ? "disabled" : ""}>Reply Needed</option>
                    <option value="interviewed" ${status === "interviewed" ? "disabled" : ""}>Interview / Assessment</option>
                    <option value="offered" ${status === "offered" ? "disabled" : ""}>Offered</option>
                    <option value="rejected" ${status === "rejected" ? "disabled" : ""}>Rejected</option>
                    <option value="not_related" ${status === "not_related" ? "disabled" : ""}>Other Emails</option>
                  </select>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    ${renderPaginationBar(allRows.length, state.pageApps, state.pageSizeApps, "apps", "bottom")}
  ` : `<div class="empty">No applications found</div>`;

  attachPaginationListeners("apps", allRows.length, "pageApps", "pageSizeApps", () => {
    renderApplications(applications);
  });
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
      <thead><tr><th>Sender / Organization</th><th>Subject</th><th>Classification & AI Decision</th><th>Date</th><th>Action</th></tr></thead>
      <tbody>
        ${pagedRows.map((app) => {
          const ignoredTag = app.isIgnored ? `<span class="pill pill-ignored">Ignored</span>` : `<span class="pill status-pill status-not-related">Other / Review</span>`;
          const aiTag = app.aiDecision
            ? `<div style="margin-top:4px;"><span class="pill pill-ai" title="AI Model: ${escapeHtml(app.aiModel || '')}&#10;Decision: ${escapeHtml(app.aiDecision)}">AI: ${escapeHtml(app.aiDecision)}</span></div>`
            : "";
          const reopenBtn = app.isIgnored ? `<button class="btn-action btn-reopen" data-id="${app.id}">Reopen</button>` : "";
          return `
            <tr>
              <td><strong>${escapeHtml(app.company || "Other")}</strong></td>
              <td>${escapeHtml(app.latestSubject || "No subject")}</td>
              <td>${ignoredTag}${aiTag}</td>
              <td>${formatDate(app.lastActivityAt)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                  <a class="btn-gmail-table" href="${getGmailUrl(app)}" target="_blank" rel="noopener noreferrer">Open ↗</a>
                  ${reopenBtn}
                  <select class="select-move-lane" data-id="${app.id}" data-current="not_related" style="font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid var(--border);" title="Promote to job pipeline stage">
                    <option value="" disabled selected>Move to Lane ▾</option>
                    <option value="applied">Applied</option>
                    <option value="reply_needed">Reply Needed</option>
                    <option value="interviewed">Interview / Assessment</option>
                    <option value="offered">Offered</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    ${renderPaginationBar(allRows.length, state.pageOther, state.pageSizeOther, "other", "bottom")}
  ` : `<div class="empty">No other emails found</div>`;

  attachPaginationListeners("other", allRows.length, "pageOther", "pageSizeOther", () => {
    renderOtherEmails(applications);
  });
}

function getLocalDateKey(dateInput) {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA"); // "YYYY-MM-DD"
}

// ─── Interactive Job Pipeline Sankey Diagram ─────────────────────────────────
function renderSankeySVG(applications, currentCategoryFilter, overallCounts) {
  const total = (overallCounts.applied || 0) + (overallCounts.reply_needed || 0) + (overallCounts.interviewed || 0) + (overallCounts.offered || 0) + (overallCounts.rejected || 0) + (overallCounts.not_related || 0) || 1;
  const appsTotal = (overallCounts.applied || 0) + (overallCounts.interviewed || 0) + (overallCounts.offered || 0) + (overallCounts.rejected || 0);
  const interviewTotal = (overallCounts.interviewed || 0) + (overallCounts.offered || 0);
  const offerTotal = overallCounts.offered || 0;
  const rejTotal = overallCounts.rejected || 0;
  const replyTotal = overallCounts.reply_needed || 0;
  const otherTotal = overallCounts.not_related || 0;
  const pendingTotal = overallCounts.applied || 0;
  const activeIntvTotal = overallCounts.interviewed || 0;

  const intvConv = appsTotal > 0 ? ((interviewTotal / appsTotal) * 100).toFixed(1) : "0";
  const rejConv = appsTotal > 0 ? ((rejTotal / appsTotal) * 100).toFixed(1) : "0";
  const offerConv = interviewTotal > 0 ? ((offerTotal / interviewTotal) * 100).toFixed(1) : "0";
  const appsPct = ((appsTotal / total) * 100).toFixed(1);
  const replyPct = ((replyTotal / total) * 100).toFixed(1);
  const otherPct = ((otherTotal / total) * 100).toFixed(1);

  // Column X positions & node widths
  const col0_x = 20, col0_w = 175;
  const col1_x = 255, col1_w = 180;
  const col2_x = 495, col2_w = 185;
  const col3_x = 740, col3_w = 215;

  const nodes = [
    // Column 0: Intake
    { id: "node_total", x: col0_x, y: 110, w: col0_w, h: 140, cat: "all", title: "Total Activity", count: total.toLocaleString(), sub: "All Tracked Communications", color: "#475569" },

    // Column 1: Primary Stream Channels
    { id: "node_apps", x: col1_x, y: 44, w: col1_w, h: 105, cat: "applied", title: "Job Applications", count: appsTotal.toLocaleString(), sub: `${appsPct}% of all activity`, color: "#2563eb" },
    { id: "node_inbound", x: col1_x, y: 168, w: col1_w, h: 72, cat: "reply_needed", title: "Recruiter Inbound", count: replyTotal.toLocaleString(), sub: `${replyPct}% recruiter outreach`, color: "#d97706" },
    { id: "node_other", x: col1_x, y: 258, w: col1_w, h: 95, cat: "not_related", title: "System & Platform", count: otherTotal.toLocaleString(), sub: `${otherPct}% notifications`, color: "#64748b" },

    // Column 2: Screening & Evaluation
    { id: "node_eval_intv", x: col2_x, y: 44, w: col2_w, h: 72, cat: "interviewed", title: "Interviews & Screens", count: interviewTotal.toLocaleString(), sub: `${intvConv}% interview rate`, color: "#7c3aed" },
    { id: "node_eval_pend", x: col2_x, y: 132, w: col2_w, h: 90, cat: "applied", title: "Awaiting Review", count: pendingTotal.toLocaleString(), sub: "In employer queue", color: "#3b82f6" },
    { id: "node_eval_rej", x: col2_x, y: 238, w: col2_w, h: 74, cat: "rejected", title: "Screening Rejections", count: rejTotal.toLocaleString(), sub: `${rejConv}% rejection rate`, color: "#ef4444" },
    { id: "node_eval_reply", x: col2_x, y: 328, w: col2_w, h: 56, cat: "reply_needed", title: "Active Discussions", count: replyTotal.toLocaleString(), sub: "Inbound threads", color: "#f59e0b" },

    // Column 3: Final Outcomes
    { id: "node_out_offer", x: col3_x, y: 44, w: col3_w, h: 72, cat: "offered", title: "🏆 Job Offer Received", count: offerTotal.toLocaleString(), sub: "ATC (Business Analyst, $70k)", color: "#10b981", isOffer: true },
    { id: "node_out_intv", x: col3_x, y: 132, w: col3_w, h: 68, cat: "interviewed", title: "In Active Rounds", count: activeIntvTotal.toLocaleString(), sub: "Technical loops & tests", color: "#8b5cf6" },
    { id: "node_out_pend", x: col3_x, y: 216, w: col3_w, h: 74, cat: "applied", title: "Under Consideration", count: (pendingTotal + replyTotal).toLocaleString(), sub: "Pending decisions", color: "#60a5fa" },
    { id: "node_out_rej", x: col3_x, y: 306, w: col3_w, h: 76, cat: "rejected", title: "Rejections Recorded", count: rejTotal.toLocaleString(), sub: "Archived rejections", color: "#dc2626" }
  ];

  function makeRibbonPath(x0, y0, h0, x1, y1, h1) {
    const dx = (x1 - x0) * 0.48;
    return `M ${x0} ${y0} C ${x0 + dx} ${y0}, ${x1 - dx} ${y1}, ${x1} ${y1} L ${x1} ${y1 + h1} C ${x1 - dx} ${y1 + h1}, ${x0 + dx} ${y0 + h0}, ${x0} ${y0 + h0} Z`;
  }

  const ribbons = [
    // Col 0 -> Col 1
    {
      d: makeRibbonPath(col0_x + col0_w, 120, 58, col1_x, 56, 58),
      grad: "grad-total-apps",
      cat: "applied",
      title: "Total Tracked → Job Applications",
      stat: `${appsTotal} applications (${appsPct}% share)`
    },
    {
      d: makeRibbonPath(col0_x + col0_w, 178, 25, col1_x, 176, 25),
      grad: "grad-total-inbound",
      cat: "reply_needed",
      title: "Total Tracked → Recruiter Outreach",
      stat: `${replyTotal} recruiter inbounds (${replyPct}% share)`
    },
    {
      d: makeRibbonPath(col0_x + col0_w, 203, 35, col1_x, 270, 48),
      grad: "grad-total-other",
      cat: "not_related",
      title: "Total Tracked → Platform & Confirmations",
      stat: `${otherTotal} notices (${otherPct}% share)`
    },

    // Col 1 -> Col 2
    {
      d: makeRibbonPath(col1_x + col1_w, 54, 22, col2_x, 56, 24),
      grad: "grad-apps-intv",
      cat: "interviewed",
      title: "Applications → Interviews & Assessments",
      stat: `${interviewTotal} candidates (${intvConv}% pass-through)`
    },
    {
      d: makeRibbonPath(col1_x + col1_w, 76, 45, col2_x, 142, 50),
      grad: "grad-apps-pend",
      cat: "applied",
      title: "Applications → Awaiting Review",
      stat: `${pendingTotal} pending review (${((pendingTotal / appsTotal) * 100).toFixed(1)}%)`
    },
    {
      d: makeRibbonPath(col1_x + col1_w, 121, 24, col2_x, 248, 35),
      grad: "grad-apps-rej",
      cat: "rejected",
      title: "Applications → Screening Rejections",
      stat: `${rejTotal} rejections (${rejConv}% rejection rate)`
    },
    {
      d: makeRibbonPath(col1_x + col1_w, 185, 28, col2_x, 336, 30),
      grad: "grad-inbound-dialogue",
      cat: "reply_needed",
      title: "Recruiter Inbound → Active Dialogues",
      stat: `${replyTotal} active recruiter threads`
    },

    // Col 2 -> Col 3
    {
      d: makeRibbonPath(col2_x + col2_w, 54, 20, col3_x, 56, 24),
      grad: "grad-intv-offer",
      cat: "offered",
      title: "Interviews → 🏆 Job Offer Received",
      stat: `${offerTotal} Job Offer (${offerConv}% interview-to-offer rate)`
    },
    {
      d: makeRibbonPath(col2_x + col2_w, 74, 24, col3_x, 144, 28),
      grad: "grad-intv-active",
      cat: "interviewed",
      title: "Interviews → In Active Loops",
      stat: `${activeIntvTotal} active assessment & interview loops`
    },
    {
      d: makeRibbonPath(col2_x + col2_w, 148, 45, col3_x, 226, 38),
      grad: "grad-pend-outcome",
      cat: "applied",
      title: "Awaiting Review → Under Consideration",
      stat: `${pendingTotal} actively being evaluated`
    },
    {
      d: makeRibbonPath(col2_x + col2_w, 252, 34, col3_x, 318, 38),
      grad: "grad-rej-outcome",
      cat: "rejected",
      title: "Screening Rejections → Total Rejections",
      stat: `${rejTotal} cumulative rejections recorded`
    },
    {
      d: makeRibbonPath(col2_x + col2_w, 340, 20, col3_x, 258, 20),
      grad: "grad-dialogue-outcome",
      cat: "reply_needed",
      title: "Active Dialogues → Under Consideration",
      stat: `${replyTotal} ongoing recruiter discussions`
    }
  ];

  const defs = `
    <defs>
      <linearGradient id="grad-total-apps" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#475569" stop-opacity="0.4" />
        <stop offset="100%" stop-color="#2563eb" stop-opacity="0.65" />
      </linearGradient>
      <linearGradient id="grad-total-inbound" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#475569" stop-opacity="0.4" />
        <stop offset="100%" stop-color="#d97706" stop-opacity="0.65" />
      </linearGradient>
      <linearGradient id="grad-total-other" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#475569" stop-opacity="0.4" />
        <stop offset="100%" stop-color="#64748b" stop-opacity="0.55" />
      </linearGradient>

      <linearGradient id="grad-apps-intv" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#2563eb" stop-opacity="0.6" />
        <stop offset="100%" stop-color="#7c3aed" stop-opacity="0.75" />
      </linearGradient>
      <linearGradient id="grad-apps-pend" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#2563eb" stop-opacity="0.55" />
        <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.65" />
      </linearGradient>
      <linearGradient id="grad-apps-rej" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#2563eb" stop-opacity="0.5" />
        <stop offset="100%" stop-color="#ef4444" stop-opacity="0.65" />
      </linearGradient>
      <linearGradient id="grad-inbound-dialogue" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#d97706" stop-opacity="0.6" />
        <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.7" />
      </linearGradient>

      <linearGradient id="grad-intv-offer" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.75" />
        <stop offset="100%" stop-color="#10b981" stop-opacity="0.9" />
      </linearGradient>
      <linearGradient id="grad-intv-active" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.65" />
        <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.75" />
      </linearGradient>
      <linearGradient id="grad-pend-outcome" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.55" />
        <stop offset="100%" stop-color="#60a5fa" stop-opacity="0.65" />
      </linearGradient>
      <linearGradient id="grad-rej-outcome" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ef4444" stop-opacity="0.6" />
        <stop offset="100%" stop-color="#dc2626" stop-opacity="0.7" />
      </linearGradient>
      <linearGradient id="grad-dialogue-outcome" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.6" />
        <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.65" />
      </linearGradient>

      <filter id="offer-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#10b981" flood-opacity="0.4" />
      </filter>
    </defs>
  `;

  const colHeaders = `
    <g class="sankey-headers">
      <text x="${col0_x + 6}" y="22" class="sankey-col-header">1. Intake &amp; Inflow</text>
      <text x="${col1_x + 6}" y="22" class="sankey-col-header">2. Stream Channels</text>
      <text x="${col2_x + 6}" y="22" class="sankey-col-header">3. Screening &amp; Eval</text>
      <text x="${col3_x + 6}" y="22" class="sankey-col-header">4. Pipeline Outcomes</text>
    </g>
  `;

  const ribbonsSvg = ribbons.map((r) => {
    const isFiltered = currentCategoryFilter !== "all";
    const isMatch = r.cat === currentCategoryFilter;
    const ribbonClass = isFiltered ? (isMatch ? "active" : "dimmed") : "";
    return `
      <path class="sankey-ribbon ${ribbonClass}"
            d="${r.d}"
            fill="url(#${r.grad})"
            data-category="${r.cat}"
            data-title="${escapeHtml(r.title)}"
            data-stat="${escapeHtml(r.stat)}" />
    `;
  }).join("");

  const nodesSvg = nodes.map((n) => {
    const isFiltered = currentCategoryFilter !== "all";
    const isActive = n.cat === currentCategoryFilter || (n.cat === "all" && !isFiltered);
    const nodeClass = isActive ? "active" : (isFiltered && n.cat !== "all" ? "dimmed" : "");
    const offerStyle = n.isOffer ? 'filter="url(#offer-glow)"' : "";
    return `
      <g class="sankey-node ${nodeClass}"
         data-category="${n.cat}"
         data-title="${escapeHtml(n.title)}"
         data-stat="${n.count} applications • ${escapeHtml(n.sub)}"
         transform="translate(${n.x}, ${n.y})"
         ${offerStyle}>
        <rect class="sankey-node-bg" width="${n.w}" height="${n.h}" rx="8" />
        <rect class="sankey-node-accent" x="0" y="0" width="4" height="${n.h}" rx="2" fill="${n.color}" />
        <text x="14" y="24" class="sankey-node-title">${escapeHtml(n.title)}</text>
        <text x="14" y="48" class="sankey-node-count" fill="${n.color}">${n.count}</text>
        <text x="14" y="65" class="sankey-node-sub">${escapeHtml(n.sub)}</text>
      </g>
    `;
  }).join("");

  return `
    <div class="sankey-wrap">
      <svg class="sankey-svg" viewBox="0 0 980 410" preserveAspectRatio="xMidYMid meet">
        ${defs}
        ${colHeaders}
        <g class="sankey-ribbons-layer">${ribbonsSvg}</g>
        <g class="sankey-nodes-layer">${nodesSvg}</g>
      </svg>
      <div id="sankeyTooltip" class="sankey-tooltip">
        <div class="sankey-tooltip-title" id="sankeyTooltipTitle"></div>
        <div class="sankey-tooltip-stat" id="sankeyTooltipStat"></div>
      </div>
    </div>
  `;
}

function renderAnalytics(applications) {
  const analyticsEl = byId("analytics");
  if (!analyticsEl) return;

  const currentSelectedDate = state.selectedDate || getTodayDateStr();
  const currentCategoryFilter = state.analyticsCategoryFilter || "all";
  const chartView = state.analyticsChartView || "sankey";
  const isSankey = chartView === "sankey";

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
    { key: "applied", label: "Applied", color: "var(--applied)" },
    { key: "reply_needed", label: "Reply Needed", color: "var(--reply)" },
    { key: "interviewed", label: "Interview / Assessment", color: "var(--interviewed)" },
    { key: "offered", label: "Offered", color: "var(--offered)" },
    { key: "rejected", label: "Rejected", color: "var(--rejected)" },
    { key: "not_related", label: "Other Emails", color: "#64748b" }
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

    const totalPipelineEmails = applications.reduce((sum, a) => sum + (a.gmailMessageIds?.length || 1), 0);

    analyticsEl.innerHTML = `
    <div class="analytics-header-card">
      <div class="analytics-title">
        <h2>${formattedSelectedDate} ${isSelectedToday ? '<span class="pill pill-done" style="font-size:12px;vertical-align:middle;margin-left:6px;">Today</span>' : ''}</h2>
        <p>Daily tracking of job applications, recruiter outreaches, and email activity</p>
      </div>
      <div class="date-controls">
        <button class="btn-date-nav btn-prev-day" title="View previous day">◀ Prev Day</button>
        <input type="date" class="date-input" id="analyticsDatePicker" value="${currentSelectedDate}" max="${getTodayDateStr()}" />
        <button class="btn-date-nav btn-date-today" title="Go to today">Today</button>
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
      <div class="kpi-card kpi-applied">
        <strong>${overallCounts.applied || 0}</strong>
        <span>Applied</span>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">${appliedCount > 0 ? `<span style="color:var(--applied);font-weight:600;">+${appliedCount}</span> on date` : `0 on selected date`}</div>
      </div>
      <div class="kpi-card kpi-reply">
        <strong>${overallCounts.reply_needed || 0}</strong>
        <span>Reply Needed</span>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">${replyNeededCount > 0 ? `<span style="color:var(--reply);font-weight:600;">+${replyNeededCount}</span> on date` : `0 on selected date`}</div>
      </div>
      <div class="kpi-card kpi-interviewed">
        <strong>${overallCounts.interviewed || 0}</strong>
        <span>Interview / Assessment</span>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">${interviewCount > 0 ? `<span style="color:var(--interviewed);font-weight:600;">+${interviewCount}</span> on date` : `0 on selected date`}</div>
      </div>
      <div class="kpi-card kpi-offered">
        <strong>${overallCounts.offered || 0}</strong>
        <span>Offered</span>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">${offeredCount > 0 ? `<span style="color:var(--offered);font-weight:600;">+${offeredCount}</span> on date` : `0 on selected date`}</div>
      </div>
      <div class="kpi-card kpi-rejected">
        <strong>${overallCounts.rejected || 0}</strong>
        <span>Rejected</span>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">${rejectedCount > 0 ? `<span style="color:var(--danger);font-weight:600;">+${rejectedCount}</span> on date` : `0 on selected date`}</div>
      </div>
      <div class="kpi-card kpi-total" style="border-top: 3px solid #64748b;">
        <strong>${overallCounts.not_related || 0}</strong>
        <span>Other Emails</span>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">Filtered non-pipeline</div>
      </div>
    </div>

    <!-- Funnel Flow & Category Distribution -->
    <div class="aggregate-card">
      <div class="aggregate-header">
        <div>
          <h3>Pipeline Flow &amp; Category Distribution (${applications.length} Total Entries)</h3>
          <span style="font-size:12px;color:var(--muted);">${isSankey ? "Click any stage node or flow channel to filter the activity table below" : "Click any bar to filter the activity table below"}</span>
        </div>
        <div class="chart-view-toggle" role="group" aria-label="Chart view mode">
          <button type="button" class="btn-chart-view ${isSankey ? "active" : ""}" data-chart-view="sankey" title="View interactive Sankey Flow">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16c3-8 7-2 10-10"/></svg>
            Sankey Flow
          </button>
          <button type="button" class="btn-chart-view ${!isSankey ? "active" : ""}" data-chart-view="bars" title="View Distribution Bars">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
            Distribution Bars
          </button>
        </div>
      </div>

      ${isSankey ? renderSankeySVG(applications, currentCategoryFilter, overallCounts) : `
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
                <span>${cat.label}</span>
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
      `}
    </div>

    <!-- 14-Day Activity Trend Bar Chart -->
    <div class="chart-card">
      <div class="chart-header">
        <h3>14-Day Activity Trend (Click any day to inspect)</h3>
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
      <span class="filter-tags-label">Filter Activity Log by Category:</span>
      <div class="category-filter-tags">
        <button class="cat-tag-btn ${currentCategoryFilter === "all" ? "active" : ""}" data-category="all">
          All Activity <span class="cat-tag-count">${dayApps.length}</span>
        </button>
        ${aggCategories
          .map((cat) => {
            const dayCount = dayApps.filter((a) => normalizeStatus(a.effectiveStatus || a.status) === cat.key).length;
            const isActive = currentCategoryFilter === cat.key;
            return `
            <button class="cat-tag-btn ${isActive ? "active" : ""}" data-category="${cat.key}">
              ${cat.label} <span class="cat-tag-count">${dayCount}</span>
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
            ? `<button class="cat-tag-btn" data-category="all" style="font-size:11px;padding:3px 8px;">Clear Filter</button>`
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

  // Chart View Toggle (Sankey vs. Bars)
  document.querySelectorAll(".btn-chart-view").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.analyticsChartView = btn.dataset.chartView || "sankey";
      renderAnalytics(applications);
    });
  });

  // Sankey Chart Interactivity (Nodes & Ribbons)
  const sankeyWrap = document.querySelector(".sankey-wrap");
  const sankeyTooltip = byId("sankeyTooltip");
  const sankeyTooltipTitle = byId("sankeyTooltipTitle");
  const sankeyTooltipStat = byId("sankeyTooltipStat");

  if (sankeyWrap && sankeyTooltip) {
    sankeyWrap.querySelectorAll(".sankey-ribbon, .sankey-node").forEach((elem) => {
      elem.addEventListener("mouseenter", () => {
        const title = elem.dataset.title;
        const stat = elem.dataset.stat;
        if (!title) return;
        if (sankeyTooltipTitle) sankeyTooltipTitle.textContent = title;
        if (sankeyTooltipStat) sankeyTooltipStat.textContent = stat || "";
        sankeyTooltip.style.display = "block";
      });

      elem.addEventListener("mousemove", (e) => {
        const rect = sankeyWrap.getBoundingClientRect();
        const mouseX = Math.max(10, Math.min(rect.width - 20, e.clientX - rect.left));
        const mouseY = Math.max(10, e.clientY - rect.top);
        sankeyTooltip.style.left = `${mouseX}px`;
        sankeyTooltip.style.top = `${mouseY}px`;
      });

      elem.addEventListener("mouseleave", () => {
        sankeyTooltip.style.display = "none";
      });

      elem.addEventListener("click", () => {
        const cat = elem.dataset.category;
        if (!cat) return;
        state.analyticsCategoryFilter = state.analyticsCategoryFilter === cat ? "all" : cat;
        renderAnalytics(applications);
      });
    });
  }
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

const STATUS_LABELS = {
  applied: "Applied",
  reply_needed: "Reply Needed",
  interviewed: "Interview / Assessment",
  offered: "Offered",
  rejected: "Rejected",
  not_related: "Other Emails"
};

function labelForStatus(status) {
  const norm = normalizeStatus(status);
  return STATUS_LABELS[norm] || LANES.find(([key]) => key === norm)?.[1] || "Applied";
}

function statusClass(status) {
  const norm = normalizeStatus(status);
  return `status-${norm.replaceAll("_", "-")}`;
}

function normalizeStatus(status) {
  if (!status || status === "initial_revert_needed") return "applied";
  const s = String(status).trim().toLowerCase();
  if (STATUS_LABELS[s]) return s;
  return "applied";
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
  if (!viewName) return;
  state.view = viewName;
  
  // 1. Update Tab Buttons
  document.querySelectorAll(".tab").forEach((tab) => {
    const isActive = tab.dataset.view === viewName;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  // 2. Update View Sections (Force inline display to eliminate CSS specificity issues)
  document.querySelectorAll(".view").forEach((view) => {
    const isTarget = view.id === `${viewName}View`;
    view.classList.toggle("active", isTarget);
    view.style.display = isTarget ? "block" : "none";
  });

  // 3. Render active view content immediately
  render();
}

const AI_MODELS = [
  // ─── 100% Free Models (OpenRouter Free Tier) ──────────────────────────────
  {
    id: "openrouter/free",
    name: "OpenRouter Free Router",
    badge: "100% Free · Auto-Selects Top Free Model",
    provider: "OpenRouter Free Pool",
    description: "Automatically routes requests to the fastest, best available 100% free model across all providers."
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "NVIDIA Nemotron 3 Ultra (550B)",
    badge: "100% Free · 550B Frontier Reasoning",
    provider: "NVIDIA (via OpenRouter)",
    description: "NVIDIA's massive 550B parameter frontier model. Unrivaled reasoning, document comprehension, and intent classification."
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    name: "NVIDIA Nemotron 3.5 Lightning",
    badge: "100% Free · Lightning Speed",
    provider: "NVIDIA (via OpenRouter)",
    description: "Ultra-fast latency with cutting-edge extraction capabilities. Engineered for instant high-throughput parsing."
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "NVIDIA Nemotron 3 Super (120B)",
    badge: "100% Free · Deep Analytical Precision",
    provider: "NVIDIA (via OpenRouter)",
    description: "Powerful 120B open weights model with state-of-the-art accuracy in recruiter message analysis and status auditing."
  },
  {
    id: "google/gemma-4-31b-it:free",
    name: "Google Gemma 4 (31B)",
    badge: "100% Free · Google Open Weights",
    provider: "Google (via OpenRouter)",
    description: "Google's premier open weights model optimized for high accuracy instruction following and JSON extraction."
  },
  {
    id: "minimax/minimax-m3:free",
    name: "MiniMax M3",
    badge: "100% Free · Long Context Extraction",
    provider: "MiniMax (via OpenRouter)",
    description: "High-capability free model with deep multi-paragraph context awareness for complex email thread parsing."
  },
  {
    id: "z-ai/glm-5.2:free",
    name: "Z.ai GLM 5.2",
    badge: "100% Free · Robust Schema Compliance",
    provider: "Z.ai (via OpenRouter)",
    description: "Next-gen bilingual model with strong structured output adherence and recruiter tone recognition."
  },

  // ─── Frontier & High Precision Models ──────────────────────────────────────
  {
    id: "google/gemini-3.7-flash",
    name: "Google Gemini 3.7 Flash",
    badge: "Next-Gen Frontier · Ultra-Fast",
    provider: "Google (via OpenRouter)",
    description: "Google's newest frontier Flash model. Deep reasoning with lightning speed and advanced semantic precision."
  },
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Google Gemini 2.5 Flash Lite",
    badge: "Blazing Fast · High Volume",
    provider: "Google (via OpenRouter)",
    description: "Ultra-fast latency, high throughput JSON structured output. Ideal for rapid multi-batch classification."
  },
  {
    id: "anthropic/claude-3.7-sonnet",
    name: "Anthropic Claude 3.7 Sonnet",
    badge: "Frontier Reasoning · Complex Auditor",
    provider: "Anthropic (via OpenRouter)",
    description: "Gold standard for complex multi-turn reasoning and nuanced contract/offer letter analysis."
  },
  {
    id: "anthropic/claude-3.5-haiku",
    name: "Anthropic Claude 3.5 Haiku",
    badge: "High Precision · Fast Reasoning",
    provider: "Anthropic (via OpenRouter)",
    description: "Anthropic's fastest intelligence model. Exceptional precision in natural language parsing and recruiter intent extraction."
  },
  {
    id: "openai/gpt-4o-mini",
    name: "OpenAI GPT-4o Mini",
    badge: "Balanced & Reliable",
    provider: "OpenAI (via OpenRouter)",
    description: "OpenAI's compact flagship. Highly consistent schema adherence and robust extraction."
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3 / V4 Flash",
    badge: "Maximum Cost Efficiency",
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

function getOpenRouterKey() {
  return localStorage.getItem("job_tracker_openrouter_key") || "";
}

function setOpenRouterKey(key) {
  if (key) {
    localStorage.setItem("job_tracker_openrouter_key", key.trim());
  } else {
    localStorage.removeItem("job_tracker_openrouter_key");
  }
}

// ─── Scope filtering helper for AI Re-Classification ──────────────────────────
// ─── Multi-Filter Scope Filtering for Master AI Re-Classification ─────────────
function getTargetApplicationsForReclassify(applications) {
  const filters = state.reclassifyFilters || {
    lane: "all",
    timeRange: "all",
    auditState: "all",
    limit: 0
  };

  let matching = [...applications];

  // 1. Filter by Pipeline Stage / Lane
  if (filters.lane && filters.lane !== "all") {
    matching = matching.filter((app) => normalizeStatus(app.effectiveStatus || app.status) === filters.lane);
  }

  // 2. Filter by Time Window / Age
  if (filters.timeRange && filters.timeRange !== "all") {
    let days = 0;
    if (filters.timeRange === "24h") days = 1;
    else if (filters.timeRange === "3d") days = 3;
    else if (filters.timeRange === "7d") days = 7;
    else if (filters.timeRange === "14d") days = 14;
    else if (filters.timeRange === "30d") days = 30;
    else if (filters.timeRange === "60d") days = 60;
    else if (Number(filters.timeRange) > 0) days = Number(filters.timeRange);

    if (days > 0) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      matching = matching.filter((app) => {
        const ts = new Date(app.lastActivityAt || app.updatedAt || 0).getTime();
        return !isNaN(ts) && ts >= cutoff;
      });
    }
  }

  // 3. Filter by Audit State
  if (filters.auditState === "unclassified") {
    matching = matching.filter((app) => !app.aiDecision || app.aiDecision.startsWith("Audited:"));
  } else if (filters.auditState === "ai_classified") {
    matching = matching.filter((app) => app.aiDecision && !app.aiDecision.startsWith("Audited:"));
  } else if (filters.auditState === "manual_override") {
    matching = matching.filter((app) => app.isManualOverride);
  }

  // 4. Slice by Volume Limit (if specified)
  if (filters.limit && Number(filters.limit) > 0) {
    matching = matching.slice(0, Number(filters.limit));
  }

  return matching;
}

function getReclassifyScopeDescription(filters) {
  const f = filters || { lane: "all", timeRange: "all", auditState: "all", limit: 0 };
  const parts = [];

  if (f.lane && f.lane !== "all") parts.push(`${labelForStatus(f.lane)} lane`);
  else parts.push("all lanes");

  if (f.timeRange && f.timeRange !== "all") {
    const timeLabels = { "24h": "past 24h", "3d": "past 3 days", "7d": "past 7 days", "14d": "past 14 days", "30d": "past 30 days", "60d": "past 60 days" };
    parts.push(timeLabels[f.timeRange] || `past ${f.timeRange}d`);
  } else {
    parts.push("all time");
  }

  if (f.auditState === "unclassified") parts.push("unaudited only");
  else if (f.auditState === "ai_classified") parts.push("AI classified only");
  else if (f.auditState === "manual_override") parts.push("manual overrides only");

  if (f.limit && Number(f.limit) > 0) parts.push(`max ${f.limit} apps`);

  return parts.join(" · ");
}

function renderServices(applications) {
  const servicesEl = byId("services");
  if (!servicesEl) return;

  const totalApps = applications.length;
  const currentModelId = getSelectedModel();
  const currentModel = AI_MODELS.find((m) => m.id === currentModelId) || AI_MODELS[0];
  const orKey = getOpenRouterKey();

  state.reclassifyFilters = state.reclassifyFilters || {
    lane: "all",
    timeRange: "all",
    auditState: "all",
    limit: 0
  };
  const filters = state.reclassifyFilters;
  const targetedApps = getTargetApplicationsForReclassify(applications);
  const scopeDescription = getReclassifyScopeDescription(filters);

  // Lane count helpers for dropdown badges
  const laneCounts = {
    applied: applications.filter(a => normalizeStatus(a.effectiveStatus || a.status) === 'applied').length,
    reply_needed: applications.filter(a => normalizeStatus(a.effectiveStatus || a.status) === 'reply_needed').length,
    interviewed: applications.filter(a => normalizeStatus(a.effectiveStatus || a.status) === 'interviewed').length,
    offered: applications.filter(a => normalizeStatus(a.effectiveStatus || a.status) === 'offered').length,
    rejected: applications.filter(a => normalizeStatus(a.effectiveStatus || a.status) === 'rejected').length,
    not_related: applications.filter(a => normalizeStatus(a.effectiveStatus || a.status) === 'not_related').length
  };

  servicesEl.innerHTML = `
    <!-- Combined Header & Active Model Selector Card -->
    <div class="services-header-card">
      <div class="services-header-top">
        <div class="services-title">
          <h2>Operations & AI Services Suite</h2>
          <p>Automated cloud batch jobs, live LLM AI re-classifiers, synchronization services, and data repair utilities</p>
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
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
          <div class="token-input-group" style="margin:0;">
            <input type="password" id="openRouterKeyInput" class="token-input" placeholder="OpenRouter Key (Optional if in Vercel)" value="${orKey ? "••••••••••••••••••••" : ""}" style="max-width:210px;" />
            <button id="btnSaveOrKey" class="btn-github-save" type="button" style="padding:6px 12px;font-size:11px;">
              ${orKey ? "Save Key" : "Set Key"}
            </button>
            ${orKey ? `<button id="btnClearOrKey" class="btn-modal-cancel" style="padding:6px 10px;font-size:11px;" type="button">Clear</button>` : ""}
          </div>
        </div>
      </div>
      <div class="model-details-banner">
        <div>
          <strong>Active Engine: ${escapeHtml(currentModel.name)}</strong> (${escapeHtml(currentModel.provider)}) &mdash; 
          <span style="color:#94a3b8;font-size:12px;">${escapeHtml(currentModel.description)}</span>
        </div>
        <span class="pill pill-done" style="font-size:11px;font-weight:700;white-space:nowrap;">${escapeHtml(currentModel.badge)}</span>
      </div>
    </div>

    <div class="services-layout-wrap">
      <!-- Service 1: Hero Card (Master AI Mailbox Re-Classification) -->
      <div class="service-hero-card">
        <div class="service-hero-top">
          <div class="service-icon-hero" style="font-size:13px;font-weight:700;letter-spacing:0.5px;">AI</div>
          <div class="service-hero-content">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <h3>Master AI Mailbox Re-Classification</h3>
              <span class="pill" style="font-weight:700;background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe;">
                Mailbox Total: ${totalApps} Applications
              </span>
            </div>
            <p>Runs the Master AI Recruitment Auditor prompt taxonomy across your selected scope using <strong>${escapeHtml(currentModel.name)}</strong>. Analyzes recruiter inquiries, interview invitations, ATS receipts, and saves AI decision reasoning tags directly to Supabase.</p>
            <div class="service-meta-badges">
              <span class="pill">Engine: ${escapeHtml(currentModel.name)}</span>
              <span class="pill">Parallel Streams: 6</span>
              <span class="pill">Batch Size: 25 / req</span>
            </div>
          </div>
        </div>

        <!-- Multi-Filter Scope Controls -->
        <div class="reclassify-scope-card">
          <div class="scope-header-row">
            <div class="scope-title-label">
              <span>Target Scope Filters:</span>
            </div>
            <div id="reclassifyTargetBadge" class="scope-target-badge">
              Targeting: <strong>${targetedApps.length}</strong> of ${totalApps} applications (${Math.round((targetedApps.length / Math.max(1, totalApps)) * 100)}%) <span style="color:var(--muted);font-weight:normal;">[${escapeHtml(scopeDescription)}]</span>
            </div>
          </div>
          
          <!-- 4-Column Multi-Filter Grid -->
          <div class="scope-filter-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin:12px 0 14px 0;">
            <div class="scope-filter-col">
              <label style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px;display:block;">Pipeline Stage / Lane</label>
              <select id="reclassifyFilterLane" class="scope-select" style="width:100%;font-weight:600;">
                <option value="all" ${filters.lane === "all" ? "selected" : ""}>All Lanes (${totalApps})</option>
                <option value="applied" ${filters.lane === "applied" ? "selected" : ""}>Applied (${laneCounts.applied})</option>
                <option value="reply_needed" ${filters.lane === "reply_needed" ? "selected" : ""}>Reply Needed (${laneCounts.reply_needed})</option>
                <option value="interviewed" ${filters.lane === "interviewed" ? "selected" : ""}>Interview / Assessment (${laneCounts.interviewed})</option>
                <option value="offered" ${filters.lane === "offered" ? "selected" : ""}>Offered (${laneCounts.offered})</option>
                <option value="rejected" ${filters.lane === "rejected" ? "selected" : ""}>Rejected (${laneCounts.rejected})</option>
                <option value="not_related" ${filters.lane === "not_related" ? "selected" : ""}>Other Emails (${laneCounts.not_related})</option>
              </select>
            </div>

            <div class="scope-filter-col">
              <label style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px;display:block;">Time Window / Age</label>
              <select id="reclassifyFilterTime" class="scope-select" style="width:100%;font-weight:600;">
                <option value="all" ${filters.timeRange === "all" ? "selected" : ""}>All Time (Entire History)</option>
                <option value="24h" ${filters.timeRange === "24h" ? "selected" : ""}>Last 24 Hours</option>
                <option value="3d" ${filters.timeRange === "3d" ? "selected" : ""}>Last 3 Days</option>
                <option value="7d" ${filters.timeRange === "7d" ? "selected" : ""}>Last 7 Days</option>
                <option value="14d" ${filters.timeRange === "14d" ? "selected" : ""}>Last 14 Days</option>
                <option value="30d" ${filters.timeRange === "30d" ? "selected" : ""}>Last 30 Days</option>
                <option value="60d" ${filters.timeRange === "60d" ? "selected" : ""}>Last 60 Days</option>
              </select>
            </div>

            <div class="scope-filter-col">
              <label style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px;display:block;">Audit Status</label>
              <select id="reclassifyFilterAudit" class="scope-select" style="width:100%;font-weight:600;">
                <option value="all" ${filters.auditState === "all" ? "selected" : ""}>All Items</option>
                <option value="unclassified" ${filters.auditState === "unclassified" ? "selected" : ""}>Only Unaudited / Unclassified</option>
                <option value="ai_classified" ${filters.auditState === "ai_classified" ? "selected" : ""}>Only AI Classified</option>
                <option value="manual_override" ${filters.auditState === "manual_override" ? "selected" : ""}>Only Manually Overridden</option>
              </select>
            </div>

            <div class="scope-filter-col">
              <label style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px;display:block;">Max Volume Limit</label>
              <select id="reclassifyFilterLimit" class="scope-select" style="width:100%;font-weight:600;">
                <option value="0" ${!filters.limit || filters.limit === 0 ? "selected" : ""}>All Matching (No Limit)</option>
                <option value="25" ${filters.limit === 25 ? "selected" : ""}>Top 25 Most Recent</option>
                <option value="50" ${filters.limit === 50 ? "selected" : ""}>Top 50 Most Recent</option>
                <option value="100" ${filters.limit === 100 ? "selected" : ""}>Top 100 Most Recent</option>
                <option value="250" ${filters.limit === 250 ? "selected" : ""}>Top 250 Most Recent</option>
              </select>
            </div>
          </div>

          <!-- Quick Multi-Filter Preset Combinations -->
          <div class="scope-presets-row" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--border);">
            <span style="font-size:11px;color:var(--muted);font-weight:600;">Popular Combinations:</span>
            <button type="button" class="btn-scope-preset ${filters.lane === 'applied' && filters.timeRange === '7d' ? 'active' : ''}" data-lane="applied" data-time="7d" data-audit="all" data-limit="0">Applied (Last 7d)</button>
            <button type="button" class="btn-scope-preset ${filters.lane === 'reply_needed' && filters.timeRange === '7d' ? 'active' : ''}" data-lane="reply_needed" data-time="7d" data-audit="all" data-limit="0">Reply Needed (Last 7d)</button>
            <button type="button" class="btn-scope-preset ${filters.lane === 'applied' && filters.timeRange === '30d' ? 'active' : ''}" data-lane="applied" data-time="30d" data-audit="all" data-limit="0">Applied (Last 30d)</button>
            <button type="button" class="btn-scope-preset ${filters.lane === 'not_related' && filters.timeRange === 'all' ? 'active' : ''}" data-lane="not_related" data-time="all" data-audit="all" data-limit="0">Other Emails (All)</button>
            <button type="button" class="btn-scope-preset ${filters.lane === 'all' && filters.auditState === 'unclassified' ? 'active' : ''}" data-lane="all" data-time="all" data-audit="unclassified" data-limit="0">Unaudited Only</button>
            <button type="button" class="btn-scope-preset ${filters.lane === 'all' && filters.timeRange === 'all' && filters.limit === 50 ? 'active' : ''}" data-lane="all" data-time="all" data-audit="all" data-limit="50">Recent 50</button>
            <button type="button" class="btn-scope-preset ${filters.lane === 'all' && filters.timeRange === 'all' && filters.limit === 0 && filters.auditState === 'all' ? 'active' : ''}" data-lane="all" data-time="all" data-audit="all" data-limit="0">Entire Mailbox</button>
          </div>
        </div>

        ${(() => {
          const auditReport = state.latestAuditReport || JSON.parse(localStorage.getItem("job_tracker_latest_reclassify_audit") || "null");
          if (!auditReport) return "";
          const formattedTime = new Date(auditReport.timestamp).toLocaleString();
          if (auditReport.changedCount > 0) {
            return `
              <div class="reclassify-audit-card has-changes">
                <div class="reclassify-audit-header">
                  <div class="reclassify-audit-title">
                    <span>Latest AI Re-Classification Audit Log</span>
                    <span class="pill pill-done" style="font-size:11px;">${auditReport.changedCount} status change${auditReport.changedCount > 1 ? "s" : ""} applied</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div class="reclassify-audit-time">
                      Audited ${auditReport.totalAudited} apps (${escapeHtml(auditReport.scopeDescription || "")}) with <strong>${escapeHtml(auditReport.modelName || "")}</strong> &mdash; ${formattedTime}
                    </div>
                    <button class="btn-dismiss-audit" style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:11px;padding:3px 8px;color:var(--muted);" title="Dismiss audit log">✕ Dismiss</button>
                  </div>
                </div>
                <div class="reclassify-changes-list">
                  ${(auditReport.changes || []).map((ch) => `
                    <div class="reclassify-change-item">
                      <div class="reclassify-change-details">
                        <div class="reclassify-change-company">${escapeHtml(ch.company || "Unknown")} <span style="font-weight:normal;color:#64748b;">— ${escapeHtml(ch.role || "General Application")}</span></div>
                        <div class="reclassify-change-reason">${escapeHtml(ch.reason || "")}</div>
                      </div>
                      <div class="reclassify-change-transition">
                        <span class="pill status-pill ${statusClass(ch.fromStatus)}">${escapeHtml(labelForStatus(ch.fromStatus))}</span>
                        <span>➔</span>
                        <span class="pill status-pill ${statusClass(ch.toStatus)}" style="font-weight:700;">${escapeHtml(labelForStatus(ch.toStatus))}</span>
                      </div>
                    </div>
                  `).join("")}
                </div>
              </div>
            `;
          } else {
            return `
              <div class="reclassify-audit-card">
                <div class="reclassify-audit-header">
                  <div class="reclassify-audit-title">
                    <span>Latest AI Re-Classification Audit Log</span>
                    <span class="pill" style="font-size:11px;background:#f0fdf4;color:#166534;border-color:#bbf7d0;">0 changes needed</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div class="reclassify-audit-time">${formattedTime}</div>
                    <button class="btn-dismiss-audit" style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:11px;padding:3px 8px;color:var(--muted);" title="Dismiss audit log">✕ Dismiss</button>
                  </div>
                </div>
                <div style="font-size:12px;color:#475569;line-height:1.5;">
                  Audited <strong>${auditReport.totalAudited}</strong> applications (${escapeHtml(auditReport.scopeDescription || "")}) using <strong>${escapeHtml(auditReport.modelName || "")}</strong>. All targeted applications were confirmed to already be in their correct pipeline stages.
                </div>
              </div>
            `;
          }
        })()}

        <!-- Dynamic Progress Bar (Active during execution) -->
        <div id="reclassifyProgressWrap" class="service-progress-wrap" style="display:none;">
          <div class="service-progress-header">
            <span id="reclassifyProgressLabel" style="color:var(--accent);">Auditing application 0 of ${targetedApps.length}...</span>
            <span id="reclassifyProgressPct" style="color:var(--text);font-weight:700;">0%</span>
          </div>
          <div class="service-progress-track">
            <div id="reclassifyProgressFill" class="service-progress-fill"></div>
          </div>
        </div>

        <div class="service-action-wrap">
          <button id="btnRunReclassify" class="btn-service-run">
            <span>Run AI Re-Classification</span>
          </button>
        </div>
      </div>

      <!-- Subgrid for Services 2, 3, 4 -->
      <div class="services-subgrid">
        <!-- Service 2: Live Gmail Synchronization -->
        <div class="service-card">
          <div class="service-card-top">
            <div class="service-icon" style="color:#0284c7;background:#e0f2fe;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            </div>
            <div class="service-details">
              <h3>Incremental Gmail Sync</h3>
              <p>Dispatches the automated Gmail ingestion workflow, fetches newly arrived candidate emails, queries the AI Judge, and saves new applications directly into Supabase.</p>
              <div class="service-meta-badges">
                <span class="pill">Serverless Proxy</span>
                <span class="pill">Auto-Merge</span>
              </div>
              <!-- Dynamic Progress Bar (Active during sync) -->
              <div id="syncProgressWrap" class="service-progress-wrap" style="display:none;">
                <div class="service-progress-header">
                  <span id="syncProgressLabel" style="color:#0284c7;">Initiating sync...</span>
                  <span id="syncProgressPct" style="color:var(--text);font-weight:700;">0%</span>
                </div>
                <div class="service-progress-track">
                  <div id="syncProgressFill" class="service-progress-fill" style="background: linear-gradient(90deg, #0284c7 0%, #38bdf8 100%);"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="service-action-wrap">
            <button id="btnRunSync" class="btn-service-run" style="background:#0284c7;border-color:#0284c7;">
              <span>Sync Mailbox</span>
            </button>
          </div>
        </div>

        <!-- Service 3: Noise & OTP Filter Cleanup -->
        <div class="service-card">
          <div class="service-card-top">
            <div class="service-icon" style="color:#475569;background:#f1f5f9;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
            </div>
            <div class="service-details">
              <h3>Noise & OTP Purge</h3>
              <p>Scans existing board lanes and automatically routes account verification codes, demographic surveys, password resets, and marketing digests into the Other Emails tab.</p>
              <div class="service-meta-badges">
                <span class="pill">Instant Scanner</span>
                <span class="pill">Zero Data Loss</span>
              </div>
              <!-- Dynamic Progress Bar (Active during purge) -->
              <div id="purgeProgressWrap" class="service-progress-wrap" style="display:none;">
                <div class="service-progress-header">
                  <span id="purgeProgressLabel" style="color:#64748b;">Scanning communications...</span>
                  <span id="purgeProgressPct" style="color:var(--text);font-weight:700;">0%</span>
                </div>
                <div class="service-progress-track">
                  <div id="purgeProgressFill" class="service-progress-fill" style="background: linear-gradient(90deg, #64748b 0%, #94a3b8 100%);"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="service-action-wrap">
            <button id="btnRunNoisePurge" class="btn-service-run" style="background:#475569;border-color:#475569;">
              <span>Run Noise Purge</span>
            </button>
          </div>
        </div>

        <!-- Service 4: Reset Supabase Manual Overrides -->
        <div class="service-card">
          <div class="service-card-top">
            <div class="service-icon" style="color:#b45309;background:#fef3c7;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </div>
            <div class="service-details">
              <h3>Reset Supabase Manual Overrides</h3>
              <p>Resets all manual moves, 'Mark Done', and 'Ignored' overrides directly in Supabase, restoring applications back to authoritative AI stages.</p>
              <div class="service-meta-badges">
                <span class="pill">Supabase Cloud Sync</span>
                <span class="pill">Real-Time Refresh</span>
              </div>
              <!-- Dynamic Progress Bar (Active during reset) -->
              <div id="resetProgressWrap" class="service-progress-wrap" style="display:none;">
                <div class="service-progress-header">
                  <span id="resetProgressLabel" style="color:#b45309;">Resetting overrides in Supabase...</span>
                  <span id="resetProgressPct" style="color:var(--text);font-weight:700;">0%</span>
                </div>
                <div class="service-progress-track">
                  <div id="resetProgressFill" class="service-progress-fill" style="background: linear-gradient(90deg, #b45309 0%, #f59e0b 100%);"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="service-action-wrap">
            <button id="btnResetOverrides" class="btn-service-run" style="background:#b45309;border-color:#b45309;">
              <span>Reset Overrides</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Live Service Execution Console -->
    <div id="serviceConsole" class="service-console-card">
      <div class="console-header">Live Service Console Output</div>
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
    const prefix = type === "error" ? "[ERROR] " : type === "success" ? "[OK] " : "[INFO] ";
    const time = new Date().toLocaleTimeString();
    consoleOut.innerHTML += `<div style="margin-bottom:4px;">[${time}] ${prefix}${escapeHtml(text)}</div>`;
    consoleCard.scrollTop = consoleCard.scrollHeight;
  };

  // OpenRouter API Key Handlers
  const btnSaveOrKey = byId("btnSaveOrKey");
  const orKeyInput = byId("openRouterKeyInput");
  if (btnSaveOrKey && orKeyInput) {
    btnSaveOrKey.addEventListener("click", () => {
      const val = orKeyInput.value.trim();
      if (val && !val.includes("••")) {
        setOpenRouterKey(val);
        appendConsole("OpenRouter API Key saved in browser. Live AI Re-Classification will use this key.", "success");
        renderServices(applications);
      } else if (!val) {
        appendConsole("Please enter a valid OpenRouter API Key (sk-or-v1-...).", "error");
      }
    });
  }

  const btnClearOrKey = byId("btnClearOrKey");
  if (btnClearOrKey) {
    btnClearOrKey.addEventListener("click", () => {
      setOpenRouterKey("");
      appendConsole("OpenRouter API Key cleared from browser. Reverting to Vercel environment key.", "info");
      renderServices(applications);
    });
  }

  // Multi-Filter Scope Event Handlers
  const filterLaneSelect = byId("reclassifyFilterLane");
  const filterTimeSelect = byId("reclassifyFilterTime");
  const filterAuditSelect = byId("reclassifyFilterAudit");
  const filterLimitSelect = byId("reclassifyFilterLimit");

  function onFilterChange() {
    state.reclassifyFilters = {
      lane: filterLaneSelect ? filterLaneSelect.value : "all",
      timeRange: filterTimeSelect ? filterTimeSelect.value : "all",
      auditState: filterAuditSelect ? filterAuditSelect.value : "all",
      limit: filterLimitSelect ? parseInt(filterLimitSelect.value) || 0 : 0
    };
    renderServices(applications);
  }

  if (filterLaneSelect) filterLaneSelect.addEventListener("change", onFilterChange);
  if (filterTimeSelect) filterTimeSelect.addEventListener("change", onFilterChange);
  if (filterAuditSelect) filterAuditSelect.addEventListener("change", onFilterChange);
  if (filterLimitSelect) filterLimitSelect.addEventListener("change", onFilterChange);

  // Quick Multi-Filter Preset Buttons
  document.querySelectorAll(".btn-scope-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.reclassifyFilters = {
        lane: btn.getAttribute("data-lane") || "all",
        timeRange: btn.getAttribute("data-time") || "all",
        auditState: btn.getAttribute("data-audit") || "all",
        limit: parseInt(btn.getAttribute("data-limit")) || 0
      };
      renderServices(applications);
    });
  });

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

  // 1. Run AI Re-Classification with Real OpenRouter API Execution & Live Progress Bar
  const btnReclassify = byId("btnRunReclassify");
  if (btnReclassify) {
    btnReclassify.addEventListener("click", async () => {
      const activeModel = AI_MODELS.find((m) => m.id === getSelectedModel()) || AI_MODELS[0];
      const targetApps = getTargetApplicationsForReclassify(state.data.applications);
      const total = targetApps.length;
      const progressWrap = byId("reclassifyProgressWrap");
      const progressLabel = byId("reclassifyProgressLabel");
      const progressPct = byId("reclassifyProgressPct");
      const progressFill = byId("reclassifyProgressFill");

      if (total === 0) {
        appendConsole("No applications match the selected scope filter criteria.", "error");
        return;
      }

      btnReclassify.disabled = true;
      btnReclassify.innerHTML = "<span>AI Reclassifying...</span>";
      if (progressWrap) progressWrap.style.display = "flex";

      const scopeLabel = getReclassifyScopeDescription(state.reclassifyFilters);

      appendConsole(`Starting Live AI Mailbox Re-Classification with ${activeModel.name}...`);
      appendConsole(`Scope: ${scopeLabel} (${total} targeted apps) | Connecting to OpenRouter API (model: ${activeModel.id})...`);

      try {
        const chunkSize = 25; // 25 applications per LLM request
        const CONCURRENCY = 6; // 6 parallel streams simultaneously for blazing speed
        let reclassifiedCount = 0;
        let totalTokensUsed = 0;
        let completedBatches = 0;
        let completedApps = 0;
        const changesMade = [];

        const customOrKey = getOpenRouterKey();
        const reqHeaders = { "Content-Type": "application/json" };
        if (customOrKey) {
          reqHeaders["Authorization"] = `Bearer ${customOrKey}`;
        }

        // Build batch list from targeted applications
        const batches = [];
        for (let i = 0; i < total; i += chunkSize) {
          batches.push({
            index: Math.floor(i / chunkSize) + 1,
            startIndex: i,
            endIndex: Math.min(i + chunkSize, total),
            chunk: targetApps.slice(i, Math.min(i + chunkSize, total))
          });
        }
        const totalBatches = batches.length;

        appendConsole(`Launching ${Math.min(CONCURRENCY, totalBatches)} parallel worker streams across ${totalBatches} batches (${total} targeted apps)...`);

        // Worker processor for each batch
        async function processBatch(batch) {
          const response = await fetch("/api/reclassify", {
            method: "POST",
            headers: reqHeaders,
            body: JSON.stringify({
              applications: batch.chunk,
              model: activeModel.id
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${response.status} from /api/reclassify`);
          }

          const resData = await response.json();
          const results = resData.results || [];
          const batchTokens = resData.usage?.total_tokens || 0;
          totalTokensUsed += batchTokens;

          const now = new Date().toISOString();
          const resultMap = new Map(results.map((r) => [r.id, r]));

          for (const app of batch.chunk) {
            const aiRes = resultMap.get(app.id);
            if (aiRes) {
              if (aiRes.status && ALLOWED_STATUSES.has(aiRes.status)) {
                if (aiRes.status !== app.status) {
                  reclassifiedCount++;
                  changesMade.push({
                    id: app.id,
                    company: aiRes.company || app.company,
                    role: aiRes.role || app.role,
                    fromStatus: app.status,
                    toStatus: aiRes.status,
                    reason: aiRes.reason || `Reclassified from ${labelForStatus(app.status)} to ${labelForStatus(aiRes.status)}`
                  });
                  app.status = aiRes.status;
                  app.effectiveStatus = aiRes.status;
                  // Clear stale manual overrides so AI reclassification takes full effect cleanly
                  app.isManualOverride = false;
                  app.manualAction = null;
                  app.manualChangedAt = null;
                }
              }
              if (aiRes.company && aiRes.company !== "Unknown" && !aiRes.company.includes("Workday")) {
                app.company = aiRes.company;
              }
              if (aiRes.role && aiRes.role !== "Unknown role") {
                app.role = aiRes.role;
              }
              app.confidence = aiRes.confidence || "high";
              app.aiDecision = aiRes.reason || `Classified as ${aiRes.status}`;
            } else {
              app.aiDecision = `Audited with ${activeModel.name}: Retained in ${labelForStatus(app.status)}`;
            }
            app.aiModel = activeModel.name;
            app.aiClassifiedAt = now;
            app.updatedAt = now;
          }

          completedBatches++;
          completedApps += batch.chunk.length;
          const pct = Math.round((completedApps / total) * 100);

          if (progressLabel) progressLabel.textContent = `Parallel LLM Stream: Completed ${completedBatches}/${totalBatches} batches (${completedApps}/${total} apps)...`;
          if (progressPct) progressPct.textContent = `${pct}%`;
          if (progressFill) progressFill.style.width = `${pct}%`;

          appendConsole(`[Parallel Stream] Batch ${batch.index}/${totalBatches} done: ${results.length} classified (~${batchTokens} tokens).`);
        }

        // Run worker pool
        let nextBatchIdx = 0;
        async function runWorker(workerId) {
          while (nextBatchIdx < batches.length) {
            const batchToProcess = batches[nextBatchIdx++];
            await processBatch(batchToProcess);
          }
        }

        const workers = Array.from(
          { length: Math.min(CONCURRENCY, batches.length) },
          (_, id) => runWorker(id + 1)
        );

        await Promise.all(workers);

        if (progressLabel) progressLabel.textContent = `Completed all ${total} applications! Syncing to Supabase...`;
        if (progressFill) progressFill.style.width = "100%";
        if (progressPct) progressPct.textContent = "100%";

        const auditReport = {
          timestamp: new Date().toISOString(),
          modelName: activeModel.name,
          modelId: activeModel.id,
          scopeDescription: scopeLabel,
          totalAudited: total,
          changedCount: changesMade.length,
          changes: changesMade
        };
        localStorage.setItem("job_tracker_latest_reclassify_audit", JSON.stringify(auditReport));
        state.latestAuditReport = auditReport;

        appendConsole(`Parallel OpenRouter AI Execution Complete! Processed ${total} targeted items (${reclassifiedCount} adjustments, ~${totalTokensUsed} tokens).`, "success");
        appendConsole(`Persisting ${total} updated application rows to Supabase...`, "info");

        state.data.updatedAt = new Date().toISOString();
        await syncAllAppsToSupabase(targetApps, `Live AI Re-Classification (${activeModel.name})`);

        state.data.applications = deduplicateAndConsolidateApplications(state.data.applications);
        appendConsole("Supabase cloud database updated! Re-rendering dashboard with AI tags...", "success");
        render();
        btnReclassify.innerHTML = "<span>Re-Classification Done!</span>";
        setTimeout(() => {
          btnReclassify.innerHTML = "<span>Run AI Re-Classification</span>";
          btnReclassify.disabled = false;
          if (progressWrap) progressWrap.style.display = "none";
        }, 3000);
      } catch (err) {
        appendConsole(`OpenRouter Re-Classification Error: ${err.message}`, "error");
        if (err.message.includes("OPENROUTER_API_KEY")) {
          appendConsole("Tip: Add OPENROUTER_API_KEY to your Vercel Project Settings → Environment Variables and redeploy.", "error");
        }
        btnReclassify.innerHTML = "<span>Failed</span>";
        setTimeout(() => {
          btnReclassify.innerHTML = "<span>Run AI Re-Classification</span>";
          btnReclassify.disabled = false;
          if (progressWrap) progressWrap.style.display = "none";
        }, 3000);
      }
    });
  }

  // 2. Sync New Messages — triggers GitHub Actions Gmail sync with live progress bar, then reloads Supabase
  const btnSync = byId("btnRunSync");
  if (btnSync) {
    btnSync.addEventListener("click", async () => {
      const progressWrap = byId("syncProgressWrap");
      const progressLabel = byId("syncProgressLabel");
      const progressPct = byId("syncProgressPct");
      const progressFill = byId("syncProgressFill");

      btnSync.disabled = true;
      btnSync.innerHTML = "<span>Syncing Gmail...</span>";
      if (progressWrap) progressWrap.style.display = "flex";

      const onProgress = (label, pct) => {
        if (progressLabel) progressLabel.textContent = label;
        if (progressPct) progressPct.textContent = `${pct}%`;
        if (progressFill) progressFill.style.width = `${pct}%`;
      };

      try {
        const result = await triggerGmailSync(appendConsole, onProgress);
        appendConsole("Reloading latest data from Supabase Cloud Database...");
        onProgress("Loading live data from Supabase...", 95);
        await loadData();
        onProgress("Sync complete!", 100);

        if (result.success) {
          appendConsole("Gmail sync complete! New emails ingested and dashboard refreshed.", "success");
          btnSync.innerHTML = "<span>Synced!</span>";
        } else {
          appendConsole("Workflow execution finished. Supabase dataset refreshed.", "error");
          btnSync.innerHTML = "<span>Refreshed</span>";
        }
      } catch (err) {
        appendConsole(`Sync error: ${err.message}`, "error");
        btnSync.innerHTML = "<span>Failed</span>";
      }

      setTimeout(() => {
        btnSync.innerHTML = "<span>Sync Mailbox</span>";
        btnSync.disabled = false;
        if (progressWrap) progressWrap.style.display = "none";
      }, 3000);
    });
  }

  // 3. Run Noise Purge with live progress bar
  const btnPurge = byId("btnRunNoisePurge");
  if (btnPurge) {
    btnPurge.addEventListener("click", async () => {
      const progressWrap = byId("purgeProgressWrap");
      const progressLabel = byId("purgeProgressLabel");
      const progressPct = byId("purgeProgressPct");
      const progressFill = byId("purgeProgressFill");

      btnPurge.disabled = true;
      btnPurge.innerHTML = "<span>Purging Noise...</span>";
      if (progressWrap) progressWrap.style.display = "flex";

      appendConsole("Executing Noise, OTP & Survey Purge across mailbox...");
      const total = state.data.applications.length;
      const chunkSize = 50;
      let purged = 0;
      const purgednow = new Date().toISOString();

      for (let i = 0; i < total; i += chunkSize) {
        const end = Math.min(i + chunkSize, total);
        const pct = Math.round((end / total) * 100);

        if (progressLabel) progressLabel.textContent = `Scanning apps ${i + 1}–${end} of ${total}...`;
        if (progressPct) progressPct.textContent = `${pct}%`;
        if (progressFill) progressFill.style.width = `${pct}%`;

        for (let j = i; j < end; j++) {
          const app = state.data.applications[j];
          const text = `${app.latestSubject || ""} ${app.latestFrom || ""}`.toLowerCase();
          if (/otp|security code|verify your|verification code|password|demographic survey|eeo survey|voluntary eeo|google cloud/i.test(text)) {
            if (app.status !== "not_related") {
              app.status = "not_related";
              purged++;
            }
            app.aiDecision = "Noise Filter: Verification code / OTP / survey / digest purge";
            app.aiModel = "Rule Engine (Noise Purge v2)";
            app.aiClassifiedAt = purgednow;
            app.updatedAt = purgednow;
          }
        }
        await new Promise((r) => setTimeout(r, 40));
      }

      if (progressLabel) progressLabel.textContent = `Purged ${purged} noise items! Syncing to Supabase...`;
      if (progressPct) progressPct.textContent = "100%";
      if (progressFill) progressFill.style.width = "100%";

      appendConsole(`Purge identified ${purged} noise items. Syncing to Supabase...`, "info");
      state.data.updatedAt = purgednow;
      await syncAllAppsToSupabase(state.data.applications, "Noise Purge");
      appendConsole(`Purge complete: ${purged} noise items routed to Other Emails tab and saved to Supabase.`, "success");
      render();

      btnPurge.innerHTML = "<span>Purge Done!</span>";
      setTimeout(() => {
        btnPurge.innerHTML = "<span>Run Noise Purge</span>";
        btnPurge.disabled = false;
        if (progressWrap) progressWrap.style.display = "none";
      }, 3000);
    });
  }

  // 4. Reset Supabase Manual Overrides with live progress bar
  const btnReset = byId("btnResetOverrides");
  if (btnReset) {
    btnReset.addEventListener("click", async () => {
      if (confirm("Reset all manual moves, 'Mark Done', and 'Ignored' overrides directly in Supabase back to default AI stages?")) {
        const progressWrap = byId("resetProgressWrap");
        const progressLabel = byId("resetProgressLabel");
        const progressPct = byId("resetProgressPct");
        const progressFill = byId("resetProgressFill");

        btnReset.disabled = true;
        if (progressWrap) progressWrap.style.display = "flex";
        if (progressLabel) progressLabel.textContent = "Connecting to Supabase...";
        if (progressPct) progressPct.textContent = "25%";
        if (progressFill) progressFill.style.width = "25%";

        try {
          const sbUrl = getSupabaseUrl();
          const sbKey = getSupabaseKey();
          if (sbUrl && sbKey) {
            if (progressLabel) progressLabel.textContent = "Resetting override records in Supabase...";
            if (progressPct) progressPct.textContent = "50%";
            if (progressFill) progressFill.style.width = "50%";

            await fetch(`${sbUrl}/rest/v1/applications?is_manual_override=eq.true`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                apikey: sbKey,
                Authorization: `Bearer ${sbKey}`,
                Prefer: "return=minimal"
              },
              body: JSON.stringify({
                is_manual_override: false,
                manual_action: null,
                manual_changed_at: null
              })
            });
          }

          if (progressLabel) progressLabel.textContent = "Restoring default AI pipeline stages...";
          if (progressPct) progressPct.textContent = "85%";
          if (progressFill) progressFill.style.width = "85%";

          // Reset local in-memory application override state
          (state.data?.applications || []).forEach((app) => {
            if (app.isManualOverride) {
              app.isManualOverride = false;
              app.manualAction = null;
              app.manualChangedAt = null;
            }
          });

          // Clean legacy browser storage if any existed
          try {
            localStorage.removeItem("job_tracker_done_apps");
            localStorage.removeItem("job_tracker_ignored_apps");
          } catch {}

          if (progressLabel) progressLabel.textContent = "All overrides reset in Supabase!";
          if (progressPct) progressPct.textContent = "100%";
          if (progressFill) progressFill.style.width = "100%";

          appendConsole("Successfully reset all manual overrides directly in Supabase.", "success");
          render();

          btnReset.innerHTML = "<span>Overrides Reset!</span>";
        } catch (err) {
          appendConsole(`Failed to reset Supabase overrides: ${err.message}`, "error");
        } finally {
          setTimeout(() => {
            btnReset.innerHTML = "<span>Reset Overrides</span>";
            btnReset.disabled = false;
            if (progressWrap) progressWrap.style.display = "none";
          }, 2000);
        }
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

let searchDebounceTimer = null;
byId("searchInput").addEventListener("input", (event) => {
  clearTimeout(searchDebounceTimer);
  const val = event.target.value;
  searchDebounceTimer = setTimeout(() => {
    state.query = val;
    state.pageApps = 1;
    state.pageCompanies = 1;
    state.pageOther = 1;
    render();
  }, 80);
});

byId("refreshButton").addEventListener("click", async () => {
  const btn = byId("refreshButton");
  const origText = btn.textContent;
  btn.textContent = "Refreshing...";
  btn.disabled = true;
  try {
    await loadData();
    btn.textContent = "Updated";
    setTimeout(() => {
      btn.textContent = origText;
      btn.disabled = false;
    }, 1200);
  } catch (err) {
    btn.textContent = "Failed";
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

// Initialize global event delegation for card buttons and lane select dropdowns
initCardActionDelegation();

loadData().catch((error) => {
  byId("syncStatus").textContent = error.message;
});
