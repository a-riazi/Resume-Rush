require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const compression = require('compression');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, TabStopType } = require('docx');
const pdf = require('pdf-parse');
const PDFDocument = require('pdfkit');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { templates, templateKeys, getTemplate } = require('./templates');
const { initializeDatabase, User, UsageMetrics, Subscription, AnonymousUsage } = require('./database');
const { optionalAuthMiddleware } = require('./auth');
const { canPerformAction, incrementUsage, TIER_CONFIG } = require('./tiers');
const { getAppNow, advanceMonthlySubscriptionIfNeeded, checkAndExpireMonthlyIfNeeded, checkAndExpireOneTimeIfNeeded } = require('./subscription-time');
const { getWarningEmailHTML } = require('./email-templates');
const authRoutes = require('./authRoutes');
const stripeRoutes = require('./stripeRoutes');
const { buildClassicHtml }   = require('./classicTemplateHtml');
const { buildIvyHtml }       = require('./ivyTemplateHtml');
const { buildPrestigeHtml }  = require('./prestigeTemplateHtml');
const { buildDualHtml }      = require('./dualTemplateHtml');
const { buildApexHtml }      = require('./apexTemplateHtml');

function buildHtmlForTemplate(parsed, tailored, templateKey) {
  if (templateKey === 'ivy')      return buildIvyHtml(parsed, tailored);
  if (templateKey === 'prestige') return buildPrestigeHtml(parsed, tailored);
  if (templateKey === 'dual')     return buildDualHtml(parsed, tailored);
  if (templateKey === 'apex')     return buildApexHtml(parsed, tailored);
  return buildClassicHtml(parsed, tailored);
}

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const PORT = process.env.PORT || 5000;

function validateStripeConfiguration() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠ STRIPE_SECRET_KEY is missing. Stripe checkout and billing routes will fail.');
    if (isProduction) {
      throw new Error('Missing required Stripe configuration: STRIPE_SECRET_KEY');
    }
    return;
  }

  if (!isProduction) return;

  const requiredEnv = [
    'STRIPE_SECRET_KEY',
    'STRIPE_MONTHLY_PRICE_ID',
    'STRIPE_ONE_TIME_PRICE_ID',
    'STRIPE_WEBHOOK_SECRET',
  ];

  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required Stripe configuration: ${missing.join(', ')}`);
  }

  if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
    throw new Error('Production requires a live Stripe secret key (sk_live_...).');
  }

  if (process.env.STRIPE_PUBLIC_KEY && !process.env.STRIPE_PUBLIC_KEY.startsWith('pk_live_')) {
    throw new Error('Production STRIPE_PUBLIC_KEY must use a live publishable key (pk_live_...).');
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
    throw new Error('STRIPE_WEBHOOK_SECRET must start with whsec_.');
  }
}

// Error handlers for unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Middleware
const configuredOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_ALT,
  process.env.CLIENT_URL,
]
  .filter(Boolean)
  .flatMap((value) => String(value).split(',').map((item) => item.trim()).filter(Boolean));

const allowedOrigins = [
  'https://resumerush.io',
  'https://www.resumerush.io',
  'http://localhost:5173', // Development frontend
  'http://localhost:3000',  // Alternative dev port
  ...configuredOrigins,
  // Allow default Railway preview domain if accessed directly
  // Add your Vercel preview domains here if needed
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow non-browser requests (like curl) which have no origin
    if (!origin) return callback(null, true);
    // Allow localhost/127.0.0.1 during development on any port
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // Allow our primary domains
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow common preview domains (Vercel, Railway)
    if (origin.endsWith('.vercel.app') || origin.endsWith('.railway.app')) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-ResumeRush-Time-Offset-Days'],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(compression());
const jsonParser = express.json();
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhook/stripe') {
    return next();
  }
  return jsonParser(req, res, next);
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, and TXT files are allowed.'));
    }
  }
});

// Global error handlers to prevent container crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

// Initialize Gemini AI
let genAI;
try {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log('✓ Gemini API initialized');
  console.log(`✓ Gemini model: ${GEMINI_MODEL}`);
} catch (error) {
  console.error('❌ Failed to initialize Gemini API:', error.message);
  process.exit(1);
}

// Helper: Get client IP address
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         'unknown';
}

// Helper: Send warning email
async function sendWarningEmail(user, type, data) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'resumerushio@gmail.com',
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const emailData = {
      ...data,
      actionUrl: data.actionUrl || process.env.FRONTEND_URL || 'http://localhost:5173',
      userName: user.name || user.email.split('@')[0],
    };

    const { subject, html } = getWarningEmailHTML(type, emailData);

    await transporter.sendMail({
      from: process.env.EMAIL_USER || 'resumerushio@gmail.com',
      to: user.email,
      subject,
      html,
    });

    console.log(`[Warning Email] Sent ${type} email to ${user.email}`);
    return true;
  } catch (error) {
    console.error(`[Warning Email] Failed to send ${type} email:`, error.message);
    return false;
  }
}

// Helper: Check if anonymous usage needs reset (24 hours)
function needsDailyReset(lastResetDate) {
  const now = new Date();
  const lastReset = new Date(lastResetDate);
  const hoursSinceReset = (now - lastReset) / (1000 * 60 * 60);
  return hoursSinceReset >= 24;
}

// Helper: Get or create anonymous usage record
async function getAnonymousUsage(ipAddress) {
  let usage = await AnonymousUsage.findOne({
    where: { ipAddress },
    order: [['createdAt', 'DESC']],
  });

  // Create new record if none exists
  if (!usage) {
    usage = await AnonymousUsage.create({
      ipAddress,
      generationsUsed: 0,
      lastResetDate: new Date(),
    });
  }

  // Reset if 24 hours have passed
  if (needsDailyReset(usage.lastResetDate)) {
    await usage.update({
      generationsUsed: 0,
      lastResetDate: new Date(),
    });
  }

  return usage;
}


async function inferJobTitleWithGemini(jobDescription) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const prompt = `Extract the job title and company name from the job description below. Return in the format: "Job Title at Company Name" (e.g., "Software Engineer at Google"). If no company is mentioned, return just the job title. Be concise (5-7 words max).\n\nJob description:\n${jobDescription}\n\nReturn the job title with company:`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  // Clean up the response - remove quotes, extra punctuation
  const cleaned = text.replace(/^["']|["']$/g, '').replace(/[\n\r]+/g, ' ').trim();
  // Limit to reasonable length
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.slice(0, 7).join(' ') || 'Role';
}

// Extract text from PDF
async function extractTextFromPDF(filePath) {
  // Verify file exists and is readable
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF file not found at path: ${filePath}`);
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    throw new Error('PDF file is empty (0 bytes)');
  }
  
  if (stats.size < 100) {
    throw new Error(`PDF file is too small (${stats.size} bytes). This may be a corrupted or invalid PDF.`);
  }
  
  try {
    const dataBuffer = fs.readFileSync(filePath);
    
    // Verify PDF magic number (PDF files should start with %PDF)
    const pdfHeader = dataBuffer.toString('ascii', 0, 4);
    if (!pdfHeader.startsWith('%PDF')) {
      throw new Error('File does not appear to be a valid PDF (missing PDF header). The uploaded file may be corrupted or not actually a PDF.');
    }
    
    // pdf-parse default export is a function
    const data = await pdf(dataBuffer);
    
    if (!data.text || data.text.trim().length === 0) {
      throw new Error('PDF was read but contains no extractable text. The PDF may be image-only or have text extraction disabled.');
    }
    
    return data.text;
  } catch (error) {
    if (error.message.includes('No PDF header found')) {
      throw new Error('Invalid PDF file. The uploaded file is not a valid PDF document.');
    }
    throw error;
  }
}

// Extract text from DOCX
async function extractTextFromDOCX(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

// Extract text from TXT
function extractTextFromTXT(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// Extract text based on file type
async function extractText(filePath, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      return await extractTextFromPDF(filePath);
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return await extractTextFromDOCX(filePath);
    } else if (mimetype === 'text/plain') {
      return extractTextFromTXT(filePath);
    } else {
      throw new Error('Unsupported file type');
    }
  } catch (error) {
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

// Parse resume with Gemini
async function parseResumeWithGemini(resumeText) {
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    
    const prompt = `You are an expert resume parser. Extract structured data from the resume text below and return ONLY valid JSON — no markdown code blocks, no trailing commas, and no extra conversational text.

CRITICAL RULES BEFORE YOU BEGIN:
1. NAME: The candidate's full personal name (e.g. "Ali Riazi", "Jordan Lee"). It is almost always the very first prominent item on the resume, before any section headings. It is NEVER a section heading. NEVER return words like "Technical Skills", "Professional Summary", "Objective", "Education", "Experience", "Skills", "Certifications", "Projects", "Awards", "Languages", "Contact", "Profile", "Overview", "References", "Work History", or any similar heading as the name. If you cannot identify a clear personal name, return "".
2. SUMMARY: Return only the body text of the professional summary/objective — do NOT include the section label (e.g. strip "Professional Summary", "Objective:", "Summary:", "Header:" from the start of the text).
3. EXPERIENCE BULLETS: Each bullet point must be its own string in the array. Split on bullet symbols (•, -, *, ◦), numbered lists, or newlines. Never combine multiple bullets into one string.
4. SKILLS: Return a flat array of individual skill strings.
5. ACCURACY: Only extract what is actually present in the resume. Return "" or [] for missing fields. Return null for missing optional object fields.
6. NO DUPLICATES: Never repeat the same value across contact fields or arrays. If the same URL appears multiple times in the source text, keep it once. Skills, languages, bullets, and project technologies must be unique.

Resume Text:
---
${resumeText}
---

Return a JSON object with this exact structure:
{
  "name": "Candidate full personal name, or empty string if not found",
  "email": "Email address, or empty string",
  "phone": "Phone number, or empty string",
  "location": "City, State or Country, or empty string",
  "summary": "Body text of professional summary/objective only — no section label prefix, or empty string",
  "links": {
    "linkedin": "Full LinkedIn URL if present, or null",
    "github": "Full GitHub URL if present, or null",
    "portfolio": "Portfolio/personal website URL if present, or null"
  },
  "experience": [
    {
      "company": "Exact company name",
      "title": "Exact job title",
      "dates": "Employment date range",
      "bullets": ["One bullet point per string"]
    }
  ],
  "education": [
    {
      "school": "Institution name",
      "degree": "Degree type (B.S., M.S., Ph.D., etc.)",
      "field": "Field or major",
      "dates": "Date range or graduation date",
      "gpa": "GPA if listed, or null"
    }
  ],
  "projects": [
    {
      "name": "Project title",
      "organization": "Associated institution or company, or null",
      "dates": "Project dates, or null",
      "description": "What the project does and what was built",
      "technologies": ["tech1", "tech2"]
    }
  ],
  "certifications": [
    {
      "name": "Certification name",
      "issuer": "Issuing organization, or null",
      "date": "Date obtained, or null"
    }
  ],
  "awards": [
    {
      "title": "Award title",
      "issuer": "Awarding organization, or null",
      "date": "Year, or null"
    }
  ],
  "languages": ["Language (proficiency level)"],
  "skills": ["skill1", "skill2"]
}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    let text = response.text();
    
    // Clean up response if it contains markdown code blocks
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Parse JSON
    const parsedData = JSON.parse(text);

    // ── Post-parse name sanity check ─────────────────────────────────────────
    // If Gemini returned a section heading as the name, clear it so the fallback runs.
    const HEADING_WORDS = /\b(skills?|summary|objective|experience|education|certification|project|award|language|technical|professional|work|employment|history|references|contact|profile|overview|about)\b/i;
    if (parsedData.name && HEADING_WORDS.test(parsedData.name)) {
      console.warn('[parseResumeWithGemini] Rejected invalid name from Gemini:', parsedData.name);
      parsedData.name = '';
    }

    // Regex fallback: recover fields Gemini failed to extract
    if (!parsedData.email) {
      const emailMatch = resumeText.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i);
      if (emailMatch) parsedData.email = emailMatch[0];
    }
    if (!parsedData.phone) {
      const phoneMatch = resumeText.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
      if (phoneMatch) parsedData.phone = phoneMatch[0].trim();
    }
    if (!parsedData.name) {
      // Require: 2–4 title-cased words, letters/hyphens/apostrophes only, first 30 lines only
      const namePattern = /^[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,3}$/;
      const topLines = resumeText.split('\n').slice(0, 30).map(l => l.trim());
      const candidate = topLines.find(l =>
        namePattern.test(l) &&
        !HEADING_WORDS.test(l) &&
        !l.includes('@') &&
        !l.includes('http') &&
        !l.endsWith(':')
      );
      if (candidate) parsedData.name = candidate;
    }

    // Final sanitation: normalize + dedupe repeated fields so downstream rendering
    // never repeats contact URLs or repeated list items.
    const dedupeStrings = (arr) => {
      const seen = new Set();
      return (Array.isArray(arr) ? arr : [])
        .map((v) => (v == null ? '' : String(v).trim()))
        .filter(Boolean)
        .filter((v) => {
          const key = v.toLowerCase().replace(/\/+$/, '');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    };

    if (!parsedData.links || typeof parsedData.links !== 'object') parsedData.links = {};
    const orderedLinkValues = dedupeStrings([
      parsedData.links.linkedin,
      parsedData.links.github,
      parsedData.links.portfolio,
    ]);
    parsedData.links.linkedin = orderedLinkValues[0] || null;
    parsedData.links.github = orderedLinkValues[1] || null;
    parsedData.links.portfolio = orderedLinkValues[2] || null;

    parsedData.skills = dedupeStrings(parsedData.skills);
    parsedData.languages = dedupeStrings(parsedData.languages);

    if (Array.isArray(parsedData.experience)) {
      parsedData.experience = parsedData.experience.map((exp) => ({
        ...exp,
        bullets: dedupeStrings(exp?.bullets),
      }));
    }

    if (Array.isArray(parsedData.projects)) {
      parsedData.projects = parsedData.projects.map((proj) => ({
        ...proj,
        technologies: dedupeStrings(proj?.technologies),
      }));
    }

    console.log('[parseResumeWithGemini] name:', parsedData.name || '(empty)', '| email:', parsedData.email || '(empty)');
    return parsedData;
  } catch (error) {
    console.error('Gemini parsing error:', error);
    throw new Error('Failed to parse resume with AI');
  }
}

// Tailor resume to job description with Gemini
async function tailorResumeWithGemini(parsedResume, jobDescription, limitToOnePage = false, templateKey = 'classic') {
  try {
    console.log('[tailorResumeWithGemini] Starting...');
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const onePageConstraint = limitToOnePage
      ? `\n\n⚠️ ONE-PAGE CONSTRAINT — This is the highest-priority rule. The resume MUST fit on a single Letter-size page.\n\nPRIORITIZATION STRATEGY (follow strictly in this order):\na) EXPERIENCE: Include only the 2 most relevant roles for this specific job. If fewer than 2 are relevant, use the 2 most recent roles. Write exactly 2 bullets per role — the highest-impact, most job-relevant bullets only.\nb) SUMMARY: 2 sentences maximum.\nc) SKILLS: Use a single flat comma-separated list (no grouped categories). Include only the 10–12 most relevant skills.\nd) PROJECTS: Include at most 1 project — only if it directly demonstrates a skill critical for this role. Otherwise return [].\ne) SECTIONS: Omit certifications, awards, and languages entirely unless they are a primary differentiator for this specific role.\nf) EDUCATION: One line per entry (school + degree + dates only). Omit GPA unless 3.8 or above.\n\nDo NOT compress everything uniformly. Intelligently SELECT which entries to include or OMIT based on direct relevance to the job description. Quality and relevance over completeness.`
      : '';

    const TEMPLATE_HINTS = {
      ivy: `IVY TEMPLATE — Additional output rules (apply alongside the rules above):\na) OUTPUT FIELD: Add a "tailored_activities" field alongside "tailored_experience". Map this from the candidate's non-employment entries — clubs, organizations, volunteer work, sports, student groups, research assistantships, extracurricular activities. Structure is identical to tailored_experience:\n   [{"org": "Organization name", "role": "Position/role held", "dates": "Month Year – Month Year", "bullets": ["bullet 1"]}]\n   If no relevant activities exist, return \"tailored_activities\": [].\nb) SECTIONS: Use ONLY these valid section keys for the Ivy template: \"summary\", \"education\", \"experience\", \"activities\", \"skills\". Do NOT include \"projects\", \"certifications\", \"awards\", or \"languages\".\n   - Include \"activities\" in sections[] only if tailored_activities is non-empty.\n   - Entry-level / academic (student or 0-3 years exp): [\"summary\", \"education\", \"experience\", \"activities\", \"skills\"]\n   - Experienced (4+ years): [\"summary\", \"experience\", \"education\", \"activities\", \"skills\"]\nc) SKILLS GROUPING: Use these specific group names in skills_grouped where applicable:\n   - \"Technical\" — programming languages, software, frameworks, tools, platforms\n   - \"Language\" — spoken/written languages (e.g. \"Spanish (Fluent)\"); omit if candidate has none\n   - \"Laboratory\" — scientific or lab techniques; include only if directly relevant to the role\n   - \"Interests\" — hobbies or personal interests suitable for interview conversation; include if candidate data suggests any\n   Omit any category that has no relevant content.`,
      prestige: `PRESTIGE TEMPLATE — Additional output rules (apply alongside the rules above):\na) OUTPUT FIELD: Add a "tailored_activities" field alongside "tailored_experience". Map from the candidate's non-employment entries — clubs, organizations, volunteer work, extracurriculars. Structure identical to tailored_experience: [{"org": "Org name", "role": "Role held", "dates": "Month Year – Month Year", "bullets": ["bullet"]}]. Return [] if none.\nb) SECTIONS: Use ONLY: \"summary\" (optional), \"education\", \"experience\", \"activities_leadership\", \"skills\".\n   - Include \"activities_leadership\" in sections[] only if tailored_activities is non-empty.\n   - Entry-level / academic: [\"education\", \"experience\", \"activities_leadership\", \"skills\"]\n   - Experienced (4+ years): [\"summary\", \"experience\", \"education\", \"activities_leadership\", \"skills\"]\nc) SKILLS GROUPING: skills_grouped keys \"Technical\", \"Languages\", \"Interests\". Omit any with no relevant content.`,
      dual: `DUAL TEMPLATE (two-column sidebar) — Additional output rules (apply alongside the rules above):\na) SECTIONS: Use ONLY \"experience\", \"education\", \"skills\". No summary or activities section.\nb) SKILLS GROUPING: skills_grouped must use these exact key strings (each key becomes a sidebar section heading):\n   - \"Technical Skills\" — programming languages, software, frameworks, tools, platforms\n   - \"Languages\" — spoken/written languages (e.g. \"Spanish (Fluent)\"); omit if none\n   - \"Laboratory / Tools\" — lab techniques or scientific tools; include only if relevant to role\n   - \"Interests\" — hobbies suitable for interview conversation; include if data available\n   Omit any category with no content.\nc) Section order: [\"experience\", \"education\", \"skills\"]`,
      apex: `APEX TEMPLATE (executive style) — Additional output rules (apply alongside the rules above):\na) SECTIONS: Use ONLY \"summary\", \"experience\", \"education_certifications\", \"skills\".\n   - \"education_certifications\" is a combined section for both education AND certifications.\n   - Always include \"summary\" — write as a senior executive profile, 2–3 impactful sentences.\nb) SKILLS GROUPING: skills_grouped keys:\n   - \"Management\" — leadership, methodologies, soft skills (e.g. Strategic Planning, Agile, Stakeholder Management)\n   - \"Technical\" — software, tools, programming languages, platforms\n   Omit any category with no relevant content.\nc) Section order: always [\"summary\", \"experience\", \"education_certifications\", \"skills\"].`,
    };
    const templateHint = TEMPLATE_HINTS[templateKey] ? `\n\n${TEMPLATE_HINTS[templateKey]}` : '';

    const prompt = `You are an expert resume tailor. Using ONLY the candidate data provided and the job description, produce a complete, high-quality tailored resume. Do NOT invent companies, roles, dates, or specific metrics that are not present in the source data.

Candidate data (JSON):
${JSON.stringify(parsedResume, null, 2)}

Job description:
${jobDescription}

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "tailored_summary": "2-3 sentences. Keyword-dense. Implicitly demonstrates fit without mentioning the job title, company name, or that this was tailored.",
  "skills_grouped": {
    "Category Label": ["skill1", "skill2"]
  },
  "tailored_experience": [
    {
      "role": "Exact role title from resume",
      "company": "Exact company name from resume",
      "dates": "Exact dates from resume",
      "bullets": ["bullet 1", "bullet 2", "bullet 3"]
    }
  ],
  "tailored_projects": [
    {
      "name": "Project name from resume",
      "description": "Rewritten to emphasize job-relevant aspects",
      "technologies": ["tech1", "tech2"]
    }
  ],
  "sections": ["summary", "skills", "experience", "education"],
  "recommended_template": "key_from_list",
  "role_category": "tech | creative | executive | academic | healthcare | entry-level | general"
}

RULES — follow all of these precisely:

1. BULLET QUALITY: Write 3-5 bullets per role. Every bullet must: (a) start with a strong past-tense action verb, (b) describe what was done and at what scope, (c) include the result or impact when inferable from the source data. DISCARD generic bullets like "Worked on various projects" — replace with specific, achievement-oriented language from the source description. Mirror exact terminology from the job description (e.g. if JD says "Agile ceremonies", use that phrase, not "Scrum meetings").

2. QUANTIFIED IMPACT: Add concrete scale language wherever the source data implies it — numbers, percentages, team sizes, revenue, time saved. Do NOT fabricate specific numbers. Use scope language when no number exists ("enterprise-scale", "cross-functional team of engineers", "production system serving thousands of users").

3. SKILLS GROUPING: In skills_grouped, group skills meaningfully for the role_category (tech roles: split into "Programming Languages", "Frameworks & Libraries", "Tools & Platforms"; business roles: "Core Competencies", "Software & Tools"; academic: "Research Methods", "Tools"). Use max 4 groups. Only include skills from the candidate data that are relevant to this job. Each group should have 4-10 items.

4. PROJECT FILTERING: In tailored_projects, include ONLY projects that directly demonstrate skills or domain knowledge needed for this specific role. Rewrite each description to emphasize the most job-relevant aspects. If no projects are relevant, return an empty array [].

5. SECTION ORDER & RELEVANCE: Populate sections[] with ONLY the keys for which the candidate has real content. Order them optimally for this role:
   - Senior candidates (4+ years of experience): ["summary", "skills", "experience", "education", ...]
   - Entry-level / students: ["summary", "education", "skills", "projects", "experience", ...]
   - Academic / research: ["summary", "education", "experience", "certifications", ...]
   Always put "summary" first. Only include "projects" if tailored_projects is non-empty. Include "certifications" only if candidate has certifications data. Include "awards" only if candidate has awards data.

6. ACCURACY: Use ONLY the candidate's actual companies, roles, dates, and project names. Output valid JSON with no trailing commas.

7. NO DUPLICATES: Do not repeat values anywhere in output. Remove duplicated bullets within a role, duplicated skills within/across skills_grouped categories, duplicated technologies in projects, duplicated projects, and duplicated section keys in sections[].${onePageConstraint}${templateHint}`;

    console.log('[tailorResumeWithGemini] Calling Gemini API...');
    const startTime = Date.now();
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Resume tailoring timed out after 60 seconds')), 60000)
      )
    ]);
    const elapsed = Date.now() - startTime;
    console.log(`[tailorResumeWithGemini] Gemini API responded in ${elapsed}ms`);
    
    const response = result.response;
    let text = response.text();

    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const tailored = JSON.parse(text);
    const dedupeStrings = (arr) => {
      const seen = new Set();
      return (Array.isArray(arr) ? arr : [])
        .map((v) => (v == null ? '' : String(v).trim()))
        .filter(Boolean)
        .filter((v) => {
          const key = v.toLowerCase().replace(/\/+$/, '');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    };

    if (Array.isArray(tailored?.sections)) {
      tailored.sections = dedupeStrings(tailored.sections);
    }

    if (tailored?.skills_grouped && typeof tailored.skills_grouped === 'object') {
      for (const [k, values] of Object.entries(tailored.skills_grouped)) {
        tailored.skills_grouped[k] = dedupeStrings(values);
      }
    }

    if (Array.isArray(tailored?.tailored_experience)) {
      tailored.tailored_experience = tailored.tailored_experience.map((exp) => ({
        ...exp,
        bullets: dedupeStrings(exp?.bullets),
      }));
    }

    if (Array.isArray(tailored?.tailored_activities)) {
      tailored.tailored_activities = tailored.tailored_activities.map((item) => ({
        ...item,
        bullets: dedupeStrings(item?.bullets),
      }));
    }

    if (Array.isArray(tailored?.tailored_projects)) {
      const seenProjects = new Set();
      tailored.tailored_projects = tailored.tailored_projects
        .map((proj) => ({
          ...proj,
          technologies: dedupeStrings(proj?.technologies),
        }))
        .filter((proj) => {
          const key = `${proj?.name || ''}::${proj?.description || ''}`.trim().toLowerCase();
          if (!key || seenProjects.has(key)) return false;
          seenProjects.add(key);
          return true;
        });
    }
    // Back-compat: if AI returned old target_skills instead of skills_grouped, promote it
    if (tailored && tailored.target_skills && !tailored.skills_grouped) {
      tailored.skills_grouped = { 'Skills': tailored.target_skills };
    }
    console.log('[tailorResumeWithGemini] Complete');
    return tailored;
  } catch (error) {
    console.error('[tailorResumeWithGemini] Error:', error.message);
    throw new Error(`Failed to tailor resume with AI: ${error.message}`);
  }
}

// Generate cover letter with Gemini
async function generateCoverLetterWithGemini(parsedResume, jobDescription, limitToOnePage = false) {
  try {
    console.log('[generateCoverLetterWithGemini] Starting...');
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    
    const resumeSummary = `
Name: ${parsedResume.name || 'N/A'}
Summary: ${parsedResume.summary || 'N/A'}
Skills: ${Array.isArray(parsedResume.skills) ? parsedResume.skills.join(', ') : 'N/A'}
Experience: ${Array.isArray(parsedResume.experience) ? parsedResume.experience.map(e => `${e.role || e.title || ''} at ${e.company || ''}`).join('; ') : 'N/A'}
Education: ${Array.isArray(parsedResume.education) ? parsedResume.education.map(e => `${e.degree || ''} from ${e.school || ''}`).join('; ') : 'N/A'}
`;

    const onePageConstraint = limitToOnePage
      ? '\n\n⚠️ CRITICAL: The cover letter MUST fit on ONE PAGE. Keep it to 3 short paragraphs (100-120 words max each). Avoid redundancy. Be concise and impactful.'
      : '\n\nWrite in first person. Be professional, confident, and specific. Make connections between the resume and job requirements.\nKeep it concise (3-4 paragraphs total, around 250-350 words).';

    const prompt = `You are a professional cover letter writer. Write a compelling, professional cover letter for this job application.

RESUME INFORMATION:
${resumeSummary}

JOB DESCRIPTION:
${jobDescription || 'General application for a position that matches the candidate\'s background'}

Write a complete cover letter with the following structure:
- Opening paragraph: Express interest in the position and briefly introduce yourself
- 2-3 body paragraphs: Highlight relevant experience, skills, and achievements that match the job requirements
- Closing paragraph: Express enthusiasm and request for an interview
${onePageConstraint}

Return ONLY the body paragraphs of the cover letter (no greeting like "Dear Hiring Manager", no closing like "Sincerely" - those will be added automatically).
Separate paragraphs with double newlines (\\n\\n).`;

    console.log('[generateCoverLetterWithGemini] Calling Gemini API...');
    const startTime = Date.now();
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Cover letter generation timed out after 60 seconds')), 60000)
      )
    ]);
    const elapsed = Date.now() - startTime;
    console.log(`[generateCoverLetterWithGemini] Gemini API responded in ${elapsed}ms`);
    
    const response = result.response;
    const text = response.text().trim();
    console.log('[generateCoverLetterWithGemini] Complete');
    
    return text;
  } catch (error) {
    console.error('[generateCoverLetterWithGemini] Error:', error.message);
    throw new Error(`Failed to generate cover letter with AI: ${error.message}`);
  }
}

// Proofread content with Gemini

function toPlainText(value, type = 'generic') {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (type === 'skills') {
      const flat = value.filter(Boolean).map(v => (typeof v === 'string' ? v : '')).filter(Boolean);
      return flat.join(', ');
    }
    if (type === 'experience') {
      return value.map((exp) => {
        if (!exp || typeof exp !== 'object') return '';
        const title = exp.role || exp.title || '';
        const company = exp.company || '';
        const heading = [title, company].filter(Boolean).join(' at ');
        const dates = exp.dates ? `\n${exp.dates}` : '';
        const desc = exp.description ? `\n${exp.description}` : '';
        const bullets = Array.isArray(exp.bullets) && exp.bullets.length > 0
          ? `\n${exp.bullets.map(b => `- ${b}`).join('\n')}`
          : '';
        return [heading, dates, desc, bullets].filter(Boolean).join('');
      }).filter(Boolean).join('\n\n');
    }
    if (type === 'education') {
      return value.map((edu) => {
        if (!edu || typeof edu !== 'object') return '';
        const degreeField = [edu.degree, edu.field].filter(Boolean).join(' in ');
        const school = edu.school || '';
        const dates = edu.dates || '';
        return [degreeField, school, dates].filter(Boolean).join('\n');
      }).filter(Boolean).join('\n\n');
    }
    // generic array of strings
    return value.map(v => (typeof v === 'string' ? v : '')).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    // Fallback: stringify key facts line-by-line
    try {
      return Object.values(value).map(v => (typeof v === 'string' ? v : '')).filter(Boolean).join('\n');
    } catch {
      return '';
    }
  }
  return '';
}

function addSectionTitle(doc, text, style, layout = 'traditional') {
  doc.moveDown(style.pdf.sectionGap);
  
  // Simple section title matching DOCX capabilities
  const titleText = (layout === 'formal') ? text.toUpperCase() : text;
  doc.font(resolvePdfFont(style.pdf.headingFont || style.pdf.font, true))
    .fontSize(style.pdf.headingSize)
    .fillColor(style.docx?.headingColor ? `#${style.docx.headingColor}` : style.pdf.headingColor)
    .text(titleText);
  
  // Underline for accented/minimalist styles only
  if (layout === 'accented' || layout === 'minimalist') {
    doc.moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.margins.left + doc.widthOfString(titleText), doc.y)
      .strokeColor(style.docx?.accentColor ? `#${style.docx.accentColor}` : style.pdf.accentColor).lineWidth(1).stroke();
  }
  
  doc.moveDown(0.3);
}

function addLine(doc, style) {
  doc
    .moveTo(doc.x, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor(style.docx?.accentColor ? `#${style.docx.accentColor}` : style.pdf.accentColor)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(style.pdf.sectionGap);
}

// Resolve a valid PDFKit built-in font name with sensible fallbacks
function resolvePdfFont(name, isHeading = false) {
  const builtin = new Set(['Helvetica', 'Helvetica-Bold', 'Times-Roman', 'Times-Bold', 'Courier', 'Courier-Bold']);
  if (!name) return isHeading ? 'Helvetica-Bold' : 'Helvetica';
  if (builtin.has(name)) return name;
  const lower = String(name).toLowerCase();
  if (lower.includes('georgia')) return isHeading ? 'Times-Bold' : 'Times-Roman';
  if (lower.includes('arial')) return isHeading ? 'Helvetica-Bold' : 'Helvetica';
  if (lower.includes('courier')) return isHeading ? 'Courier-Bold' : 'Courier';
  if (lower.includes('times')) return isHeading ? 'Times-Bold' : 'Times-Roman';
  if (lower.includes('helvetica')) return isHeading ? 'Helvetica-Bold' : 'Helvetica';
  return isHeading ? 'Helvetica-Bold' : 'Helvetica';
}


// ─────────────────────────────────────────────────────────────────────────────
// HTML parser utilities (used by DOCX→HTML→PDF pipeline)
// ─────────────────────────────────────────────────────────────────────────────

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function parseHtmlTokens(html) {
  const tokens = [];
  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[2]) {
      tokens.push({ type: m[1] ? 'close' : 'open', tag: m[2].toLowerCase(), attrs: m[3] || '' });
    } else if (m[4] && m[4].trim()) {
      tokens.push({ type: 'text', content: decodeEntities(m[4]) });
    }
  }
  return tokens;
}

function buildHtmlTree(tokens) {
  const root = { tag: 'root', children: [] };
  const stack = [root];
  const voidTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
  for (const tok of tokens) {
    if (tok.type === 'text') {
      stack[stack.length - 1].children.push({ tag: '#text', content: tok.content });
    } else if (tok.type === 'open') {
      const el = { tag: tok.tag, children: [] };
      stack[stack.length - 1].children.push(el);
      if (!voidTags.has(tok.tag)) stack.push(el);
    } else if (tok.type === 'close' && stack.length > 1) {
      stack.pop();
    }
  }
  return root;
}

function getTextContent(node) {
  if (!node) return '';
  if (node.tag === '#text') return node.content || '';
  return (node.children || []).map(getTextContent).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF section heading renderer — applies decoration per template style
// ─────────────────────────────────────────────────────────────────────────────

function renderPdfSectionHeading(doc, text, style, sectionHeadingStyle, bodyFont, headingFont, pageMarginLeft, pageMarginRight) {
  const s = style.pdf;
  const c = s.colors;
  const layout = style.layout;

  let displayText = text;
  if (sectionHeadingStyle === 'uppercase-rule' || layout === 'centered') {
    displayText = text.toUpperCase();
  }

  doc.font(headingFont).fontSize(s.headingSize).fillColor(c.heading || '#111').text(displayText);

  const curY = doc.y;
  // Decoration below/beside heading
  if (sectionHeadingStyle === 'rule-below') {
    doc.moveTo(pageMarginLeft, curY).lineTo(doc.page.width - pageMarginRight, curY)
      .strokeColor(c.rule || '#cccccc').lineWidth(0.5).stroke();
  } else if (sectionHeadingStyle === 'uppercase-rule') {
    doc.moveTo(pageMarginLeft, curY).lineTo(doc.page.width - pageMarginRight, curY)
      .strokeColor(c.rule || '#888888').lineWidth(0.5).stroke();
  } else if (sectionHeadingStyle === 'accent-rule') {
    doc.moveTo(pageMarginLeft, curY).lineTo(pageMarginLeft + 50, curY)
      .strokeColor(c.accent || '#3b82f6').lineWidth(2).stroke();
  } else if (sectionHeadingStyle === 'underline') {
    doc.moveTo(pageMarginLeft, curY).lineTo(pageMarginLeft + doc.widthOfString(displayText), curY)
      .strokeColor(c.heading || '#1e3a5f').lineWidth(0.8).stroke();
  }
  // 'left-accent' is drawn as a filled rect before the heading text
  doc.moveDown(0.25);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML tree → PDFKit renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderHtmlNodeToPdf(doc, node, ctx) {
  if (!node || node.tag === '#text') return;
  const { style, headingFont, bodyFont, pageMarginLeft, pageMarginRight } = ctx;
  const s = style.pdf;
  const c = s.colors;
  const shs = style.sectionHeadingStyle || 'rule-below';

  switch (node.tag) {
    case 'h1': {
      const text = getTextContent(node).trim();
      if (!text) return;
      doc.font(headingFont).fontSize(s.titleSize).fillColor(c.title || '#111').text(text);
      break;
    }
    case 'h2': {
      const text = getTextContent(node).trim();
      if (!text) return;
      doc.moveDown(s.sectionGap || 0.5);
      // left-accent: draw bar before heading text
      if (shs === 'left-accent') {
        const barH = s.headingSize * 1.4;
        const barY = doc.y;
        doc.rect(pageMarginLeft - 8, barY, 3, barH).fill(c.accent || '#1e40af');
      }
      renderPdfSectionHeading(doc, text, style, shs, bodyFont, headingFont, pageMarginLeft, pageMarginRight);
      break;
    }
    case 'h3': {
      const text = getTextContent(node).trim();
      if (!text) return;
      doc.moveDown(0.3);
      doc.font(headingFont).fontSize(s.subheadingSize || s.headingSize).fillColor(c.heading || '#111').text(text);
      break;
    }
    case 'p': {
      const text = getTextContent(node).trim();
      if (!text) return;
      doc.moveDown(0.15);
      doc.font(bodyFont).fontSize(s.bodySize).fillColor(c.body || '#222').text(text, { lineGap: s.lineGap || 2 });
      break;
    }
    case 'ul':
    case 'ol': {
      (node.children || []).forEach(li => {
        if (li.tag !== 'li') return;
        const text = getTextContent(li).trim();
        if (text) doc.font(bodyFont).fontSize(s.bodySize).fillColor(c.body || '#222')
          .text('\u2022 ' + text, { lineGap: 1.8 });
      });
      break;
    }
    case 'table': {
      renderHtmlTableToPdf(doc, node, ctx);
      ctx.tableIndex = (ctx.tableIndex || 0) + 1;
      break;
    }
    default: {
      (node.children || []).forEach(child => renderHtmlNodeToPdf(doc, child, ctx));
    }
  }
}

function renderHtmlTableToPdf(doc, tableNode, ctx) {
  const { style, headingFont, bodyFont, pageMarginLeft, pageMarginRight } = ctx;
  const layout = style.layout;
  const s = style.pdf;
  const c = s.colors;
  const tableIndex = ctx.tableIndex || 0;

  const tbody = tableNode.children.find(n => n.tag === 'tbody') || tableNode;
  const rows = (tbody.children || []).filter(n => n.tag === 'tr');
  if (!rows.length) return;
  const cells = (rows[0].children || []).filter(n => n.tag === 'td' || n.tag === 'th');

  // Header-band: first table, single cell → draw dark band
  if (layout === 'header-band' && tableIndex === 0 && cells.length === 1) {
    const bandH = 72;
    doc.rect(0, 0, doc.page.width, bandH).fill(c.headerBand || '#111827');
    doc.y = 14;
    const cellContent = cells[0];
    (cellContent.children || []).forEach(n => {
      const text = getTextContent(n).trim();
      if (!text) return;
      const isName = n.tag === 'h1' || n.tag === 'strong';
      doc.x = pageMarginLeft;
      doc.font(isName ? headingFont : bodyFont)
        .fontSize(isName ? s.titleSize : s.smallSize || 9)
        .fillColor(isName ? '#ffffff' : (c.headerContact || '#d1d5db'))
        .text(text, { align: 'left' });
    });
    doc.moveDown(0.5);
    return;
  }

  // Sidebar: 2-cell table → render two-column layout
  if (layout === 'sidebar' && cells.length >= 2) {
    renderSidebarColumnsToPdf(doc, cells[0], cells[1], ctx);
    return;
  }

  // Accent-strip: first table, 2-cell (left=decorative, right=content)
  if (layout === 'accent-strip' && tableIndex === 0 && cells.length >= 2) {
    const rightCell = cells[1];
    (rightCell.children || []).forEach(n => renderHtmlNodeToPdf(doc, n, ctx));
    return;
  }

  // Default: flatten all cells
  rows.forEach(row => {
    (row.children || []).filter(c => c.tag === 'td' || c.tag === 'th').forEach(cell => {
      (cell.children || []).forEach(n => renderHtmlNodeToPdf(doc, n, ctx));
    });
  });
}

function renderNodeInColumn(doc, node, ctx, colX, colW, isLeft) {
  if (!node || node.tag === '#text') return;
  const { style, headingFont, bodyFont } = ctx;
  const s = style.pdf;
  const c = isLeft ? {
    title:   s.colors.sidebarTitle   || '#ffffff',
    heading: s.colors.sidebarHeading || '#94a3b8',
    body:    s.colors.sidebarBody    || '#e2e8f0',
    meta:    s.colors.sidebarMeta    || '#94a3b8',
  } : s.colors;
  const shs = style.sectionHeadingStyle || 'plain';

  switch (node.tag) {
    case 'h1': {
      const text = getTextContent(node).trim();
      if (!text) return;
      doc.font(headingFont).fontSize(s.titleSize).fillColor(c.title || '#111')
        .text(text, colX, doc.y, { width: colW });
      break;
    }
    case 'h2': {
      const text = getTextContent(node).trim();
      if (!text) return;
      doc.moveDown(0.4);
      doc.font(headingFont).fontSize(s.headingSize).fillColor(c.heading || '#94a3b8')
        .text(text, colX, doc.y, { width: colW });
      const curY = doc.y;
      doc.moveTo(colX, curY).lineTo(colX + colW, curY)
        .strokeColor(c.heading || '#94a3b8').lineWidth(0.4).stroke();
      doc.moveDown(0.2);
      break;
    }
    case 'h3': {
      const text = getTextContent(node).trim();
      if (!text) return;
      doc.moveDown(0.2);
      doc.font(headingFont).fontSize(s.subheadingSize || s.headingSize).fillColor(c.heading || '#888')
        .text(text, colX, doc.y, { width: colW });
      break;
    }
    case 'p': {
      const text = getTextContent(node).trim();
      if (!text) return;
      doc.moveDown(0.12);
      doc.font(bodyFont).fontSize(s.bodySize).fillColor(c.body || '#ccc')
        .text(text, colX, doc.y, { width: colW, lineGap: s.lineGap || 2 });
      break;
    }
    case 'ul':
    case 'ol': {
      (node.children || []).forEach(li => {
        if (li.tag !== 'li') return;
        const text = getTextContent(li).trim();
        if (text) doc.font(bodyFont).fontSize(s.bodySize).fillColor(c.body || '#ccc')
          .text('\u2022 ' + text, colX, doc.y, { width: colW, lineGap: 1.8 });
      });
      break;
    }
    default: {
      (node.children || []).forEach(child => renderNodeInColumn(doc, child, ctx, colX, colW, isLeft));
    }
  }
}

function renderSidebarColumnsToPdf(doc, leftCell, rightCell, ctx) {
  const { style, headingFont, bodyFont } = ctx;
  const s = style.pdf;
  const c = s.colors;
  const innerMargin = 14;
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const leftColW = Math.round(pageW * (s.leftColFraction || 0.30));
  const rightX = leftColW + innerMargin;
  const rightW = pageW - leftColW - innerMargin * 2;
  const startY = 14;

  // Draw sidebar background on full page height
  doc.rect(0, 0, leftColW, pageH).fill(c.sidebarBg || '#1e293b');

  // Render left column content
  doc.y = startY;
  (leftCell.children || []).forEach(n => renderNodeInColumn(doc, n, ctx, innerMargin, leftColW - innerMargin * 2, true));
  const leftEndY = doc.y;

  // Render right column content
  doc.y = startY;
  (rightCell.children || []).forEach(n => renderNodeInColumn(doc, n, ctx, rightX, rightW, false));
  const rightEndY = doc.y;

  doc.y = Math.max(leftEndY, rightEndY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Async DOCX-first PDF builder — generates DOCX, converts to HTML, renders PDF
// ─────────────────────────────────────────────────────────────────────────────

async function buildResumePdf(parsed = {}, tailored = null, templateKey = 'classic', limitToOnePage = false) {
  const style = getTemplate(templateKey);
  const layout = style.layout || 'traditional';
  const s = style.pdf;
  const c = s.colors;

  // 1. Generate DOCX (source of truth)
  const docxBuffer = await buildResumeDocx(parsed, tailored, templateKey, limitToOnePage);

  // 2. Convert DOCX → HTML via mammoth
  const { value: html } = await mammoth.convertToHtml({ buffer: docxBuffer });

  // 3. Render HTML → PDF
  const headingFont = resolvePdfFont(s.headingFont || s.font, true);
  const bodyFont = resolvePdfFont(s.font, false);

  const margin = s.margin || 50;
  const leftMargin = (layout === 'sidebar' || layout === 'header-band' || layout === 'accent-strip') ? 0 : margin;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: leftMargin, bottom: margin, left: leftMargin, right: margin },
      autoFirstPage: true,
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Accent strip: draw vertical bar before content
    if (layout === 'accent-strip') {
      const barW = s.accentBarWidth || 6;
      doc.rect(0, 0, barW, doc.page.height).fill(c.accentBar || c.accent || '#7c3aed');
    }

    const tree = buildHtmlTree(parseHtmlTokens(html));
    const pageMarginLeft = (layout === 'accent-strip') ? (margin + (s.accentBarWidth || 6) + 4) : margin;
    const pageMarginRight = margin;

    const ctx = {
      style,
      headingFont,
      bodyFont,
      pageMarginLeft,
      pageMarginRight,
      tableIndex: 0,
    };

    // Set initial cursor position
    if (layout !== 'sidebar' && layout !== 'header-band' && layout !== 'accent-strip') {
      doc.x = pageMarginLeft;
      doc.y = margin;
    } else {
      doc.x = 0;
      doc.y = 0;
    }

    for (const node of (tree.children || [])) {
      renderHtmlNodeToPdf(doc, node, ctx);
    }

    doc.end();
  });
}

// Build PDF cover letter (mirrors DOCX layout/colors)
function buildCoverPdf(doc, parsed = {}, templateKey = 'classic', cover = {}, limitToOnePage = false) {
  const style = getTemplate(templateKey);
  const headingFont = resolvePdfFont(style.pdf.headingFont || style.pdf.font, true);
  const bodyFont = resolvePdfFont(style.pdf.font, false);
  const layout = style.layout || 'traditional';
  const titleAlign = (layout === 'centered' || layout === 'formal' || layout === 'minimalist' || layout === 'minimal') ? 'center' : 'left';

  const name = parsed.name || 'Your Name';
  const contact = [parsed.email, parsed.phone, parsed.location].filter(Boolean).join(' · ');

  // Header
  doc.font(headingFont).fontSize(style.pdf.titleSize).fillColor(style.docx?.titleColor ? `#${style.docx.titleColor}` : style.pdf.titleColor).text(name, { align: titleAlign });
  if (contact) {
    doc.moveDown(0.18);
    doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.contactColor ? `#${style.docx.contactColor}` : style.pdf.contactColor).text(contact, { align: titleAlign });
  }

  doc.moveDown(0.3);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor(style.docx?.accentColor ? `#${style.docx.accentColor}` : style.pdf.accentColor).lineWidth(0.5).stroke();
  doc.moveDown(style.pdf.sectionGap);

  // Date
  const dateText = cover.date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(dateText);
  doc.moveDown(0.3);

  // Recipient block
  [cover.recipientName, cover.recipientTitle, cover.company, cover.address1, cover.address2]
    .filter(Boolean)
    .forEach(line => { doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(line); });
  doc.moveDown(style.pdf.sectionGap);

  // Greeting
  doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(cover.greeting || 'Dear Hiring Manager,');
  doc.moveDown(0.4);

  // Body paragraphs
  const body = (cover.body || '').trim();
  if (body.length > 0) {
    // Replace escaped newlines (\n) with actual newlines, then split by newlines
    const cleanedBody = body.replace(/\\n/g, '\n');
    cleanedBody.split(/\n+/).filter(p => p.trim().length > 0).forEach(p => { doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(p.trim(), { lineGap: style.pdf.lineGap }); doc.moveDown(0.2); });
  } else if (parsed.summary) {
    doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(parsed.summary, { lineGap: style.pdf.lineGap });
  }

  // Closing
  doc.moveDown(0.6);
  doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(cover.closing || 'Sincerely,');
  doc.moveDown(0.4);
  doc.font(headingFont).fontSize(style.pdf.subheadingSize).fillColor(style.docx?.headingColor ? `#${style.docx.headingColor}` : style.pdf.headingColor).text(parsed.name || 'Your Name');
}

// Build DOCX resume — HTML-first pipeline: renderTemplate → html-to-docx
async function buildResumeDocx(parsed = {}, tailored = null, templateKey = 'classic', limitToOnePage = false) {
  const config = getConfig(templateKey);
  const data = mapToTemplateData(parsed, tailored, limitToOnePage, config);
  const htmlString = renderTemplate(templateKey, data, { inlineCssVars: true });
  return await htmlToDocx(htmlString, null, config.docxExportOptions);
}

// Manual DOCX builder — legacy fallback; uses docx library directly
async function buildResumeDocxManual(parsed = {}, tailored = null, templateKey = 'classic', limitToOnePage = false) {
  const config = getConfig(templateKey);
  const data = mapToTemplateData(parsed, tailored, limitToOnePage, config);
  const children = [];

  // Derive font/size from template CSS vars
  const cssVars = config.cssVars || {};
  const bodyFont = (cssVars['--font-family'] || "'Georgia', serif")
    .replace(/["']/g, '').split(',')[0].trim() || 'Georgia';
  const headingFont = (cssVars['--heading-font'] || "'Impact', sans-serif")
    .replace(/["']/g, '').split(',')[0].trim() || 'Impact';
  const basePt = parseInt(cssVars['--base-font-size'] || '10pt') || 10;
  const baseSz = basePt * 2;  // half-points (docx unit)
  const margins = (config.docxExportOptions && config.docxExportOptions.margins)
    || { top: 1080, bottom: 1440, left: 1440, right: 1440 };
  const tabRight = 12240 - (margins.left || 1440) - (margins.right || 1440);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const addHeading = (text) => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '434343' } },
      children: [new TextRun({ text: text.toUpperCase(), font: headingFont, size: baseSz, color: '434343' })],
    }));
  };

  const addItemRow = (left, right) => {
    const runs = [new TextRun({ text: left || '', font: bodyFont, size: baseSz })];
    if (right) runs.push(new TextRun({ text: '\t' + right, font: bodyFont, size: baseSz }));
    children.push(new Paragraph({
      spacing: { after: 40 },
      tabStops: [{ type: TabStopType.RIGHT, position: tabRight }],
      children: runs,
    }));
  };

  const addSubtitle = (text) => {
    if (!text) return;
    children.push(new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text, font: bodyFont, size: Math.round(baseSz * 0.85), italics: true })],
    }));
  };

  const addParagraph = (text, italic = false) => {
    if (!text) return;
    children.push(new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text, font: bodyFont, size: baseSz, italics: italic })],
    }));
  };

  const addBullet = (text) => {
    if (!text) return;
    children.push(new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 60 },
      children: [new TextRun({ text, font: bodyFont, size: baseSz })],
    }));
  };

  // ── Name + contact ────────────────────────────────────────────────────────
  if (data.personalInfo.fullName) {
    children.push(new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 80 },
      children: [new TextRun({ text: data.personalInfo.fullName.toUpperCase(), font: headingFont, size: 36 })],
    }));
  }
  if (data.personalInfo.contact) {
    children.push(new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: data.personalInfo.contact, font: bodyFont, size: Math.round(baseSz * 0.9) })],
    }));
  }

  // ── Sections ─────────────────────────────────────────────────────────────
  for (const sectionKey of data.activeSections) {
    switch (sectionKey) {
      case 'objective':
        addHeading(config.sectionLabels.objective || 'Objective');
        addParagraph(data.personalInfo.objective, true);
        break;

      case 'skills':
        addHeading(config.sectionLabels.skills || 'Technical Skills');
        if (data.skillsGrouped && Object.keys(data.skillsGrouped).length > 0) {
          for (const [cat, skills] of Object.entries(data.skillsGrouped)) {
            if (Array.isArray(skills) && skills.length > 0) {
              children.push(new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({ text: cat + ': ', font: bodyFont, size: baseSz, bold: true }),
                  new TextRun({ text: skills.join(', '), font: bodyFont, size: baseSz }),
                ],
              }));
            }
          }
        } else if (data.technicalSkills.length > 0) {
          addParagraph(data.technicalSkills.join(', '));
        }
        break;

      case 'education':
        addHeading(config.sectionLabels.education || 'Education');
        for (const edu of data.education) {
          addItemRow(edu.institution, edu.dateRange);
          addSubtitle(edu.degree);
        }
        break;

      case 'experience':
        addHeading(config.sectionLabels.experience || 'Experience');
        for (const exp of data.experience) {
          addItemRow(exp.company, exp.dateRange);
          addSubtitle(exp.role);
          for (const b of exp.bulletPoints) addBullet(b);
        }
        break;

      case 'projects':
        addHeading(config.sectionLabels.projects || 'Academic Projects');
        for (const p of data.academicProjects) {
          const tech = p.technologies && p.technologies.length > 0
            ? ' (' + p.technologies.join(', ') + ')' : '';
          children.push(new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 60 },
            children: [
              new TextRun({ text: (p.title || '') + ': ', font: bodyFont, size: baseSz, bold: true }),
              new TextRun({ text: (p.description || '') + tech, font: bodyFont, size: baseSz }),
            ],
          }));
        }
        break;

      case 'certifications':
        addHeading(config.sectionLabels.certifications || 'Certifications');
        for (const c of data.certifications) {
          addBullet([c.name, c.issuer, c.date].filter(Boolean).join(' \u2014 '));
        }
        break;

      case 'awards':
        addHeading(config.sectionLabels.awards || 'Awards & Honors');
        for (const a of data.awards) {
          addBullet([a.title, a.issuer, a.date].filter(Boolean).join(' \u2014 '));
        }
        break;

      case 'languages':
        addHeading(config.sectionLabels.languages || 'Languages');
        addParagraph(data.languages.join(', '));
        break;
    }
  }

  const doc = new Document({
    sections: [{ properties: { page: { margin: margins } }, children }],
  });
  return Packer.toBuffer(doc);
}

// Legacy DOCX builder — kept for reference; uses docx library directly
async function buildResumeDocxLegacy(parsed = {}, tailored = null, templateKey = 'classic', limitToOnePage = false) {
  const style = getTemplate(templateKey);
  const layout = style.layout || 'traditional';
  const dc = style.docx;
  const sp = dc.spacing || {};

  // Adjusted spacing for one-page mode
  const spacing = limitToOnePage ? {
    titleAfter:    Math.floor((sp.titleAfter    || 140) * 0.7),
    contactAfter:  Math.floor((sp.contactAfter  || 200) * 0.7),
    headingBefore: Math.floor((sp.headingBefore || 200) * 0.6),
    headingAfter:  Math.floor((sp.headingAfter  || 110) * 0.6),
    bodyAfter:     Math.floor((sp.bodyAfter     || 115) * 0.6),
    bulletSpacing: Math.floor((sp.bulletSpacing ||  85) * 0.6),
  } : {
    titleAfter:    sp.titleAfter    || 140,
    contactAfter:  sp.contactAfter  || 200,
    headingBefore: sp.headingBefore || 200,
    headingAfter:  sp.headingAfter  || 110,
    bodyAfter:     sp.bodyAfter     || 115,
    bulletSpacing: sp.bulletSpacing ||  85,
  };

  const name = parsed.name || 'Resume';
  const contactParts = [parsed.email, parsed.phone, parsed.location].filter(Boolean);
  if (parsed.links) {
    if (parsed.links.linkedin) contactParts.push(parsed.links.linkedin);
    else if (parsed.links.github) contactParts.push(parsed.links.github);
    else if (parsed.links.portfolio) contactParts.push(parsed.links.portfolio);
  }
  const contact = contactParts.join(' \u00B7 ');

  const isCentered = layout === 'centered';
  const titleAlign = isCentered ? AlignmentType.CENTER : AlignmentType.LEFT;
  const headingAlign = AlignmentType.LEFT;

  const titleSizeDocx = Math.round(style.pdf.titleSize * 2);
  const headingSizeDocx = Math.round(style.pdf.headingSize * 2);
  const subheadingSizeDocx = Math.round((style.pdf.subheadingSize || style.pdf.headingSize) * 2);
  const bodySizeDocx = Math.round(style.pdf.bodySize * 2);
  const smallSizeDocx = Math.round((style.pdf.smallSize || style.pdf.bodySize - 1) * 2);

  const shs = style.sectionHeadingStyle || 'rule-below';
  const colors = dc.colors || {};

  // ── DOCX helper functions ─────────────────────────────────────────────────

  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'auto' };
  const allNoBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  // Build a heading paragraph with decoration based on sectionHeadingStyle
  const makeHeadingParagraph = (text, targetChildren) => {
    const displayText = (shs === 'uppercase-rule' || isCentered) ? text.toUpperCase() : text;
    const underline = shs === 'underline' ? { type: UnderlineType.SINGLE } : undefined;
    const para = new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: spacing.headingBefore, after: spacing.headingAfter },
      alignment: headingAlign,
      border: shs === 'left-accent' ? {
        left: { style: BorderStyle.THICK, size: 18, color: colors.accent || '1e40af' }
      } : undefined,
      children: [new TextRun({
        text: displayText,
        font: dc.headingFont || dc.font || 'Calibri',
        bold: true,
        size: headingSizeDocx,
        underline,
        color: colors.heading || undefined,
      })],
    });
    targetChildren.push(para);
  };

  const makeSubheadingParagraph = (text, targetChildren) => {
    if (!text) return;
    targetChildren.push(new Paragraph({
      spacing: { before: limitToOnePage ? 60 : 100, after: limitToOnePage ? 40 : 60 },
      children: [new TextRun({
        text,
        font: dc.headingFont || dc.font || 'Calibri',
        bold: true,
        size: subheadingSizeDocx,
        color: colors.heading || undefined,
      })],
    }));
  };

  const makeBulletParagraph = (text, targetChildren) => {
    if (!text) return;
    targetChildren.push(new Paragraph({
      bullet: { level: 0 },
      spacing: { after: spacing.bulletSpacing },
      children: [new TextRun({ text, font: dc.font || 'Calibri', size: bodySizeDocx, color: colors.body || undefined })],
    }));
  };

  const makeTextParagraph = (text, targetChildren, spacingAfter = spacing.bodyAfter) => {
    if (!text) return;
    targetChildren.push(new Paragraph({
      spacing: { after: spacingAfter },
      children: [new TextRun({ text, font: dc.font || 'Calibri', size: bodySizeDocx, color: colors.body || undefined })],
    }));
  };

  const makeSmallTextParagraph = (text, targetChildren, spacingAfter = spacing.bodyAfter) => {
    if (!text) return;
    targetChildren.push(new Paragraph({
      spacing: { after: spacingAfter },
      children: [new TextRun({ text, font: dc.font || 'Calibri', size: smallSizeDocx, color: colors.meta || '777777' })],
    }));
  };

  // ── Section content builder (populates an array of Paragraphs) ───────────

  const buildSectionContent = (targetChildren) => {
    const renderSummary = () => {
      const summary = tailored?.tailored_summary || parsed.summary;
      if (!summary) return;
      makeHeadingParagraph('Summary', targetChildren);
      makeTextParagraph(summary, targetChildren);
    };

    const renderSkills = () => {
      const grouped = tailored?.skills_grouped;
      const flat = (tailored?.target_skills?.length > 0) ? tailored.target_skills : (parsed.skills || []);
      if (grouped && typeof grouped === 'object' && Object.keys(grouped).length > 0) {
        makeHeadingParagraph('Skills', targetChildren);
        Object.entries(grouped).forEach(([groupName, skills]) => {
          if (!Array.isArray(skills) || skills.length === 0) return;
          targetChildren.push(new Paragraph({
            spacing: { after: Math.round(spacing.bodyAfter * 0.7) },
            children: [
              new TextRun({ text: groupName + ': ', font: dc.headingFont || dc.font || 'Calibri', bold: true, size: bodySizeDocx, color: colors.heading || undefined }),
              new TextRun({ text: skills.join(', '), font: dc.font || 'Calibri', size: bodySizeDocx, color: colors.body || undefined }),
            ],
          }));
        });
      } else if (flat.length > 0) {
        makeHeadingParagraph('Skills', targetChildren);
        makeTextParagraph(Array.isArray(flat) ? flat.join(', ') : flat, targetChildren);
      }
    };

    const renderEducation = () => {
      if (!parsed.education || !Array.isArray(parsed.education) || parsed.education.length === 0) return;
      makeHeadingParagraph('Education', targetChildren);
      parsed.education.forEach((edu) => {
        if (!edu || typeof edu !== 'object') return;
        const heading = [edu.degree, edu.field].filter(Boolean).join(' in ');
        if (heading) makeSubheadingParagraph(heading, targetChildren);
        if (edu.school) makeTextParagraph(edu.school, targetChildren, 80);
        const eduMeta = [edu.dates, edu.gpa ? `GPA: ${edu.gpa}` : null].filter(Boolean).join('  \u00B7  ');
        if (eduMeta) makeSmallTextParagraph(eduMeta, targetChildren);
      });
    };

    const renderExperience = () => {
      const expList = (tailored?.tailored_experience?.length > 0) ? tailored.tailored_experience : (parsed.experience || []);
      if (!Array.isArray(expList) || expList.length === 0) return;
      makeHeadingParagraph('Experience', targetChildren);
      const itemsToShow = limitToOnePage ? expList.slice(0, 3) : expList;
      itemsToShow.forEach((exp) => {
        if (!exp || typeof exp !== 'object') return;
        const title = exp.role || exp.title || '';
        const company = exp.company || '';
        const heading = [title, company].filter(Boolean).join(' at ');
        if (heading) makeSubheadingParagraph(heading, targetChildren);
        if (exp.dates) makeSmallTextParagraph(exp.dates, targetChildren, limitToOnePage ? 40 : 80);
        if (Array.isArray(exp.bullets) && exp.bullets.length > 0) {
          const bulletsToShow = limitToOnePage ? exp.bullets.slice(0, 2) : exp.bullets;
          bulletsToShow.forEach((b) => makeBulletParagraph(b, targetChildren));
        } else if (exp.description) {
          makeTextParagraph(exp.description, targetChildren, limitToOnePage ? 60 : 100);
        }
      });
    };

    const renderProjects = () => {
      if (limitToOnePage) return;
      const projects = (tailored?.tailored_projects?.length > 0) ? tailored.tailored_projects : (parsed.projects || []);
      if (!Array.isArray(projects) || projects.length === 0) return;
      makeHeadingParagraph('Projects', targetChildren);
      projects.forEach((p) => {
        if (!p || typeof p !== 'object') return;
        const heading = [p.name, p.organization].filter(Boolean).join(' \u2014 ');
        if (heading) makeSubheadingParagraph(heading, targetChildren);
        if (p.dates) makeSmallTextParagraph(p.dates, targetChildren, 80);
        if (p.description) makeTextParagraph(p.description, targetChildren, 100);
        if (Array.isArray(p.technologies) && p.technologies.length > 0) {
          targetChildren.push(new Paragraph({
            spacing: { after: spacing.bodyAfter },
            children: [
              new TextRun({ text: 'Technologies: ', font: dc.font || 'Calibri', size: bodySizeDocx, bold: true, color: colors.body || undefined }),
              new TextRun({ text: p.technologies.join(', '), font: dc.font || 'Calibri', size: bodySizeDocx, color: colors.body || undefined }),
            ],
          }));
        }
      });
    };

    const renderCertifications = () => {
      if (!parsed.certifications || !Array.isArray(parsed.certifications) || parsed.certifications.length === 0) return;
      makeHeadingParagraph('Certifications', targetChildren);
      parsed.certifications.forEach((cert) => {
        const parts = [cert.name, cert.issuer, cert.date].filter(Boolean);
        if (parts.length > 0) makeTextParagraph(parts.join(' \u2014 '), targetChildren);
      });
    };

    const renderAwards = () => {
      if (!parsed.awards || !Array.isArray(parsed.awards) || parsed.awards.length === 0) return;
      makeHeadingParagraph('Awards & Honors', targetChildren);
      parsed.awards.forEach((award) => {
        const parts = [award.title, award.issuer, award.date].filter(Boolean);
        if (parts.length > 0) makeTextParagraph(parts.join(' \u2014 '), targetChildren);
      });
    };

    const defaultSections = ['summary', 'skills', 'education', 'experience', 'projects'];
    const sectionOrder = (tailored?.sections && Array.isArray(tailored.sections) && tailored.sections.length > 0)
      ? tailored.sections : defaultSections;
    const renderers = { summary: renderSummary, skills: renderSkills, education: renderEducation, experience: renderExperience, projects: renderProjects, certifications: renderCertifications, awards: renderAwards };
    for (const section of sectionOrder) { if (renderers[section]) renderers[section](); }
    if (!sectionOrder.includes('certifications')) renderCertifications();
    if (!sectionOrder.includes('awards')) renderAwards();
  };

  // ── Build Document based on layout ────────────────────────────────────────

  let docxSections;
  const docxMargins = dc.margins || { top: 720, bottom: 720, left: 720, right: 720 };

  if (layout === 'sidebar') {
    // ── Sidebar: Table with left dark col + right main col ──────────────────
    const leftColPct = dc.leftColPct || 30;
    const rightColPct = 100 - leftColPct;

    // Left column: name + contact + skills
    const leftChildren = [];
    leftChildren.push(new Paragraph({
      spacing: { after: spacing.titleAfter },
      children: [new TextRun({ text: name, font: dc.headingFont || dc.font || 'Calibri', bold: true, size: titleSizeDocx, color: colors.sidebarTitle || 'ffffff' })],
    }));
    if (contact) {
      leftChildren.push(new Paragraph({
        spacing: { after: spacing.contactAfter },
        children: [new TextRun({ text: contact, font: dc.font || 'Calibri', size: smallSizeDocx, color: colors.sidebarBody || 'e2e8f0' })],
      }));
    }
    // Skills always in sidebar
    const skillsGrouped = tailored?.skills_grouped;
    const skillsFlat = (tailored?.target_skills?.length > 0) ? tailored.target_skills : (parsed.skills || []);
    leftChildren.push(new Paragraph({
      spacing: { before: spacing.headingBefore, after: spacing.headingAfter },
      children: [new TextRun({ text: 'Skills', font: dc.headingFont || dc.font || 'Calibri', bold: true, size: headingSizeDocx, color: colors.sidebarHeading || '94a3b8' })],
    }));
    if (skillsGrouped && typeof skillsGrouped === 'object' && Object.keys(skillsGrouped).length > 0) {
      Object.entries(skillsGrouped).forEach(([groupName, skills]) => {
        if (!Array.isArray(skills) || skills.length === 0) return;
        leftChildren.push(new Paragraph({
          spacing: { after: Math.round(spacing.bodyAfter * 0.6) },
          children: [
            new TextRun({ text: groupName + ': ', font: dc.headingFont || dc.font || 'Calibri', bold: true, size: bodySizeDocx, color: colors.sidebarHeading || '94a3b8' }),
            new TextRun({ text: skills.join(', '), font: dc.font || 'Calibri', size: bodySizeDocx, color: colors.sidebarBody || 'e2e8f0' }),
          ],
        }));
      });
    } else if (skillsFlat.length > 0) {
      leftChildren.push(new Paragraph({
        spacing: { after: spacing.bodyAfter },
        children: [new TextRun({ text: skillsFlat.join(', '), font: dc.font || 'Calibri', size: bodySizeDocx, color: colors.sidebarBody || 'e2e8f0' })],
      }));
    }

    // Right column: all other sections
    const rightChildren = [];
    const sidebarDefaultSections = ['summary', 'experience', 'education', 'projects'];
    const sectionOrder = (tailored?.sections && Array.isArray(tailored.sections) && tailored.sections.length > 0)
      ? tailored.sections.filter(s => s !== 'skills') : sidebarDefaultSections;
    const tempChildren = [];
    buildSectionContent(tempChildren);
    // Filter out skills-related headings from tempChildren (already in sidebar)
    // We just push all since the sidebar section order omits skills
    rightChildren.push(...tempChildren.filter((p, i) => {
      // A rough heuristic: keep all paragraphs since the right column's buildSectionContent
      // already skips skills when we pass a custom sectionOrder — but buildSectionContent
      // uses its own internal sectionOrder, so we rebuild right-side only:
      return true;
    }));
    // Actually rebuild right side without skills:
    rightChildren.length = 0;
    const rightSectionOrder = (tailored?.sections && Array.isArray(tailored.sections) && tailored.sections.length > 0)
      ? tailored.sections.filter(s => s !== 'skills')
      : ['summary', 'experience', 'education', 'projects', 'certifications', 'awards'];

    const expList2 = (tailored?.tailored_experience?.length > 0) ? tailored.tailored_experience : (parsed.experience || []);
    if (expList2.length > 0 || parsed.summary) {
      // Build right side content manually using same helpers but targeting rightChildren
      buildSectionContentForTarget(rightChildren, parsed, tailored, limitToOnePage, style, spacing, rightSectionOrder, makeHeadingParagraph, makeSubheadingParagraph, makeTextParagraph, makeSmallTextParagraph, makeBulletParagraph, bodySizeDocx, dc, colors);
    }

    const sidebarTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: leftColPct, type: WidthType.PERCENTAGE },
            shading: { fill: colors.sidebarBg || '1e293b', type: ShadingType.CLEAR, color: 'auto' },
            borders: allNoBorders,
            children: leftChildren.length > 0 ? leftChildren : [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: rightColPct, type: WidthType.PERCENTAGE },
            borders: allNoBorders,
            children: rightChildren.length > 0 ? rightChildren : [new Paragraph({ children: [] })],
          }),
        ],
      })],
    });

    docxSections = [{ properties: { page: { margin: docxMargins } }, children: [sidebarTable] }];

  } else if (layout === 'header-band') {
    // ── Header Band: dark band table + body paragraphs ──────────────────────
    const bandTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({
        children: [new TableCell({
          shading: { fill: colors.headerBand || '111827', type: ShadingType.CLEAR, color: 'auto' },
          borders: allNoBorders,
          children: [
            new Paragraph({
              spacing: { before: 120, after: 60 },
              children: [new TextRun({ text: name, font: dc.headingFont || dc.font || 'Calibri', bold: true, size: titleSizeDocx, color: 'ffffff' })],
            }),
            ...(contact ? [new Paragraph({
              spacing: { after: 120 },
              children: [new TextRun({ text: contact, font: dc.font || 'Calibri', size: smallSizeDocx, color: 'D1D5DB' })],
            })] : []),
          ],
        })],
      })],
    });

    const bodyChildren = [];
    buildSectionContent(bodyChildren);
    docxSections = [{ properties: { page: { margin: docxMargins } }, children: [bandTable, ...bodyChildren] }];

  } else if (layout === 'accent-strip') {
    // ── Accent Strip: thin color bar (left col) + all content (right col) ───
    const accentColPct = dc.accentColPct || 3;
    const contentColPct = 100 - accentColPct;

    const contentChildren = [];
    // Header
    contentChildren.push(new Paragraph({
      spacing: { after: spacing.titleAfter },
      children: [new TextRun({ text: name, font: dc.headingFont || dc.font || 'Calibri', bold: true, size: titleSizeDocx, color: colors.title || '1f2937' })],
    }));
    if (contact) {
      contentChildren.push(new Paragraph({
        spacing: { after: spacing.contactAfter },
        children: [new TextRun({ text: contact, font: dc.font || 'Calibri', size: bodySizeDocx, color: colors.meta || '6b7280' })],
      }));
    }
    buildSectionContent(contentChildren);

    const accentTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: accentColPct, type: WidthType.PERCENTAGE },
            shading: { fill: colors.accentBar || colors.accent || '7c3aed', type: ShadingType.CLEAR, color: 'auto' },
            borders: allNoBorders,
            children: [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: contentColPct, type: WidthType.PERCENTAGE },
            borders: allNoBorders,
            children: contentChildren,
          }),
        ],
      })],
    });

    docxSections = [{ properties: { page: { margin: docxMargins } }, children: [accentTable] }];

  } else {
    // ── Traditional / Centered / Compact ─────────────────────────────────────
    const mainChildren = [];

    // Header
    mainChildren.push(new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: spacing.titleAfter },
      alignment: titleAlign,
      children: [new TextRun({ text: name, font: dc.headingFont || dc.font || 'Calibri', bold: true, size: titleSizeDocx, color: colors.title || undefined })],
    }));
    if (contact) {
      mainChildren.push(new Paragraph({
        spacing: { after: spacing.contactAfter },
        alignment: titleAlign,
        children: [new TextRun({ text: contact, font: dc.font || 'Calibri', size: bodySizeDocx, color: colors.meta || undefined })],
      }));
    }

    buildSectionContent(mainChildren);
    docxSections = [{ properties: { page: { margin: docxMargins } }, children: mainChildren }];
  }

  const doc = new Document({ sections: docxSections });
  return Packer.toBuffer(doc);
}

// Helper for sidebar right-column content (avoids skills, uses custom section order)
function buildSectionContentForTarget(
  targetChildren, parsed, tailored, limitToOnePage, style, spacing,
  sectionOrder, makeHeadingParagraph, makeSubheadingParagraph, makeTextParagraph,
  makeSmallTextParagraph, makeBulletParagraph, bodySizeDocx, dc, colors
) {
  const renderSummary = () => {
    const summary = tailored?.tailored_summary || parsed.summary;
    if (!summary) return;
    makeHeadingParagraph('Summary', targetChildren);
    makeTextParagraph(summary, targetChildren);
  };
  const renderEducation = () => {
    if (!parsed.education || !Array.isArray(parsed.education) || parsed.education.length === 0) return;
    makeHeadingParagraph('Education', targetChildren);
    parsed.education.forEach((edu) => {
      if (!edu || typeof edu !== 'object') return;
      const heading = [edu.degree, edu.field].filter(Boolean).join(' in ');
      if (heading) makeSubheadingParagraph(heading, targetChildren);
      if (edu.school) makeTextParagraph(edu.school, targetChildren, 80);
      const eduMeta = [edu.dates, edu.gpa ? `GPA: ${edu.gpa}` : null].filter(Boolean).join('  \u00B7  ');
      if (eduMeta) makeSmallTextParagraph(eduMeta, targetChildren);
    });
  };
  const renderExperience = () => {
    const expList = (tailored?.tailored_experience?.length > 0) ? tailored.tailored_experience : (parsed.experience || []);
    if (!Array.isArray(expList) || expList.length === 0) return;
    makeHeadingParagraph('Experience', targetChildren);
    const itemsToShow = limitToOnePage ? expList.slice(0, 3) : expList;
    itemsToShow.forEach((exp) => {
      if (!exp || typeof exp !== 'object') return;
      const title = exp.role || exp.title || '';
      const company = exp.company || '';
      const heading = [title, company].filter(Boolean).join(' at ');
      if (heading) makeSubheadingParagraph(heading, targetChildren);
      if (exp.dates) makeSmallTextParagraph(exp.dates, targetChildren, limitToOnePage ? 40 : 80);
      if (Array.isArray(exp.bullets) && exp.bullets.length > 0) {
        const bulletsToShow = limitToOnePage ? exp.bullets.slice(0, 2) : exp.bullets;
        bulletsToShow.forEach((b) => makeBulletParagraph(b, targetChildren));
      } else if (exp.description) {
        makeTextParagraph(exp.description, targetChildren, limitToOnePage ? 60 : 100);
      }
    });
  };
  const renderProjects = () => {
    if (limitToOnePage) return;
    const projects = (tailored?.tailored_projects?.length > 0) ? tailored.tailored_projects : (parsed.projects || []);
    if (!Array.isArray(projects) || projects.length === 0) return;
    makeHeadingParagraph('Projects', targetChildren);
    projects.forEach((p) => {
      if (!p || typeof p !== 'object') return;
      const heading = [p.name, p.organization].filter(Boolean).join(' \u2014 ');
      if (heading) makeSubheadingParagraph(heading, targetChildren);
      if (p.dates) makeSmallTextParagraph(p.dates, targetChildren, 80);
      if (p.description) makeTextParagraph(p.description, targetChildren, 100);
      if (Array.isArray(p.technologies) && p.technologies.length > 0) {
        targetChildren.push(new Paragraph({
          spacing: { after: spacing.bodyAfter },
          children: [
            new TextRun({ text: 'Technologies: ', font: dc.font || 'Calibri', size: bodySizeDocx, bold: true, color: colors.body || undefined }),
            new TextRun({ text: p.technologies.join(', '), font: dc.font || 'Calibri', size: bodySizeDocx, color: colors.body || undefined }),
          ],
        }));
      }
    });
  };
  const renderCertifications = () => {
    if (!parsed.certifications || !Array.isArray(parsed.certifications) || parsed.certifications.length === 0) return;
    makeHeadingParagraph('Certifications', targetChildren);
    parsed.certifications.forEach((cert) => {
      const parts = [cert.name, cert.issuer, cert.date].filter(Boolean);
      if (parts.length > 0) makeTextParagraph(parts.join(' \u2014 '), targetChildren);
    });
  };
  const renderAwards = () => {
    if (!parsed.awards || !Array.isArray(parsed.awards) || parsed.awards.length === 0) return;
    makeHeadingParagraph('Awards & Honors', targetChildren);
    parsed.awards.forEach((award) => {
      const parts = [award.title, award.issuer, award.date].filter(Boolean);
      if (parts.length > 0) makeTextParagraph(parts.join(' \u2014 '), targetChildren);
    });
  };
  const renderers2 = { summary: renderSummary, education: renderEducation, experience: renderExperience, projects: renderProjects, certifications: renderCertifications, awards: renderAwards };
  for (const section of sectionOrder) { if (renderers2[section]) renderers2[section](); }
  if (!sectionOrder.includes('certifications')) renderCertifications();
  if (!sectionOrder.includes('awards')) renderAwards();
}

// Build DOCX cover letter
async function buildCoverDocx(parsed = {}, templateKey = 'classic', cover = {}, limitToOnePage = false) {
  const style = getTemplate(templateKey);
  const layout = style.layout || 'traditional';
  const children = [];

  const name = parsed.name || 'Your Name';
  const contact = [parsed.email, parsed.phone, parsed.location].filter(Boolean).join(' · ');
  const titleAlignment = (layout === 'centered' || layout === 'formal' || layout === 'minimalist' || layout === 'minimal' || layout === 'high-contrast' || layout === 'block-headers') ? AlignmentType.CENTER : AlignmentType.LEFT;

  const titleSizeDocx = Math.round(style.pdf.titleSize * 2);
  const bodySizeDocx = Math.round(style.pdf.bodySize * 2);

  // Adjust spacing for one-page constraint
  const spacing = limitToOnePage ? {
    titleAfter: style.docx.titleAfter ? Math.floor(style.docx.titleAfter * 0.6) : 60,
    contactAfter: style.docx.contactAfter ? Math.floor(style.docx.contactAfter * 0.6) : 60,
    bodyAfter: style.docx.bodyAfter ? Math.floor(style.docx.bodyAfter * 0.6) : 60,
  } : style.docx;

  const addText = (text, spacingAfter = spacing.bodyAfter) => {
    if (!text) return;
    children.push(new Paragraph({
      spacing: { after: spacingAfter },
      children: [new TextRun({ text, font: style.docx.font || 'Calibri', size: bodySizeDocx, color: style.docx.bodyColor || undefined })],
    }));
  };

  // Header
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: spacing.titleAfter },
    alignment: titleAlignment,
    children: [new TextRun({ text: name, font: style.docx.headingFont || style.docx.font || 'Calibri', bold: true, size: titleSizeDocx, color: style.docx.titleColor || undefined })],
  }));
  if (contact) {
    children.push(new Paragraph({ spacing: { after: spacing.contactAfter }, alignment: titleAlignment, children: [new TextRun({ text: contact, font: style.docx.font || 'Calibri', size: bodySizeDocx, color: style.docx.contactColor || undefined })] }));
  }

  // Date
  const dateText = cover.date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  addText(dateText, spacing.bodyAfter);

  // Recipient block
  const recipientLines = [cover.recipientName, cover.recipientTitle, cover.company, cover.address1, cover.address2].filter(Boolean);
  recipientLines.forEach(line => addText(line, limitToOnePage ? 40 : 80));

  // Greeting
  addText(cover.greeting || 'Dear Hiring Manager,', spacing.bodyAfter);

  // Body paragraphs
  const body = (cover.body || '').trim();
  if (body.length > 0) {
    // Replace escaped newlines (\n) with actual newlines, then split by newlines
    const cleanedBody = body.replace(/\\n/g, '\n');
    cleanedBody.split(/\n+/).filter(p => p.trim().length > 0).forEach(p => addText(p.trim(), spacing.bodyAfter));
  } else if (parsed.summary) {
    addText(parsed.summary, spacing.bodyAfter);
  }

  // Closing
  addText(cover.closing || 'Sincerely,', limitToOnePage ? 80 : 120);
  addText(name, spacing.bodyAfter);

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// Helper: Check and handle subscription expiry
async function checkAndHandleSubscriptionExpiry(user, now = getAppNow()) {
  if (!user) return;

  const subscription = await Subscription.findOne({
    where: { userId: user.id },
    order: [['createdAt', 'DESC']],
  });

  if (!subscription) return;

  const usageMetrics = await UsageMetrics.findOne({ 
    where: { userId: user.id },
    order: [['createdAt', 'DESC']],
  });

  // For monthly subscriptions, use the new reliable expiry checker
  if (subscription.tier === 'monthly') {
    // First, try to advance if it's still active
    if (subscription.status === 'active') {
      await advanceMonthlySubscriptionIfNeeded(subscription, usageMetrics, now);
    }
    // Then check if it's expired (covers both canceled and active cases)
    await checkAndExpireMonthlyIfNeeded(subscription, usageMetrics, now);
    return;
  }

  // For one-time subscriptions, delegate to the centralized expiry helper
  if (subscription.tier === 'one-time') {
    await checkAndExpireOneTimeIfNeeded(subscription, usageMetrics, user, now);
  }
}

// Helper: Apply one-time bonus for monthly users (and expire when needed)
async function applyMonthlyBonus(user, usageMetrics) {
  if (!user || !usageMetrics) return usageMetrics;
  if (user.tier !== 'monthly') return usageMetrics;

  const baseLimit = TIER_CONFIG.monthly.generationsLimit || 150;
  const bonus = Math.min(50, usageMetrics.bonusGenerations || 0);
  const bonusExpiry = usageMetrics.bonusExpiresAt ? new Date(usageMetrics.bonusExpiresAt) : null;
  const now = getAppNow();

  if (bonus > 0 && bonusExpiry && bonusExpiry < now) {
    usageMetrics.bonusGenerations = 0;
    usageMetrics.bonusExpiresAt = null;
    usageMetrics.generationsLimit = baseLimit;
    await usageMetrics.save();
    return usageMetrics;
  }

  if (usageMetrics.bonusGenerations !== bonus) {
    usageMetrics.bonusGenerations = bonus;
  }

  if (usageMetrics.generationsLimit !== baseLimit) {
    usageMetrics.generationsLimit = baseLimit;
  }

  if ((bonus <= 0 || !bonusExpiry) && usageMetrics.bonusGenerations !== 0) {
    usageMetrics.bonusGenerations = 0;
    usageMetrics.bonusExpiresAt = null;
  }

  if (usageMetrics.changed()) {
    await usageMetrics.save();
  }

  return usageMetrics;
}

// Upload and parse endpoint
app.post('/api/upload', optionalAuthMiddleware, upload.single('resume'), async (req, res) => {
  let filePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check user tier and usage limits
    let user = null;
    let usageMetrics = null;
    let anonymousUsage = null;
    let isAnonymous = !req.userId;

    if (req.userId) {
      // Authenticated user
      user = await User.findByPk(req.userId);
      usageMetrics = await UsageMetrics.findOne({
        where: { userId: req.userId },
        order: [['createdAt', 'DESC']],
      });

      if (!user || !usageMetrics) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check and handle subscription expiry
      await checkAndHandleSubscriptionExpiry(user, getAppNow(req));

      await applyMonthlyBonus(user, usageMetrics);

      // Ensure usage limits match current tier config
      const tierConfig = TIER_CONFIG[user.tier] || TIER_CONFIG['auth-free'] || TIER_CONFIG.free;
      let usageNeedsSave = false;

      if (usageMetrics.generationsLimit !== tierConfig.generationsLimit) {
        usageMetrics.generationsLimit = tierConfig.generationsLimit;
        usageNeedsSave = true;
      }

      if (usageMetrics.maxJobCount !== tierConfig.jobsPerSession) {
        usageMetrics.maxJobCount = tierConfig.jobsPerSession;
        usageNeedsSave = true;
      }

      if (usageMetrics.currentJobCount !== 0) {
        usageMetrics.currentJobCount = 0;
        usageNeedsSave = true;
      }

      if (!usageMetrics.resetDate) {
        usageMetrics.resetDate = new Date();
        usageNeedsSave = true;
      }

      if (usageNeedsSave) {
        await usageMetrics.save();
      }

      // Check if monthly reset is needed for auth-free tier
      if (user.tier === 'auth-free' && usageMetrics.resetDate) {
        const lastReset = new Date(usageMetrics.resetDate);
        const today = getAppNow(req);
        const monthsDiff = (today.getFullYear() - lastReset.getFullYear()) * 12 + (today.getMonth() - lastReset.getMonth());
        
        if (monthsDiff >= 1) {
          // Reset the counter
          console.log(`[/api/upload] Resetting counter for user ${req.userId} due to monthly reset`);
          usageMetrics.generationsUsed = 0;
          usageMetrics.resetDate = getAppNow(req);
          await usageMetrics.save();
        }
      }
    } else {
      // Anonymous user - track by IP
      const ipAddress = getClientIp(req);
      anonymousUsage = await getAnonymousUsage(ipAddress);
      
      usageMetrics = {
        generationsUsed: anonymousUsage.generationsUsed,
        generationsLimit: TIER_CONFIG.free.generationsLimit,
      };
    }

    // Check if user has generations remaining
    const bonusRemaining = user?.tier === 'monthly' ? (usageMetrics.bonusGenerations || 0) : 0;
    const remaining = (usageMetrics.generationsLimit - usageMetrics.generationsUsed) + bonusRemaining;
    if (remaining <= 0) {
      const tier = user?.tier || 'free';
      const resetInfo = isAnonymous ? 'Resets in 24 hours' : 'Sign in with Google for 6 generations per month';
      
      return res.status(402).json({
        error: `Generation limit reached. ${resetInfo}`,
        tier: user?.tier || 'free',
        remaining: 0,
        limit: usageMetrics.generationsLimit,
      });
    }

    const jobDescription = (req.body?.jobDescription || '').trim();
    const limitToOnePage = req.body?.limitToOnePage === 'true' || req.body?.limitToOnePage === true;
    const generateResume = req.body?.generateResume === 'true' || req.body?.generateResume === true;
    const generateCoverLetter = req.body?.generateCoverLetter === 'true' || req.body?.generateCoverLetter === true;

    filePath = req.file.path;
    console.log(`Processing file: ${req.file.originalname}`);
    console.log(`File size: ${req.file.size} bytes`);
    console.log(`File MIME type: ${req.file.mimetype}`);
    console.log(`File path: ${filePath}`);

    // Verify file exists and has content
    if (!fs.existsSync(filePath)) {
      throw new Error(`File was not saved to disk at ${filePath}`);
    }

    const fileStats = fs.statSync(filePath);
    console.log(`File stats - size: ${fileStats.size}, isFile: ${fileStats.isFile()}`);

    if (fileStats.size === 0) {
      throw new Error('Uploaded file is empty (0 bytes). Please upload a valid resume file.');
    }

    // Extract text from the resume
    console.log(`Extracting text from ${req.file.mimetype}...`);
    const resumeText = await extractText(filePath, req.file.mimetype);
    
    if (!resumeText || resumeText.trim().length === 0) {
      throw new Error('Could not extract text from the file. The file may be empty, corrupted, or in an unsupported format.');
    }

    console.log(`Text extracted successfully (${resumeText.length} characters)`);
    console.log('Text extraction complete, sending to Gemini...');

    // Parse with Gemini
    const parsedResume = await parseResumeWithGemini(resumeText);
    console.log('[upload] Gemini parsed — name:', parsedResume?.name || '(empty)', '| email:', parsedResume?.email || '(empty)', '| phone:', parsedResume?.phone || '(empty)');

    let tailoredResume = null;
    let coverLetter = null;
    if (jobDescription.length > 0) {
      // Only tailor resume if generateResume flag is true
      if (generateResume) {
        console.log(`Tailoring resume to job description${limitToOnePage ? ' (one-page limit)' : ''}...`);
        tailoredResume = await tailorResumeWithGemini(parsedResume, jobDescription, limitToOnePage);
      }
      // Only generate cover letter if generateCoverLetter flag is true
      if (generateCoverLetter) {
        console.log(`Generating cover letter${limitToOnePage ? ' (one-page limit)' : ''}...`);
        coverLetter = await generateCoverLetterWithGemini(parsedResume, jobDescription, limitToOnePage);
      }
    }

    console.log('Resume parsed successfully');

    // Delete the uploaded file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Note: Usage counter is incremented in /api/tailor for each job, not here
    // This way each job tailoring counts as 1 generation

    // Normalize the parsed data to a stable schema to protect the UI
    const normalizedParsed = {
      name: parsedResume?.name || '',
      email: parsedResume?.email || '',
      phone: parsedResume?.phone || '',
      location: parsedResume?.location || '',
      summary: parsedResume?.summary || parsedResume?.objective || '',
      objective: parsedResume?.objective || parsedResume?.summary || '',
      // Flatten links object so classicTemplateHtml can read them as top-level fields
      linkedin: parsedResume?.links?.linkedin || parsedResume?.linkedin || '',
      github: parsedResume?.links?.github || parsedResume?.github || '',
      website: parsedResume?.links?.portfolio || parsedResume?.website || '',
      technical_skills: Array.isArray(parsedResume?.skills)
        ? parsedResume.skills.join(', ')
        : (parsedResume?.technical_skills || ''),
      // Preserve arrays if present; otherwise keep as string (or empty)
      education: Array.isArray(parsedResume?.education)
        ? parsedResume.education
        : (typeof parsedResume?.education === 'string' ? parsedResume.education : ''),
      experience: Array.isArray(parsedResume?.experience)
        ? parsedResume.experience
        : (typeof parsedResume?.experience === 'string' ? parsedResume.experience : ''),
      projects: Array.isArray(parsedResume?.projects)
        ? parsedResume.projects
        : (typeof parsedResume?.projects === 'string' ? parsedResume.projects : ''),
      certifications: Array.isArray(parsedResume?.certifications) ? parsedResume.certifications : [],
      awards: Array.isArray(parsedResume?.awards) ? parsedResume.awards : [],
      languages: Array.isArray(parsedResume?.languages) ? parsedResume.languages : [],
      // Provide an array form as well for components that expect it
      skills: Array.isArray(parsedResume?.skills)
        ? parsedResume.skills
        : (typeof parsedResume?.technical_skills === 'string'
            ? parsedResume.technical_skills.split(',').map(s => s.trim()).filter(Boolean)
            : [])
    };

    // Get updated counts for response
    const finalUsed = isAnonymous ? anonymousUsage.generationsUsed : usageMetrics.generationsUsed;
    const finalLimit = isAnonymous ? TIER_CONFIG.free.generationsLimit : usageMetrics.generationsLimit;
    const updatedRemaining = Math.max(0, finalLimit - finalUsed);

    res.json({
      success: true,
      data: normalizedParsed,
      tailored: tailoredResume || null,
      coverLetter: coverLetter || null,
      usage: {
        used: finalUsed,
        limit: finalLimit,
        remaining: updatedRemaining,
        tier: user?.tier || 'free',
        resetInfo: isAnonymous ? 'daily' : 'monthly',
      },
    });

  } catch (error) {
    console.error('Error processing resume:', error);
    
    // Clean up file if it exists
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process resume. Please try again.'
    });
  }
});

app.post('/api/infer-job-title', async (req, res) => {
  try {
    const description = (req.body?.description || '').trim();
    if (!description) {
      return res.status(400).json({ success: false, error: 'Missing job description.' });
    }

    const title = await inferJobTitleWithGemini(description);
    return res.json({ success: true, title });
  } catch (error) {
    console.error('Error inferring job title:', error);
    return res.status(500).json({ success: false, error: 'Failed to infer job title.' });
  }
});

// Validate job description quality - only reject in extreme situations
function validateJobDescription(jobDescription) {
  const minLength = 50; // Minimum reasonable job description length
  const maxLength = 50000; // Prevent API overload
  
  // Check length
  if (jobDescription.length < minLength) {
    return { 
      valid: false, 
      error: 'Job description is too short. Please provide a more detailed job description (at least 50 characters).' 
    };
  }
  
  if (jobDescription.length > maxLength) {
    return { 
      valid: false, 
      error: 'Job description is too long. Please limit to 50,000 characters.' 
    };
  }
  
  // Check for gibberish (too many repeated characters - extreme cases)
  const repeatedCharPattern = /(.)(\1){9,}/g; // 10+ consecutive same character
  if (repeatedCharPattern.test(jobDescription)) {
    return { 
      valid: false, 
      error: 'Job description appears invalid. Please provide a legitimate job description without excessive repeated characters.' 
    };
  }
  
  // Check for minimum meaningful words
  const words = jobDescription.trim().split(/\s+/).filter(w => w.length > 2);
  if (words.length < 10) {
    return { 
      valid: false, 
      error: 'Job description lacks sufficient content. Please provide a more complete job description with at least 10 meaningful words.' 
    };
  }
  
  return { valid: true };
}

// Tailor endpoint - for tailoring already-parsed resume to job descriptions
app.post('/api/tailor', optionalAuthMiddleware, async (req, res) => {
  try {
    const parsed = req.body?.parsed;
    const jobDescription = (req.body?.jobDescription || '').trim();
    const limitToOnePage = req.body?.limitToOnePage === 'true' || req.body?.limitToOnePage === true;
    const generateResume = req.body?.generateResume === 'true' || req.body?.generateResume === true;
    const generateCoverLetter = req.body?.generateCoverLetter === 'true' || req.body?.generateCoverLetter === true;
    const templateKey = req.body?.templateKey || 'classic';

    // Check user tier and usage limits
    let user = null;
    let usageMetrics = null;
    let anonymousUsage = null;
    let isAnonymous = !req.userId;

    if (req.userId) {
      // Authenticated user
      user = await User.findByPk(req.userId);
      usageMetrics = await UsageMetrics.findOne({
        where: { userId: req.userId },
        order: [['createdAt', 'DESC']],
      });

      if (!user || !usageMetrics) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check and handle subscription expiry
      await checkAndHandleSubscriptionExpiry(user, getAppNow(req));

      // Check if monthly reset is needed for auth-free tier
      if (user.tier === 'auth-free' && usageMetrics.resetDate) {
        const lastReset = new Date(usageMetrics.resetDate);
        const today = getAppNow(req);
        const monthsDiff = (today.getFullYear() - lastReset.getFullYear()) * 12 + (today.getMonth() - lastReset.getMonth());
        
        console.log(`[/api/tailor] Monthly reset check for user ${req.userId}: lastReset=${lastReset.toISOString()}, today=${today.toISOString()}, monthsDiff=${monthsDiff}, generationsUsed=${usageMetrics.generationsUsed}`);
        
        if (monthsDiff >= 1) {
          // Reset the counter
          console.log(`[/api/tailor] Resetting counter for user ${req.userId} due to monthly reset`);
          usageMetrics.generationsUsed = 0;
          usageMetrics.resetDate = new Date();
          await usageMetrics.save();
        }
      }
    } else {
      // Anonymous user - track by IP
      const ipAddress = getClientIp(req);
      anonymousUsage = await getAnonymousUsage(ipAddress);
      
      usageMetrics = {
        generationsUsed: anonymousUsage.generationsUsed,
        generationsLimit: TIER_CONFIG.free.generationsLimit,
        currentJobCount: 0,
        maxJobCount: TIER_CONFIG.free.jobsPerSession,
      };
    }

    // Check if user has generations remaining
    const remaining = usageMetrics.generationsLimit - usageMetrics.generationsUsed;
    if (remaining <= 0) {
      const tier = user?.tier || 'free';
      const resetInfo = isAnonymous ? 'Resets in 24 hours' : 'Sign in with Google for 6 generations per month';
      
      return res.status(402).json({
        success: false,
        error: `Generation limit reached. ${resetInfo}`,
        tier: user?.tier || 'free',
        remaining: 0,
        limit: usageMetrics.generationsLimit,
      });
    }

    // Check job count limit
    const jobsRemaining = usageMetrics.maxJobCount - usageMetrics.currentJobCount;
    if (jobsRemaining <= 0) {
      return res.status(402).json({
        success: false,
        error: 'Job description limit reached for this session. Please upgrade your plan.',
        tier: user?.tier || 'free',
        jobsRemaining: 0,
        jobsLimit: usageMetrics.maxJobCount,
      });
    }

    console.log(`[/api/tailor] Received request`);
    console.log(`  generateResume: ${generateResume}`);
    console.log(`  generateCoverLetter: ${generateCoverLetter}`);
    console.log(`  limitToOnePage: ${limitToOnePage}`);
    console.log(`  jobDescription length: ${jobDescription.length}`);

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing parsed resume data.' });
    }

    if (!jobDescription) {
      return res.status(400).json({ success: false, error: 'Missing job description.' });
    }

    // Validate job description quality - only reject in extreme cases
    const jobDescValidation = validateJobDescription(jobDescription);
    if (!jobDescValidation.valid) {
      return res.status(400).json({ success: false, error: jobDescValidation.error });
    }

    let tailoredResume = null;
    let coverLetter = null;

    // Only tailor resume if generateResume flag is true
    if (generateResume) {
      console.log(`[/api/tailor] Starting resume tailoring...`);
      tailoredResume = await tailorResumeWithGemini(parsed, jobDescription, limitToOnePage, templateKey);
      console.log(`[/api/tailor] Resume tailoring complete`);
    } else {
      console.log(`[/api/tailor] Skipping resume tailoring (generateResume=false)`);
    }

    // Only generate cover letter if generateCoverLetter flag is true
    if (generateCoverLetter) {
      console.log(`[/api/tailor] Starting cover letter generation...`);
      coverLetter = await generateCoverLetterWithGemini(parsed, jobDescription, limitToOnePage);
      console.log(`[/api/tailor] Cover letter generation complete`);
    } else {
      console.log(`[/api/tailor] Skipping cover letter generation (generateCoverLetter=false)`);
    }

    // Increment usage counters
    if (isAnonymous && anonymousUsage) {
      // Anonymous user - increment IP-based counter
      console.log(`[/api/tailor] BEFORE increment - Anonymous: generationsUsed=${anonymousUsage.generationsUsed}`);
      anonymousUsage.generationsUsed += 1;
      await anonymousUsage.save();
      console.log(`[/api/tailor] AFTER increment - Anonymous: generationsUsed=${anonymousUsage.generationsUsed}`);
    } else if (usageMetrics && usageMetrics.save) {
      // Authenticated user - increment database counter
      console.log(`[/api/tailor] BEFORE increment - Auth: generationsUsed=${usageMetrics.generationsUsed}, generationsLimit=${usageMetrics.generationsLimit}`);
      if (user?.tier === 'monthly' && usageMetrics.bonusGenerations > 0) {
        // Consume bonus first so monthly allowance remains untouched until bonus is exhausted.
        usageMetrics.bonusGenerations = Math.max(0, usageMetrics.bonusGenerations - 1);
      } else {
        usageMetrics.generationsUsed += 1;
      }
      usageMetrics.currentJobCount += 1;
      await usageMetrics.save();
      console.log(`[/api/tailor] AFTER increment - Auth: generationsUsed=${usageMetrics.generationsUsed}, generationsLimit=${usageMetrics.generationsLimit}`);

      // Check if warning email should be sent
      if (user && user.email) {
        const remaining = (usageMetrics.generationsLimit - usageMetrics.generationsUsed) + (user?.tier === 'monthly' ? (usageMetrics.bonusGenerations || 0) : 0);
        const subscription = await Subscription.findOne({
          where: { userId: user.id },
          order: [['createdAt', 'DESC']],
        });

        // Send email if remaining === 10
        if (remaining === 10) {
          const lastWarning = usageMetrics.lastWarningEmailSent ? new Date(usageMetrics.lastWarningEmailSent) : null;
          const now = new Date();
          const hoursSinceLastWarning = lastWarning ? (now - lastWarning) / (1000 * 60 * 60) : 24;

          if (hoursSinceLastWarning >= 24) {
            await sendWarningEmail(user, 'low-generations', {
              remaining: remaining,
              actionUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/?upgrade=1`,
            });
            usageMetrics.lastWarningEmailSent = now;
            await usageMetrics.save();
          }
        }

        // Send email if one-time/cancelled plan has 1 day left
        if (subscription && (subscription.tier === 'one-time' || subscription.status === 'canceled')) {
          const currentPeriodEnd = new Date(subscription.currentPeriodEnd);
          const now = new Date();
          const msUntilExpiry = currentPeriodEnd - now;
          const daysUntilExpiry = Math.ceil(msUntilExpiry / (1000 * 60 * 60 * 24));

          if (daysUntilExpiry === 1) {
            const lastWarning = usageMetrics.lastWarningEmailSent ? new Date(usageMetrics.lastWarningEmailSent) : null;
            const hoursSinceLastWarning = lastWarning ? (now - lastWarning) / (1000 * 60 * 60) : 24;

            if (hoursSinceLastWarning >= 24) {
              const emailType = subscription.status === 'canceled' ? 'subscription-cancelled' : 'expiration-soon';
              await sendWarningEmail(user, emailType, {
                daysLeft: 1,
                actionUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/?upgrade=1`,
              });
              usageMetrics.lastWarningEmailSent = now;
              await usageMetrics.save();
            }
          }
        }
      }
    }

    console.log(`[/api/tailor] Sending response with success=true`);
    
    const finalUsed = isAnonymous ? anonymousUsage.generationsUsed : usageMetrics.generationsUsed;
    const finalLimit = isAnonymous ? TIER_CONFIG.free.generationsLimit : usageMetrics.generationsLimit;
    const baseRemaining = Math.max(0, finalLimit - finalUsed);
    const bonusRemaining = isAnonymous ? 0 : (usageMetrics.bonusGenerations || 0);
    const updatedRemaining = Math.max(0, baseRemaining + bonusRemaining);
    const updatedJobsRemaining = isAnonymous ? 0 : Math.max(0, (usageMetrics.maxJobCount || TIER_CONFIG.free.jobsPerSession) - (usageMetrics.currentJobCount || 0));

    console.log(`[/api/tailor] Response calculation: finalUsed=${finalUsed}, finalLimit=${finalLimit}, updatedRemaining=${updatedRemaining}, tier=${user?.tier || 'free'}`);

    // Determine if warning should be shown
    let warning = null;
    let warningMessage = null;
    if (user && !isAnonymous) {
      if (updatedRemaining === 10) {
        warning = true;
        warningMessage = `You have only ${updatedRemaining} generations remaining.`;
      } else if (updatedRemaining <= 10 && updatedRemaining > 0) {
        warning = true;
        warningMessage = `You have only ${updatedRemaining} generation${updatedRemaining > 1 ? 's' : ''} remaining.`;
      }
    }

    res.json({
      success: true,
      tailored: tailoredResume || null,
      coverLetter: coverLetter || null,
      warning: warning,
      warningMessage: warningMessage,
      usage: {
        used: finalUsed,
        limit: finalLimit,
        baseRemaining,
        remaining: updatedRemaining,
        jobsUsed: isAnonymous ? 0 : (usageMetrics.currentJobCount || 1),
        jobsLimit: isAnonymous ? TIER_CONFIG.free.jobsPerSession : (usageMetrics.maxJobCount || TIER_CONFIG.free.jobsPerSession),
        jobsRemaining: updatedJobsRemaining,
        tier: user?.tier || 'free',
        resetInfo: isAnonymous ? 'daily' : 'monthly',
        bonusGenerations: isAnonymous ? 0 : (usageMetrics.bonusGenerations || 0),
        bonusExpiresAt: isAnonymous ? null : (usageMetrics.bonusExpiresAt || null),
      },
    });
  } catch (error) {
    console.error('[/api/tailor] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to tailor resume.'
    });
  }
});

app.post('/api/export-html', async (req, res) => {
  try {
    const { parsed, tailored = null, templateKey = 'classic' } = req.body || {};
    console.log('[export-html] name:', parsed?.name || '(empty)', '| template:', templateKey);

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing parsed resume data.' });
    }

    const html = buildHtmlForTemplate(parsed, tailored, templateKey);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Error exporting HTML:', error);
    res.status(500).json({ success: false, error: 'Failed to generate HTML resume.' });
  }
});

app.post('/api/export-pdf', async (req, res) => {
  try {
    const { parsed, tailored, html: rawHtml, templateKey = 'classic' } = req.body || {};

    let html;
    if (rawHtml && typeof rawHtml === 'string') {
      // User-edited HTML passed directly — skip server-side rebuild
      console.log('[export-pdf] using provided raw HTML (edited resume)');
      html = rawHtml;
    } else {
      console.log('[export-pdf] building HTML from data, name:', parsed?.name || '(empty)', '| template:', templateKey);
      if (!parsed || typeof parsed !== 'object') {
        return res.status(400).json({ success: false, error: 'Missing parsed resume data.' });
      }
      html = buildHtmlForTemplate(parsed, tailored || null, templateKey);
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    const page = await browser.newPage();
    
    // Feed the HTML to the browser
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Generate pixel-perfect PDF
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Tailored_Resume.pdf"');
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error('Error exporting PDF:', error);
    res.status(500).json({ success: false, error: 'Failed to generate PDF resume.' });
  }
});

// Proofread endpoint

// Bug Report Endpoint
app.post('/api/send-bug-report', upload.single('screenshot'), async (req, res) => {
  try {
    const { title, description, email, steps } = req.body;

    console.log('[Bug Report] Received:', { title, description, email, steps, hasFile: !!req.file });

    // Validate required fields
    if (!title || !description || !email) {
      console.log('[Bug Report] Validation failed - missing fields');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, description, or email',
      });
    }

    // Check email credentials
    if (!process.env.EMAIL_PASSWORD) {
      console.log('[Bug Report] EMAIL_PASSWORD not set in .env');
      return res.status(500).json({
        success: false,
        error: 'Email service not configured. Please contact admin.',
      });
    }

    // Create nodemailer transporter
    console.log('[Bug Report] Creating email transporter...');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      auth: {
        user: process.env.EMAIL_USER || 'resumerushio@gmail.com',
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Build email HTML
    let emailHTML = `
      <h2>New Bug Report Submitted</h2>
      <p><strong>Title:</strong> ${title}</p>
      <p><strong>Reporter Email:</strong> ${email}</p>
      <hr />
      <h3>Description</h3>
      <p>${description.replace(/\n/g, '<br>')}</p>
    `;

    if (steps) {
      emailHTML += `
        <h3>Steps to Reproduce</h3>
        <p>${steps.replace(/\n/g, '<br>')}</p>
      `;
    }

    // Prepare email attachments
    const attachments = [];
    if (req.file) {
      attachments.push({
        filename: req.file.originalname,
        path: req.file.path,
      });
    }

    // Send email
    console.log('[Bug Report] Sending email...');
    const mailOptions = {
      from: process.env.EMAIL_USER || 'resumerushio@gmail.com',
      to: 'resumerushio@gmail.com',
      subject: `Bug Report: ${title}`,
      html: emailHTML,
      attachments: attachments,
    };

    await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Bug report email timed out after 20 seconds')), 20000)
      ),
    ]);

    console.log('[Bug Report] Email sent successfully');

    res.json({
      success: true,
      message: 'Bug report submitted successfully',
    });
  } catch (err) {
    console.error('[Bug Report] Error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to send bug report',
    });
  } finally {
    // Always clean up uploaded temp file, even on send failures/timeouts.
    if (req.file?.path) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting temp file:', unlinkErr);
      });
    }
  }
});

// Auth and Stripe routes
app.use('/api', authRoutes);
app.use('/api', stripeRoutes);

// Get usage stats endpoint
app.get('/api/usage', optionalAuthMiddleware, async (req, res) => {
  try {
    let used = 0;
    let limit = 3;
    let tier = 'free';
    let resetInfo = 'daily';
    let jobsUsed = 0;
    let jobsLimit = TIER_CONFIG.free.jobsPerSession;
    let bonusGenerations = 0;
    let bonusExpiresAt = null;
    let bonusDaysLeft = null;

    if (req.userId) {
      try {
        // Authenticated user
        const user = await User.findByPk(req.userId);
        const usageMetrics = await UsageMetrics.findOne({
          where: { userId: req.userId },
          order: [['createdAt', 'DESC']],
        });

        console.log(`[/api/usage] User ${req.userId}: found usageMetrics=${!!usageMetrics}, tier=${user?.tier}`);

        if (user && usageMetrics) {
          await advanceMonthlySubscriptionIfNeeded(
            await Subscription.findOne({
              where: { userId: req.userId },
              order: [['createdAt', 'DESC']],
            }),
            usageMetrics,
            getAppNow(req)
          );
          await applyMonthlyBonus(user, usageMetrics);
          tier = user.tier;
          limit = usageMetrics.generationsLimit || TIER_CONFIG[tier]?.generationsLimit || 6;
          resetInfo = tier === 'auth-free' ? 'monthly' : 'monthly';

          // Check if monthly reset is needed for auth-free tier
          if (tier === 'auth-free' && usageMetrics.resetDate) {
            const lastReset = new Date(usageMetrics.resetDate);
            const today = new Date();
            const monthsDiff = (today.getFullYear() - lastReset.getFullYear()) * 12 + (today.getMonth() - lastReset.getMonth());

            console.log(`[/api/usage] Monthly reset check for user ${req.userId}: lastReset=${lastReset.toISOString()}, today=${today.toISOString()}, monthsDiff=${monthsDiff}, generationsUsed=${usageMetrics.generationsUsed}`);

            if (monthsDiff >= 1) {
              // Reset the counter
              console.log(`[/api/usage] Resetting counter for user ${req.userId} due to monthly reset`);
              usageMetrics.generationsUsed = 0;
              usageMetrics.resetDate = getAppNow(req);
              await usageMetrics.save();
            }
          }

          used = usageMetrics.generationsUsed;
          jobsUsed = usageMetrics.currentJobCount || 0;
          jobsLimit = usageMetrics.maxJobCount || TIER_CONFIG[tier]?.jobsPerSession || TIER_CONFIG.free.jobsPerSession;

          bonusGenerations = usageMetrics.bonusGenerations || 0;
          bonusExpiresAt = usageMetrics.bonusExpiresAt || null;
          if (bonusGenerations > 0 && bonusExpiresAt) {
            const now = getAppNow(req);
            const expiry = new Date(bonusExpiresAt);
            const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
            bonusDaysLeft = daysLeft > 0 ? daysLeft : 0;
          }
        }
      } catch (authUsageError) {
        console.error(`[/api/usage] Authenticated usage lookup failed for user ${req.userId}, returning free fallback:`, authUsageError.message);
        used = 0;
        limit = TIER_CONFIG.free.generationsLimit;
        tier = 'free';
        resetInfo = 'daily';
        jobsUsed = 0;
        jobsLimit = TIER_CONFIG.free.jobsPerSession;
        bonusGenerations = 0;
        bonusExpiresAt = null;
        bonusDaysLeft = null;
      }
    } else {
      // Anonymous user - check by IP
      const ipAddress = getClientIp(req);
      const anonymousUsage = await getAnonymousUsage(ipAddress);
      
      console.log(`[/api/usage] Anonymous user IP=${ipAddress}: used=${anonymousUsage.generationsUsed}`);
      
      used = anonymousUsage.generationsUsed;
      limit = TIER_CONFIG.free.generationsLimit;
      tier = 'free';
      resetInfo = 'daily';
      jobsUsed = 0;
      jobsLimit = TIER_CONFIG.free.jobsPerSession;
    }

    const baseRemaining = Math.max(0, limit - used);
    const remaining = Math.max(0, baseRemaining + (tier === 'monthly' ? (bonusGenerations || 0) : 0));

    console.log(`[/api/usage] Response: used=${used}, limit=${limit}, baseRemaining=${baseRemaining}, remaining=${remaining}, tier=${tier}`);

    const jobsRemaining = Math.max(0, jobsLimit - jobsUsed);

    res.json({
      used,
      limit,
      baseRemaining,
      remaining,
      tier,
      resetInfo,
      jobsUsed,
      jobsLimit,
      jobsRemaining,
      bonusGenerations,
      bonusExpiresAt,
      bonusDaysLeft,
    });
  } catch (error) {
    console.error('[Usage] Error:', error);
    console.error('[Usage] Error details:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to get usage stats', details: error.message });
  }
});

// Admin middleware - checks if user is admin
const ensureAdmin = async (req, res, next) => {
  try {
    // User must be authenticated first
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized - not logged in' });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized - user not found' });
    }

    // Check if user's email matches ADMIN_EMAIL
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail || user.email.toLowerCase() !== adminEmail.toLowerCase()) {
      return res.status(403).json({ error: 'Forbidden - not an admin' });
    }

    req.adminUser = user;
    next();
  } catch (error) {
    console.error('[ensureAdmin] Error:', error);
    res.status(500).json({ error: 'Admin check failed' });
  }
};

// Admin: Get all users with their subscription info
app.get('/api/admin/users', optionalAuthMiddleware, ensureAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'email', 'name', 'tier', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });

    const formattedUsers = await Promise.all(users.map(async (user) => {
      const usageMetrics = await UsageMetrics.findOne({
        where: { userId: user.id },
        order: [['createdAt', 'DESC']],
      });

      const subscriptions = await Subscription.findAll({
        where: { userId: user.id },
        order: [['createdAt', 'DESC']],
      });

      const monthlySubscription = subscriptions.find((item) => item.tier === 'monthly') || null;
      const oneTimeSubscription = subscriptions.find((item) => item.tier === 'one-time') || null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        userTier: user.tier,
        signupDate: new Date(user.createdAt).toLocaleDateString('en-US'),
        generationsUsed: usageMetrics?.generationsUsed || 0,
        monthlySubscription: monthlySubscription ? {
          tier: monthlySubscription.tier,
          status: monthlySubscription.status,
          stripeSubscriptionId: monthlySubscription.stripeSubscriptionId || null,
          currentPeriodEnd: monthlySubscription.currentPeriodEnd || null,
          currentPeriodStart: monthlySubscription.currentPeriodStart || null,
        } : null,
        oneTimeSubscription: oneTimeSubscription ? {
          tier: oneTimeSubscription.tier,
          status: oneTimeSubscription.status,
          stripeSubscriptionId: oneTimeSubscription.stripeSubscriptionId || null,
          currentPeriodEnd: oneTimeSubscription.currentPeriodEnd || null,
          currentPeriodStart: oneTimeSubscription.currentPeriodStart || null,
          generationsRemaining: (() => {
            // If already expired by the system or time has passed, return 0 — usageMetrics
            // may have been reset to auth-free values and would give a false positive count.
            if (oneTimeSubscription.status === 'expired') return 0;
            const periodEnd = oneTimeSubscription.currentPeriodEnd ? new Date(oneTimeSubscription.currentPeriodEnd) : null;
            if (!periodEnd || periodEnd <= new Date()) return 0;
            if (!usageMetrics) return null;
            if (user.tier === 'monthly') {
              return Math.max(0, Math.min(50, usageMetrics.bonusGenerations || 0));
            }
            return Math.max(0, (usageMetrics.generationsLimit || 50) - (usageMetrics.generationsUsed || 0));
          })(),
        } : null,
        hasMonthly: !!monthlySubscription,
        hasOneTime: !!oneTimeSubscription,
      };
    }));

    res.json({
      totalUsers: formattedUsers.length,
      users: formattedUsers,
    });
  } catch (error) {
    console.error('[/api/admin/users] Error:', error);
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

// Health check endpoints (for Railway and general use)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Resume Rocket API is running' });
});

// Railway default health check path
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Resume Rocket API is running' });
});

const ensureDevOnly = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  return next();
};

// DEVELOPMENT ONLY: Reset all usage for testing
app.post('/api/dev/reset-usage', ensureDevOnly, async (req, res) => {
  try {
    console.log('[/api/dev/reset-usage] Resetting all usage metrics...');
    
    // Get all users
    const users = await User.findAll();
    console.log(`[/api/dev/reset-usage] Found ${users.length} users`);
    
    // For each user, delete extra UsageMetrics records and keep only 1
    for (const user of users) {
      const usageRecords = await UsageMetrics.findAll({
        where: { userId: user.id },
        order: [['createdAt', 'DESC']],
      });
      
      console.log(`[/api/dev/reset-usage] User ${user.id} has ${usageRecords.length} usage records`);
      
      if (usageRecords.length > 1) {
        // Keep the latest one, delete the rest
        const latestId = usageRecords[0].id;
        const toDelete = usageRecords.slice(1).map(r => r.id);
        
        await UsageMetrics.destroy({
          where: { id: toDelete }
        });
        console.log(`[/api/dev/reset-usage] Deleted ${toDelete.length} duplicate records for user ${user.id}`);
      }
      
      // Reset the remaining (or only) record
      if (usageRecords.length > 0) {
        const latestRecord = usageRecords[0];
        latestRecord.generationsUsed = 0;
        latestRecord.resetDate = new Date();
        latestRecord.currentJobCount = 0;
        await latestRecord.save();
        console.log(`[/api/dev/reset-usage] Reset record for user ${user.id}`);
      }
    }
    
    // Reset all AnonymousUsage (IP-tracked users)
    await AnonymousUsage.update(
      { generationsUsed: 0, lastResetDate: new Date() },
      { where: {} }
    );
    console.log('[/api/dev/reset-usage] Reset all AnonymousUsage');
    
    res.json({ 
      success: true, 
      message: 'All usage metrics have been reset and duplicates removed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[/api/dev/reset-usage] Error:', error);
    res.status(500).json({ error: 'Failed to reset usage metrics', details: error.message });
  }
});

// DEVELOPMENT ONLY: Reset all subscription/status data for testing
app.post('/api/dev/reset-statuses', ensureDevOnly, async (req, res) => {
  try {
    console.log('[/api/dev/reset-statuses] Resetting user tiers, subscriptions, and usage...');

    await Subscription.destroy({ where: {} });
    console.log('[/api/dev/reset-statuses] Cleared subscriptions');

    const users = await User.findAll();
    console.log(`[/api/dev/reset-statuses] Found ${users.length} users`);

    for (const user of users) {
      const nextTier = user.googleId ? 'auth-free' : 'free';
      user.tier = nextTier;
      await user.save();

      const tierConfig = TIER_CONFIG[nextTier] || TIER_CONFIG.free;
      const [usageMetrics] = await UsageMetrics.findOrCreate({
        where: { userId: user.id },
        defaults: {
          generationsUsed: 0,
          generationsLimit: tierConfig.generationsLimit,
          currentJobCount: 0,
          maxJobCount: tierConfig.jobsPerSession,
          resetDate: new Date(),
          lastWarningEmailSent: null,
        },
      });

      usageMetrics.generationsUsed = 0;
      usageMetrics.generationsLimit = tierConfig.generationsLimit;
      usageMetrics.currentJobCount = 0;
      usageMetrics.maxJobCount = tierConfig.jobsPerSession;
      usageMetrics.resetDate = new Date();
      usageMetrics.lastWarningEmailSent = null;
      await usageMetrics.save();
    }

    await AnonymousUsage.update(
      { generationsUsed: 0, lastResetDate: new Date() },
      { where: {} }
    );

    res.json({
      success: true,
      message: 'All user tiers, subscriptions, and usage have been reset',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[/api/dev/reset-statuses] Error:', error);
    res.status(500).json({ error: 'Failed to reset statuses', details: error.message });
  }
});

// DEVELOPMENT ONLY: Dump user's usage metrics and subscriptions for debugging
app.get('/api/dev/user-debug/:userId', ensureDevOnly, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const usageRecords = await UsageMetrics.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    const subscriptions = await Subscription.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    return res.json({
      usageRecords: usageRecords.map(u => ({
        id: u.id,
        generationsUsed: u.generationsUsed,
        generationsLimit: u.generationsLimit,
        bonusGenerations: u.bonusGenerations,
        bonusExpiresAt: u.bonusExpiresAt,
        currentJobCount: u.currentJobCount,
        maxJobCount: u.maxJobCount,
        resetDate: u.resetDate,
        createdAt: u.createdAt,
      })),
      subscriptions: subscriptions.map(s => ({
        id: s.id,
        tier: s.tier,
        status: s.status,
        currentPeriodStart: s.currentPeriodStart,
        currentPeriodEnd: s.currentPeriodEnd,
        stripeSubscriptionId: s.stripeSubscriptionId,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('[/api/dev/user-debug] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch debug info' });
  }
});

// DEVELOPMENT ONLY: Seed a user's plan state for testing
app.post('/api/dev/seed-plan', ensureDevOnly, async (req, res) => {
  try {
    const { email, plan } = req.body || {};
    if (!email || !plan) {
      return res.status(400).json({ error: 'Provide email and plan (monthly|one-time|both)' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const monthlyEnd = new Date(now);
    monthlyEnd.setDate(monthlyEnd.getDate() + 30);
    const oneTimeEnd = new Date(now);
    oneTimeEnd.setDate(oneTimeEnd.getDate() + 5);

    await Subscription.destroy({ where: { userId: user.id } });

    const [usageMetrics] = await UsageMetrics.findOrCreate({
      where: { userId: user.id },
      defaults: {
        generationsUsed: 0,
        generationsLimit: 0,
        currentJobCount: 0,
        maxJobCount: 0,
        resetDate: now,
        bonusGenerations: 0,
        bonusExpiresAt: null,
      },
    });

    if (plan === 'monthly') {
      user.tier = 'monthly';
      await user.save();

      usageMetrics.generationsUsed = 0;
      usageMetrics.generationsLimit = TIER_CONFIG.monthly.generationsLimit;
      usageMetrics.currentJobCount = 0;
      usageMetrics.maxJobCount = TIER_CONFIG.monthly.jobsPerSession;
      usageMetrics.resetDate = now;
      usageMetrics.bonusGenerations = 0;
      usageMetrics.bonusExpiresAt = null;
      await usageMetrics.save();

      await Subscription.create({
        userId: user.id,
        tier: 'monthly',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: monthlyEnd,
      });
    } else if (plan === 'one-time') {
      user.tier = 'one-time';
      await user.save();

      usageMetrics.generationsUsed = 0;
      usageMetrics.generationsLimit = TIER_CONFIG['one-time'].generationsLimit;
      usageMetrics.currentJobCount = 0;
      usageMetrics.maxJobCount = TIER_CONFIG['one-time'].jobsPerSession;
      usageMetrics.resetDate = now;
      usageMetrics.bonusGenerations = 0;
      usageMetrics.bonusExpiresAt = null;
      await usageMetrics.save();

      await Subscription.create({
        userId: user.id,
        tier: 'one-time',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: oneTimeEnd,
      });
    } else if (plan === 'both') {
      user.tier = 'monthly';
      await user.save();

      usageMetrics.generationsUsed = 0;
      usageMetrics.generationsLimit = TIER_CONFIG.monthly.generationsLimit + 50;
      usageMetrics.currentJobCount = 0;
      usageMetrics.maxJobCount = TIER_CONFIG.monthly.jobsPerSession;
      usageMetrics.resetDate = now;
      usageMetrics.bonusGenerations = 50;
      usageMetrics.bonusExpiresAt = oneTimeEnd;
      await usageMetrics.save();

      await Subscription.create({
        userId: user.id,
        tier: 'monthly',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: monthlyEnd,
      });

      await Subscription.create({
        userId: user.id,
        tier: 'one-time',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: oneTimeEnd,
      });
    } else {
      return res.status(400).json({ error: 'Invalid plan. Use monthly, one-time, or both.' });
    }

    res.json({
      success: true,
      userId: user.id,
      tier: user.tier,
      plan,
    });
  } catch (error) {
    console.error('[/api/dev/seed-plan] Error:', error);
    res.status(500).json({ error: 'Failed to seed plan', details: error.message });
  }
});

// DEVELOPMENT ONLY: Reset a single user for testing
app.post('/api/dev/reset-user', ensureDevOnly, async (req, res) => {
  try {
    const { email, userId } = req.body || {};
    if (!email && !userId) {
      return res.status(400).json({ error: 'Provide email or userId' });
    }

    const user = await User.findOne({
      where: email ? { email } : { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await Subscription.destroy({ where: { userId: user.id } });

    const nextTier = user.googleId ? 'auth-free' : 'free';
    user.tier = nextTier;
    await user.save();

    const tierConfig = TIER_CONFIG[nextTier] || TIER_CONFIG.free;
    const [usageMetrics] = await UsageMetrics.findOrCreate({
      where: { userId: user.id },
      defaults: {
        generationsUsed: 0,
        generationsLimit: tierConfig.generationsLimit,
        currentJobCount: 0,
        maxJobCount: tierConfig.jobsPerSession,
        resetDate: new Date(),
        lastWarningEmailSent: null,
      },
    });

    usageMetrics.generationsUsed = 0;
    usageMetrics.generationsLimit = tierConfig.generationsLimit;
    usageMetrics.currentJobCount = 0;
    usageMetrics.maxJobCount = tierConfig.jobsPerSession;
    usageMetrics.resetDate = new Date();
    usageMetrics.lastWarningEmailSent = null;
    await usageMetrics.save();

    res.json({
      success: true,
      message: 'User reset complete',
      userId: user.id,
      tier: user.tier,
    });
  } catch (error) {
    console.error('[/api/dev/reset-user] Error:', error);
    res.status(500).json({ error: 'Failed to reset user', details: error.message });
  }
});

// DEVELOPMENT ONLY: Inspect Stripe + DB subscription info for a user
app.post('/api/dev/inspect-subscription', ensureDevOnly, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Provide email' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const dbSubscriptions = await Subscription.findAll({
      where: { userId: user.id },
      order: [['createdAt', 'DESC']],
    });

    let stripeSummary = null;
    if (stripe) {
      const customers = await stripe.customers.list({ email, limit: 3 });
      const customerIds = customers.data.map((c) => c.id);

      const subscriptions = [];
      const subscriptionDetails = [];
      for (const customerId of customerIds) {
        const subs = await stripe.subscriptions.list({
          customer: customerId,
          status: 'all',
          limit: 10,
        });
        subscriptions.push(...subs.data);
        for (const sub of subs.data) {
          try {
            const detail = await stripe.subscriptions.retrieve(sub.id);
            subscriptionDetails.push({
              id: detail.id,
              status: detail.status,
              cancel_at_period_end: detail.cancel_at_period_end,
              current_period_start: detail.current_period_start,
              current_period_end: detail.current_period_end,
              created: detail.created,
            });
          } catch (detailError) {
            subscriptionDetails.push({
              id: sub.id,
              error: detailError.message,
            });
          }
        }
      }

      stripeSummary = {
        customers: customers.data.map((c) => ({ id: c.id, email: c.email })),
        subscriptions: subscriptions.map((s) => ({
          id: s.id,
          status: s.status,
          cancel_at_period_end: s.cancel_at_period_end,
          current_period_start: s.current_period_start,
          current_period_end: s.current_period_end,
          created: s.created,
        })),
        subscriptionDetails,
      };
    }

    res.json({
      user: { id: user.id, email: user.email, tier: user.tier },
      dbSubscriptions,
      stripe: stripeSummary,
    });
  } catch (error) {
    console.error('[/api/dev/inspect-subscription] Error:', error);
    res.status(500).json({ error: 'Failed to inspect subscription', details: error.message });
  }
});

// Start server with database initialization
async function startServer() {
  try {
    validateStripeConfiguration();

    // Initialize database
    await initializeDatabase();
    console.log('✓ Database initialized');

    app.listen(PORT, () => {
      console.log(`🚀 Resume Rocket server running on http://localhost:${PORT}`);
      console.log(`✓ Gemini API configured`);
      console.log(`✓ Database connected`);
      console.log(`✓ Ready to parse resumes`);
      console.log(`📋 Environment check:`);
      console.log(`  PORT: ${PORT}`);
      console.log(`  NODE_ENV: ${process.env.NODE_ENV}`);
      console.log(`  GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✓ Set' : '❌ Missing'}`);
      console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '✓ Set' : '❌ Missing'}`);
      console.log(`  STRIPE_SECRET_KEY: ${process.env.STRIPE_SECRET_KEY ? '✓ Set' : '❌ Missing'}`);
      console.log(`  GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? '✓ Set' : '❌ Missing'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
