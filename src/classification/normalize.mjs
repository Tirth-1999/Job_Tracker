const BAD_ROLE_RE = /^(general application|your application|your interest|this role|using linkedin)$/i;
const ARTIFACT_ROLE_RE = /more success view similar jobs|candidate account|job alert|view similar jobs|you from jobright|after careful|further consideration|thank you|&nbsp/i;
const BAD_EXTRACTED_ROLE_RE = /^(employment|joining|joining our|job|jobs|role|position|opening|application|following reasons|position listed below|our latest opportunities|job opportunity referenced above|joining us|data|software|engineering)$/i;
const JOB_ALERT_CONTEXT_RE = /job alert|job recommendations|new job alerts|daily zen|personalized job matches|jobs you might like|similar jobs|view similar jobs|new jobs for you|is hiring now|apply now|unsubscribe/i;
const NON_APPLICATION_SUBJECT_RE = /new roles|new job opportunities|career opportunities|trial is now active|sign-in|templates|terms of service|privacy policy/i;
const APPLICATION_CONTEXT_RE = /application|applied|candidate|recruit|interview|offer|position|role|job title|thank you for your interest|we received|has been received|resume/i;
const ROLE_STOP_RE = /\b(?:and follow up|and we are|and our recruiting|and for your application|and for submitting|we will|we have|we know|we received|we appreciate|we appreci|we apprecia|unfortunately|after careful|thank you|thanks for|if your|if you|our team|a member|will review|has been received|was received|is currently|please|click|apply now|view job|similar jobs|more success)\b/i;

const ROLE_PATTERNS = [
  /\bresume for the following position\(s\):\s*([A-Za-z0-9][A-Za-z0-9/&+.,'() -]{2,90})/i,
  /\bapplication for(?: the)?\s+([A-Za-z0-9][A-Za-z0-9/&+.,'() -]{2,90}?)(?:\s+(?:position|role|opening|job)\b|\s+at\b|\s+with\b|[.!?]|$)/i,
  /\bapplied for(?: the)?\s+([A-Za-z0-9][A-Za-z0-9/&+.,'() -]{2,90}?)(?:\s+(?:position|role|opening|job)\b|\s+at\b|\s+with\b|[.!?]|$)/i,
  /\bapplied to(?: the)?\s+([A-Za-z0-9][A-Za-z0-9/&+.,'() -]{2,90}?)(?:\s+(?:position|role|opening|job)\b|\s+at\b|\s+with\b|[.!?]|$)/i,
  /\bapplying to(?: the)?\s+([A-Za-z0-9][A-Za-z0-9/&+.,'() -]{2,90}?)(?:\s+(?:position|role|opening|job)\b|\s+at\b|\s+with\b|[.!?]|$)/i,
  /\binterest in(?: the)?\s+([A-Za-z0-9][A-Za-z0-9/&+.,'() -]{2,90}?)(?:\s+(?:position|role|opening|job)\b|\s+at\b|\s+with\b|[.!?]|$)/i,
  /\bfor(?: the)?\s+([A-Za-z0-9][A-Za-z0-9/&+.,'() -]{2,90}?)(?:\s+(?:position|role|opening|job)\b)\s+(?:at|with)\b/i,
  /\b(?:job title|title|role|position)\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9/&+.,'() -]{2,90})/i,
  /\bJob Application:\s*[^-\n]+[-–]\s*(?:R[0-9]+\s+)?([A-Za-z0-9/&+.,'() -]{4,90}?)(?:\s+on\s+[0-9]|\s*[-–(.,\n]|$)/i
];

const KNOWN_ROLE_RE = /\b(senior|sr\.?|lead|principal|staff|associate|junior|jr\.?|mid-level|mid level)?\s*(data engineer|analytics engineer|data analyst|business analyst|business systems analyst|business intelligence analyst|software engineer|forward deployed engineer|forward deployed ai engineer|ai engineer|machine learning engineer|ml engineer|data scientist|solutions architect|cloud data solution architect|cloud data\s*(?:&|and)?\s*ai architect|data architect|devops engineer|qa engineer|automation test engineer|systems analyst|platform engineer|data platform engineer|data infrastructure engineer|database engineer|data operations engineer|databricks engineer|power bi developer|etl developer|bi developer|product analyst)\b/i;

export function isBadRole(role, company = "") {
  const value = String(role || "").trim();
  if (!value) return true;
  if (BAD_ROLE_RE.test(value)) return true;
  if (/^(unknown|applying|sr|jr|you)$/i.test(value)) return true;
  if (ARTIFACT_ROLE_RE.test(value)) return true;
  if (/^the\s+/i.test(value)) return true;
  if (value.length > 75) return true;
  if (normalizeKey(value) && normalizeKey(value) === normalizeKey(company)) return true;
  return false;
}

export function improveRole({ currentRole = "", company = "", subject = "", body = "", from = "" } = {}) {
  if (!isBadRole(currentRole, company)) return null;
  const specialRole = inferSpecialRole({ company, subject, body, from });
  if (specialRole) return specialRole;
  const context = isApplicationContext({ subject, body, from });
  if (context.blockRoleRepair) return null;

  const candidates = [
    ...extractSubjectCandidates(subject),
    ...extractPatternCandidates(subject),
    ...extractPatternCandidates(body),
    currentRole
  ];
  if (context.allowKnownRoleFallback) {
    candidates.push(...extractKnownRoleCandidates(`${subject}\n${body}`));
  }

  for (const candidate of candidates) {
    const cleaned = cleanRole(candidate, company);
    if (cleaned && !isBadRole(cleaned, company)) return cleaned;
  }

  const fallback = cleanRole(currentRole, company);
  if (fallback && !isBadRole(fallback, company)) return fallback;
  return null;
}

export function cleanRole(role, company = "") {
  let cleaned = decodeEntities(String(role || ""))
    .replace(/\bSr\.\s*/gi, "Senior ")
    .replace(/\bJr\.\s*/gi, "Junior ")
    .replace(/\s+/g, " ")
    .replace(/^[-–:|,.\s]+/, "")
    .replace(/[-–:|,.\s]+$/, "")
    .replace(/^(the|a|an|our|current|open|of)\s+/i, "")
    .replace(/^.*?\btaking the time to (?:submit )?(?:apply|applying) (?:for|to) (?:our|the)?\s*/i, "")
    .replace(/^.*?\b(?:submit|submitted|send|sent) your application for (?:our|the)?\s*/i, "")
    .replace(/^(your interest in|your interest for|your application for|your application to|application for|application to|applying for|applying to|interest in|position of|role of|employment for)\s+/i, "")
    .replace(/^(?:the\s+)?position (?:of|listed below)\s+/i, "")
    .trim();

  if (ROLE_STOP_RE.test(cleaned) && cleaned.search(ROLE_STOP_RE) <= 3) return "";
  const stopMatch = cleaned.search(ROLE_STOP_RE);
  if (stopMatch > 3) cleaned = cleaned.slice(0, stopMatch).trim();

  cleaned = cleaned
    .replace(/\s+(?:at|with)\s+[A-Z][A-Za-z0-9&.' -]{2,60}$/i, "")
    .replace(/\s*\((?:Open|Hybrid|Remote|Onsite)\)\s*$/i, "")
    .replace(/\s*\([^)]+\)\s*[-–]?\s*(?:R|REQ|JR)[A-Z0-9-]+$/i, "")
    .replace(/\s*[-–]\s*\([A-Za-z][A-Za-z0-9, /.'-]{2,60}\)\s*$/i, "")
    .replace(/\s*,?\s*(?:Remote|Hybrid|Onsite)\s*$/i, "")
    .replace(/\s*[-–]\s*(?:Remote|Hybrid|Onsite)\s*$/i, "")
    .replace(/\s*[-–]\s*(?:NY|CA|TX|NJ|IL|WA|MA|FL|GA|NC|VA|DC|PA|MI|OH|UT)\s*$/i, "")
    .replace(/\s*,?\s*(?:Req|Job ID|Requisition)\s*#?:?\s*[A-Z0-9-]+$/i, "")
    .replace(/\s*\(\s*(?:REQ|JR|RQ|R)?[A-Z0-9-]+\s*\)\s*$/i, "")
    .replace(/\s*[-–](?:REQ|JR|RQ|R)[A-Z0-9-]+\s*$/i, "")
    .replace(/\s*\(\s*$/i, "")
    .replace(/\s+location\s*$/i, "")
    .replace(/\s+opportunity\s*$/i, "")
    .replace(/\s+(?:role|position)\s*\.?$/i, "")
    .replace(/\s+is on its way\s*$/i, "")
    .replace(/\s+\d{2,8}$/i, "")
    .replace(/^(?:REQ|JR|RQ|R)\d+\s+/i, "")
    .replace(/\bSenior,\s+/i, "Senior ")
    .replace(/\s+(?:and|or)\s*$/i, "")
    .replace(/^(the|a|an|our|current|open|of)\s+/i, "")
    .replace(/[-–:|,.\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) return "";
  if (BAD_EXTRACTED_ROLE_RE.test(cleaned)) return "";
  if (/^joining\b/i.test(cleaned)) return "";
  if (!KNOWN_ROLE_RE.test(cleaned)) return "";
  if (normalizeKey(cleaned) === normalizeKey(company)) return "";
  return titleCaseRole(cleaned).slice(0, 90);
}

export function inferSpecialRole({ company = "", subject = "", body = "", from = "" } = {}) {
  const text = `${company || ""} ${subject || ""} ${body || ""} ${from || ""}`;
  if (!/\bATC\b|atc\.xyz|atcllc|american technology consulting/i.test(text)) return "";
  if (/offer letter.*\bBA\b|details required for offer rollout|business analyst|final interview/i.test(text)) {
    return "Business Analyst";
  }
  if (/ATC-\s*VIDEO|video screening|shakthi@atc\.xyz|data engineering|senior data engineer|sr\.?\s*data engineer/i.test(text)) {
    return "Senior Data Engineer";
  }
  return "";
}

function extractSubjectCandidates(subject) {
  const value = decodeEntities(String(subject || ""));
  const candidates = [];
  const separators = [
    /\b(?:for|as)\s+(?:the\s+)?([A-Za-z0-9][A-Za-z0-9/&+.,'() -]{2,90}?)(?:\s+(?:role|position|opening|job)\b|$)/i,
    /\b(?:role|position|job)\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9/&+.,'() -]{2,90})/i
  ];
  for (const pattern of separators) {
    const match = value.match(pattern);
    if (match?.[1]) candidates.push(match[1]);
  }
  return candidates;
}

function extractPatternCandidates(text) {
  const value = decodeEntities(String(text || ""));
  const candidates = [];
  for (const pattern of ROLE_PATTERNS) {
    const match = value.match(pattern);
    if (match?.[1]) candidates.push(match[1]);
  }
  return candidates;
}

function extractKnownRoleCandidates(text) {
  const candidates = [];
  const value = decodeEntities(String(text || ""));
  for (const match of value.matchAll(new RegExp(KNOWN_ROLE_RE, "gi"))) {
    if (match?.[0]) candidates.push(match[0]);
  }
  return candidates;
}

function isApplicationContext({ subject = "", body = "", from = "" } = {}) {
  const subjectValue = decodeEntities(String(subject || ""));
  const bodyValue = decodeEntities(String(body || ""));
  const fromValue = decodeEntities(String(from || ""));
  const haystack = `${subjectValue}\n${bodyValue}\n${fromValue}`;
  const alertSubject = JOB_ALERT_CONTEXT_RE.test(subjectValue) && !APPLICATION_CONTEXT_RE.test(subjectValue);
  const nonApplicationSubject = NON_APPLICATION_SUBJECT_RE.test(subjectValue) && !/application|applied|received|status/i.test(subjectValue);
  const applicationSignal = APPLICATION_CONTEXT_RE.test(haystack);
  const jobBoardSender = /ziprecruiter|jobright|zensearch|linkedin job alerts/i.test(fromValue);
  return {
    blockRoleRepair: alertSubject || nonApplicationSubject || jobBoardSender,
    allowKnownRoleFallback: applicationSignal && !alertSubject && !nonApplicationSubject && !jobBoardSender
  };
}

function titleCaseRole(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^(AI|ML|BI|ETL|SQL|AWS|GCP|API|II|III|IV)$/i.test(word)) return word.toUpperCase();
      if (/^devops$/i.test(word)) return "DevOps";
      if (/^[A-Z0-9/&+.-]{2,}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ")
    .replace(/\bSr\b/g, "Senior")
    .replace(/\bJr\b/g, "Junior");
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&#x27;/gi, "'");
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
