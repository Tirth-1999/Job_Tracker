// api/generate-reply.js
// Vercel Serverless Function — AI Recruiter Reply Generator grounded in Tirth Shah's Portfolio

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const PORTFOLIO_SUMMARY = `
CANDIDATE PROFILE:
- Full Name: Tirth Shah
- Headline / Role: Data and AI Engineer
- Email: tirth.shah@tamu.edu | Personal: tirthcshah1999@gmail.com
- Phone: (979) 635-2045
- Location: Dallas, Texas
- Education: 
  * Master of Science in Management Information Systems (MS-MIS), Texas A&M University (May 2026, GPA: 3.90/4.00, MS-MIS Scholarship recipient)
  * Bachelor of Engineering in Computer Engineering, Gujarat Technological University (9.50/10.00 CGPA)
- Links:
  * LinkedIn: https://www.linkedin.com/in/tirth-chirayu-shah/
  * GitHub: https://github.com/Tirth-1999
  * Portfolio Website: https://www.tirthcshah.me/
- Verified Work Experience:
  1. HCLTech (Verizon Business Account) - Global Engagement Management Intern: Led AI-first network operations strategy for $3.5B Managed Network Services partnership; designed 3GPP NWDAF agentic multi-agent architecture (Observer, Diagnostic, Strategic, Operator with human-in-the-loop); co-built interactive 5G simulation prototype (React 19, TypeScript, Three.js, Zustand).
  2. Mays Business School (Texas A&M) - Founding Engineer, Flex Online Recruiting Analytics Platform (Edulytix): Built Python ETL, 17-table SQLite warehouse on Streamlit Cloud across 7 graduate programs; built LangChain schema RAG assistant using OpenRouter multi-model APIs (Gemini 2.5 Flash, ChromaDB) with guarded NL-to-SQL; cut manual reporting 95% (saving 100+ hrs/yr).
  3. Utilities & Energy Services (Texas A&M) - Data Engineer: Automated campus energy operations across 13 projects (50K–500K+ daily records); replaced 10-year-old Excel macros with Python & SQL Server; designed free-tier Databricks + SQL Server architecture with Airflow DAG patterns; 8-stage CHP pipeline cut 3-hr daily manual process to 5 min (97% reduction, 99.5% reliability).
  4. Black Tie Concierge - Founding Engineer: Shipped full-stack booking platform from zero to live paid operations in 12 weeks (Next.js, TypeScript, Supabase PostgreSQL, Stripe, Google Maps, Vercel), supporting $10K+ revenue and 3x early growth.
  5. Tata Consultancy Services (Equifax Account) - Data Engineer (Promoted): GCP cloud migration, multi-source credit data fabric (10M+ records/day, 45% identity match lift, 93% latency cut); led 5-person SAS-to-Python modernization POC (60+ scripts converted to pandas/multiprocessing, 80% runtime cut, 50% compute savings, Airflow DAG orchestration, FCRA/HIPAA-aware PII masking).
  6. PMC Retail - Business Analyst Intern: Supported Oracle Xstore POS modernization, Scrum user stories, UML activity flows, UAT test scenarios.
- Key Technical Skills:
  * Languages & Frameworks: Python, SQL, TypeScript, React, Next.js, FastAPI, Streamlit
  * Data & Lakehouse: Databricks, Apache Spark, PySpark, Snowflake, dbt, Delta Lake, SQL Server, PostgreSQL, SQLite, Star Schema, Medallion Architecture, ETL/ELT
  * AI & LLM Systems: Agentic AI, LangChain, LangGraph, RAG, ChromaDB, FAISS, Google Gemini, OpenRouter, Prompt Engineering, Guardrails, Text-to-SQL
  * Cloud & Orchestration: GCP, AWS (S3, Glue, Lambda), Azure, Airflow, Docker, GitHub Actions CI/CD
- Key Certifications:
  * AI Engineer for Developers Associate (DataCamp)
  * Academy Accreditation - AI Agent Fundamentals (Databricks)
  * Academy Accreditation - Generative AI Fundamentals (Databricks)
  * Introduction to LangChain (LangChain Academy)
  * Professional Scrum Master I (PSM I, Scrum.org)
  * Microsoft Certified: Azure Data Engineer Associate
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { app, intent, extraContext, model } = req.body || {};

    if (!app) {
      return res.status(400).json({ error: "Missing required 'app' parameter." });
    }

    // Resolve OpenRouter API Key
    let apiKey = process.env.OPENROUTER_API_KEY;
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const customKey = authHeader.replace("Bearer ", "").trim();
      if (customKey && !customKey.includes("••")) {
        apiKey = customKey;
      }
    }

    if (!apiKey) {
      return res.status(401).json({
        error: "OpenRouter API Key not configured. Please enter your OpenRouter Key in the Services tab or set OPENROUTER_API_KEY in Vercel environment."
      });
    }

    const chosenModel = model || "google/gemini-3.7-flash";

    const intentDescriptions = {
      interest: "Express enthusiastic but grounded interest in the role, briefly highlighting 1-2 relevant accomplishments that directly match the position, and propose coordinating a brief initial conversation.",
      interview: "Accept an interview invitation warmly, express excitement to speak with the team, provide clear and flexible availability windows (e.g., weekday mornings/afternoons Central Time), and confirm contact details.",
      questions: "Express interest in the opportunity while politely asking thoughtful, clarifying questions about the role scope, team tech stack, timeline, or interview process.",
      followup: "Politely and professionally follow up on an application or previous communication that has been pending, reiterate strong interest with a brief relevant value point, and inquire about next steps.",
      decline: "Politely, warmly, and respectfully decline the inquiry or opportunity while thanking them for considering you and expressing a desire to keep in touch for future opportunities."
    };

    const targetIntentDesc = intentDescriptions[intent] || intentDescriptions.interest;

    const systemPrompt = `
You are an expert executive communication coach and personal talent agent for Tirth Shah.
Your job is to draft an exceptional, highly personalized, professional, and authentic email reply from Tirth Shah to a recruiter or hiring team.

CRITICAL GUIDELINES:
1. Voice & Perspective: Write strictly in the first person as Tirth Shah ("I", "my").
2. Tone: Warm, confident, polite, authentic, and natural. NEVER sound like generic, robotic, or overly flowery AI marketing fluff.
3. Content Grounding: Draw selectively and accurately from Tirth's authentic background (Texas A&M MS-MIS, Equifax credit data pipelines at TCS, Mays Business School AI analytics platform, UES energy operations automation, HCLTech/Verizon 5G network intelligence). Only mention experiences that are directly relevant to the specific role and company.
4. Length: Keep it concise and executive-ready (typically 2 to 4 focused paragraphs). Respect the recruiter's time.
5. Formatting: Output ONLY the complete, ready-to-send email text (including a natural subject line if appropriate, a warm greeting, body paragraphs, and professional signature with Tirth's contact details).
${PORTFOLIO_SUMMARY}
`;

    const userMessage = `
Draft a reply for the following recruiting communication:

TARGET JOB DETAILS:
- Company: ${app.company || "Unknown"}
- Role: ${app.role || "General Application"}
- Recruiter / Sender: ${app.latestFrom || app.latest_from || "Recruiter"}
- Latest Email Subject: ${app.latestSubject || app.latest_subject || "Job Opportunity"}
- Current Pipeline Stage: ${app.status || "reply_needed"}
- Stored Notes / Thread Context: ${app.notes || "None"}
- Additional Context / Recruiter Message Pasted by User:
${extraContext ? `"""\n${extraContext}\n"""` : "No additional message body pasted. Draft based on role and thread context."}

DESIRED INTENT & GOAL:
${targetIntentDesc}

Write the email reply now.
`;

    const aiResponse = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Tirth-1999/Job_Tracker",
        "X-Title": "Job Tracker Draft My Reply"
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: "system", content: systemPrompt.trim() },
          { role: "user", content: userMessage.trim() }
        ],
        temperature: 0.4,
        max_tokens: 1000
      })
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return res.status(aiResponse.status).json({
        error: `OpenRouter API error (HTTP ${aiResponse.status}): ${errText}`
      });
    }

    const aiJson = await aiResponse.json();
    const draftText = aiJson.choices?.[0]?.message?.content || "";

    return res.status(200).json({
      success: true,
      model_used: chosenModel,
      draft: draftText.trim(),
      usage: aiJson.usage || null
    });
  } catch (err) {
    return res.status(500).json({
      error: `Server error generating draft: ${err.message}`
    });
  }
}
