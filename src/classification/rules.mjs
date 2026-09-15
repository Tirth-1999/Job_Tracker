export const ALLOWED_STATUSES = new Set([
  "applied",
  "reply_needed",
  "interviewed",
  "offered",
  "rejected",
  "not_related"
]);

const EEO_RE = /self.?identification|voluntary self.?id|equal employment opportunity|eeo (survey|form|questionnaire|information)|ofccp|disability self.?id|veteran self.?id|demographic (survey|form|information)|race and ethnicity|ethnic(ity)? (survey|form)|gender (survey|form)|diversity questionnaire/i;

const SECURITY_RE = /\b(otp|one-time password|verification code|security code|2fa|two-factor|reset your password|sign-in code|login code|verify your email|verify your account|candidate account verification)\b/i;

const JOB_ALERT_RE = /\b(job alert|jobs you might like|recommended jobs|job recommendations|new jobs|latest .* jobs|similar jobs|view similar jobs|opportunities you may be interested|apply faster with autofill|job matches for|curated for you|unsubscribe from job alerts?)\b/i;

const JOB_ALERT_SENDER_RE = /jobalerts?|jobright|ziprecruiter|trueup|seek recommendations|builtin|alerts\.jobot|jobs@alerts|noreply@s\.seek/i;

const PLATFORM_SENDER_RE = /jobs-noreply@linkedin\.com|jobalerts-noreply@linkedin\.com|noreply@linkedin\.com|no-?reply@linkedin\.com|notifications@linkedin\.com|@myworkday\.com|@otp\.workday\.com|@greenhouse-mail\.io|no-?reply@us\.greenhouse-mail\.io|no-?reply@hire\.lever\.co|@lever\.co|no-?reply@ashbyhq\.com|@smartrecruiters\.com|no-?reply@smartrecruiters\.com|@icims\.com|@bamboohr\.com|@workablemail\.com|@applytojob\.com|@comeet-notifications\.com|noreply@indeed\.com|no-?reply@indeed\.com|@dover\.com/i;

const LINKEDIN_APPLICATION_RECEIPT_RE = /your application was sent to|you applied via easy apply|application confirmation|applied on [a-z]+ \d{1,2},? \d{4}/i;

const APPLICATION_RECEIPT_RE = /your application (was sent|has been submitted|was submitted|has been received|was received)|application (received|submitted|confirmed|confirmation)|we received your application|thanks? for applying|thank you for applying|thank you for your application|you.ve applied to|application sent to/i;

const ASSESSMENT_RE = /hackerrank|testgorilla|codility|codesignal|coderbyte|hirevue|outmatch|harver|glider|pymetrics|wonderlic|online assessment|coding challenge|technical assessment|take-home|skill test|online test|assessment invitation|participate in an assessment|begin assessment|take the assessment/i;

const INTERVIEW_RE = /interview confirmation|interview scheduled|technical screen|phone screen|final round|technical interview|panel interview|video interview|hiring manager screen|zoom interview|google meet|microsoft teams/i;

const HUMAN_REPLY_RE = /please reply|please respond|reply with|send me your|share your (resume|availability|phone|rate)|are you available|available to connect|schedule a call|when are you free|what is your availability|expected compensation|work authorization|visa status|earliest start/i;

const AUTOMATED_SENDER_RE = /noreply|no-reply|donotreply|do-not-reply|notifications?@|mailer@|postmaster@|bounce@|automailer@|jobs-noreply|jobalerts-noreply|@otp\.|@ats\./i;

const REJECTION_RE = /won.t be moving forward|will not be moving forward|decided not to move forward|decided not to proceed|will not be proceeding|not proceeding with your|will not move you forward|won.t be able to continue with your candidacy|not able to continue with your candidacy|decided to move forward with (candidates|other)|move forward with other candidates whose|moving forward with other candidates|moving forward with another candidate|pursue other candidates|pursuing other candidates|pursuing other applicants|selected other candidates|selected another candidate|chosen another candidate|chosen to move forward with other|not selected for this (role|position|opportunity)|not been selected|was not selected|ineligible for the role|deemed you (as )?ineligible|decided to (pass|decline)|not a (match|fit) for this (role|position)|not the right fit|not a good fit at this time|qualifications more closely align|experience is more closely aligned|experience more closely aligns|more closely align with the requirements|other candidates whose (skills|experience|qualifications)|position has been filled|position (is|has been|was) (filled|closed|cancelled|canceled)|no longer under consideration|unable to offer you (a |the )?position|unable to offer you an interview|unable to extend an offer|cannot offer you an interview|have decided not to move forward|will not be progressing your|not be progressing your application|decided not to move your application|we have not selected|you have not been selected|we are unable to move forward|after careful (review|consideration).{0,120}(decided|won.t|will not|regret|sorry|unable|not|moving)|regret to inform|decision was not made lightly|credentials of other candidates|wish you (all )?the best in your (job )?search|best of luck in your (job )?search/i;

const CONDITIONAL_REJECTION_RE = /if (you are|you were|we are) not (selected|able).{0,150}(please|check|visit|keep|our|feel|thank)|if we are unable to offer.{0,100}(encourage|invite|visit|thank)|we will (only )?(be )?in touch (only )?if your qualifications|we will reach out (to you )?if your (skills|qualifications|experience|background)|if your (qualifications|skills|experience|background) (match|align|fit)|only if your qualifications|will be in touch if your|will contact you if (your|we)|reach out if (your|we|there)|it is likely that we have decided|if you (do not hear|have not heard) from us.{0,180}(likely|means|decided|moved|pursue|filled)|if the position is no longer listed.{0,200}(decided|pursue|filled|canceled)/i;

const OFFER_RE = /pleased to offer|extend an offer|offer letter|employment offer|congratulations on your offer|formal offer|offer of employment/i;

export function classifyDeterministic({ from = "", subject = "", body = "" } = {}) {
  const fromLower = String(from).toLowerCase();
  const subjectText = String(subject);
  const text = `${subjectText} ${body || ""}`.replace(/\s+/g, " ").trim();
  const headerText = `${from} ${subjectText}`;

  if (SECURITY_RE.test(`${subjectText} ${from}`)) {
    return result("not_related", "high", "security/account verification noise", "security");
  }

  if (EEO_RE.test(text)) {
    return result("not_related", "high", "EEO/self-ID compliance form", "eeo");
  }

  if ((JOB_ALERT_SENDER_RE.test(headerText) || JOB_ALERT_RE.test(subjectText)) && !APPLICATION_RECEIPT_RE.test(subjectText)) {
    return result("not_related", "high", "job alert/newsletter/recommendation digest", "job_alert");
  }

  if (/linkedin\.com/i.test(fromLower) && LINKEDIN_APPLICATION_RECEIPT_RE.test(text)) {
    return result("applied", "high", "LinkedIn application receipt", "linkedin_receipt");
  }

  if (PLATFORM_SENDER_RE.test(fromLower) && APPLICATION_RECEIPT_RE.test(text) && !REJECTION_RE.test(text)) {
    return result("applied", "high", "platform application receipt", "platform_receipt");
  }

  if (REJECTION_RE.test(text) && !CONDITIONAL_REJECTION_RE.test(text)) {
    return result("rejected", "high", "formal rejection/non-selection language", "rejection");
  }

  if (OFFER_RE.test(text)) {
    return result("offered", "high", "formal offer language", "offer");
  }

  if (ASSESSMENT_RE.test(text)) {
    return result("interviewed", "high", "assessment/coding challenge", "assessment");
  }

  if (INTERVIEW_RE.test(text)) {
    return result("interviewed", "high", "interview scheduled or confirmed", "interview");
  }

  if (HUMAN_REPLY_RE.test(text) && !PLATFORM_SENDER_RE.test(fromLower) && !AUTOMATED_SENDER_RE.test(fromLower)) {
    return result("reply_needed", "medium", "human recruiter response requested", "human_reply");
  }

  if (APPLICATION_RECEIPT_RE.test(text)) {
    return result("applied", "high", "application receipt", "application_receipt");
  }

  return null;
}

function result(status, confidence, reason, ruleId) {
  return {
    status,
    confidence,
    reason,
    ruleId,
    classifier: "deterministic_rules"
  };
}
