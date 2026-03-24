require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const compression = require('compression');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType } = require('docx');
const pdf = require('pdf-parse');
const PDFDocument = require('pdfkit');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const { templates, templateKeys, getTemplate } = require('./templates');
const { initializeDatabase, User, UsageMetrics, Subscription, AnonymousUsage } = require('./database');
const { optionalAuthMiddleware } = require('./auth');
const { canPerformAction, incrementUsage, TIER_CONFIG } = require('./tiers');
const { getWarningEmailHTML } = require('./email-templates');
const authRoutes = require('./authRoutes');
const stripeRoutes = require('./stripeRoutes');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const PORT = process.env.PORT || 5000;

// Error handlers for unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Middleware
const allowedOrigins = [
  'https://resumerush.io',
  'https://www.resumerush.io',
  'http://localhost:5173', // Development frontend
  'http://localhost:3000',  // Alternative dev port
  // Allow default Railway preview domain if accessed directly
  // Add your Vercel preview domains here if needed
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow non-browser requests (like curl) which have no origin
    if (!origin) return callback(null, true);
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
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
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
    
    const prompt = `You are a resume parser. Analyze the following resume text and extract structured information. Return ONLY valid JSON with no markdown formatting, no code blocks, and no additional text.

Resume Text:
${resumeText}

Return a JSON object with this exact structure:
{
  "name": "Full name of the candidate",
  "email": "Email address",
  "phone": "Phone number",
  "location": "City, State/Country",
  "summary": "Professional summary or objective",
  "experience": [
    {
      "company": "Company name",
      "title": "Job title",
      "dates": "Employment dates",
      "description": "Brief description of responsibilities and achievements"
    }
  ],
  "education": [
    {
      "school": "Institution name",
      "degree": "Degree type",
      "field": "Field of study",
      "dates": "Graduation date or date range"
    }
  ],
  "projects": [
    {
      "name": "Project title",
      "organization": "Institution/Company (if applicable)",
      "dates": "Project dates",
      "description": "Brief description of the project",
      "technologies": ["tech1", "tech2"]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    let text = response.text();
    
    // Clean up response if it contains markdown code blocks
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Parse JSON
    const parsedData = JSON.parse(text);
    return parsedData;
  } catch (error) {
    console.error('Gemini parsing error:', error);
    throw new Error('Failed to parse resume with AI');
  }
}

// Tailor resume to job description with Gemini
async function tailorResumeWithGemini(parsedResume, jobDescription, limitToOnePage = false) {
  try {
    console.log('[tailorResumeWithGemini] Starting...');
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const onePageConstraint = limitToOnePage 
      ? '\n\n⚠️ CRITICAL: The resume MUST fit on ONE PAGE. Maximize content density. Reduce descriptions to 1-2 lines max. Limit each role to 2-3 bullet points max. Eliminate any section that is not essential. Combine skills inline where possible.'
      : '';

    const prompt = `You are an expert resume tailor. Using ONLY the candidate data provided and the job description, craft a tailored resume summary and bullet points. Do not invent experience that is not present.

Candidate data (JSON):
${JSON.stringify(parsedResume, null, 2)}

Job description:
${jobDescription}

Return ONLY valid JSON (no markdown, no code fences) with this structure (example):
{
  "tailored_summary": "summary text here",
  "target_skills": ["skill1", "skill2", "skill3"],
  "tailored_experience": [
    {
      "role": "Role title from resume",
      "company": "Company name from resume",
      "dates": "Dates from resume",
      "bullets": ["bullet 1", "bullet 2", "bullet 3"]
    }
  ],
  "recommended_template": "classic | modern | minimal"
}

Rules:
- Use ONLY facts from the candidate data; do not fabricate companies, roles, or metrics.
- Prefer concise, action-oriented bullets; mirror job terminology where appropriate.
- Integrate relevant job keywords directly into the summary and bullets instead of listing them separately.
- Do NOT mention the job title, company, or that this is tailored to a specific posting; weave fit implicitly without explicit job references.
- If something is missing, use empty string or empty array.
- Output must be valid JSON with no trailing commas.
- For "recommended_template", choose one key from this list: ${templateKeys.join(', ')}.${onePageConstraint}`;

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
    if (tailored && tailored.recommended_template && !templateKeys.includes(tailored.recommended_template)) {
      tailored.recommended_template = 'classic';
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

function buildResumePdf(doc, parsed = {}, tailored = null, templateKey = 'classic', limitToOnePage = false) {
  const style = getTemplate(templateKey);
  const contact = [parsed.email, parsed.phone, parsed.location].filter(Boolean).join(' · ');
  const headingFont = resolvePdfFont(style.pdf.headingFont || style.pdf.font, true);
  const bodyFont = resolvePdfFont(style.pdf.font, false);
  const layout = style.layout || 'traditional';

  // Simple header matching DOCX capabilities
  const titleAlign = (layout === 'centered' || layout === 'formal' || layout === 'minimalist' || layout === 'minimal') ? 'center' : 'left';
  
  doc.font(headingFont).fontSize(style.pdf.titleSize).fillColor(style.docx?.titleColor ? `#${style.docx.titleColor}` : style.pdf.titleColor).text(parsed.name || 'Resume', { align: titleAlign });
  
  if (contact) {
    doc.moveDown(0.18);
    doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.contactColor ? `#${style.docx.contactColor}` : style.pdf.contactColor).text(contact, { align: titleAlign });
  }

  // Simple divider
  doc.moveDown(0.3);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor(style.docx?.accentColor ? `#${style.docx.accentColor}` : style.pdf.accentColor).lineWidth(0.5).stroke();
  doc.moveDown(style.pdf.sectionGap);

  // Cover letter rendering is in buildCoverPdf()

  const summary = tailored?.tailored_summary || parsed.summary;
  if (summary) {
    addSectionTitle(doc, 'Summary', style, layout);
    doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(summary, { lineGap: style.pdf.lineGap });
  }

  const skills = (tailored?.target_skills && tailored.target_skills.length > 0) ? tailored.target_skills : parsed.skills || [];
  if (skills.length > 0) {
    addSectionTitle(doc, 'Skills', style, layout);
    doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(skills.join(', '), { lineGap: style.pdf.lineGap });
  }

  // Render Education before Experience
  if (parsed.education && Array.isArray(parsed.education) && parsed.education.length > 0) {
    addSectionTitle(doc, 'Education', style, layout);
    parsed.education.forEach((edu) => {
      const heading = [edu.degree, edu.field].filter(Boolean).join(' in ');
      if (heading) {
        doc.font(headingFont).fontSize(style.pdf.subheadingSize).fillColor(style.docx?.headingColor ? `#${style.docx.headingColor}` : style.pdf.headingColor).text(heading);
      }
      if (edu.school) {
        doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(edu.school);
      }
      if (edu.dates) {
        doc.font(bodyFont).fontSize(style.pdf.bodySize - 1).fillColor('#666').text(edu.dates);
      }
      doc.moveDown(0.5);
    });
  }

  const expList = (tailored?.tailored_experience && tailored.tailored_experience.length > 0)
    ? tailored.tailored_experience
    : parsed.experience || [];
  if (expList.length > 0) {
    addSectionTitle(doc, 'Experience', style, layout);
    // Limit to top 3 items if one-page constraint
    const itemsToShow = limitToOnePage ? expList.slice(0, 3) : expList;
    itemsToShow.forEach((exp) => {
      const title = exp.role || exp.title || '';
      const company = exp.company || '';
      const heading = [title, company].filter(Boolean).join(' at ');
      if (heading) {
        doc.font(headingFont).fontSize(style.pdf.subheadingSize).fillColor(style.docx?.headingColor ? `#${style.docx.headingColor}` : style.pdf.headingColor).text(heading);
      }
      if (exp.dates) {
        doc.font(bodyFont).fontSize(style.pdf.bodySize - 1).fillColor('#666').text(exp.dates);
      }
      if (exp.description) {
        doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(exp.description, { lineGap: style.pdf.lineGap });
      }
      if (exp.bullets && Array.isArray(exp.bullets) && exp.bullets.length > 0) {
        doc.moveDown(0.15);
        // Limit to 2 bullets if one-page constraint
        const bulletsToShow = limitToOnePage ? exp.bullets.slice(0, 2) : exp.bullets;
        bulletsToShow.forEach((b) => {
          doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(`• ${b}`, { lineGap: 1.6 });
        });
      }
      doc.moveDown(style.pdf.sectionGap);
    });
  }

  // Projects (skip if one-page constraint)
  if (!limitToOnePage) {
    const projects = parsed.projects;
    if (projects) {
      addSectionTitle(doc, 'Projects', style, layout);
      if (Array.isArray(projects)) {
        projects.forEach((p) => {
          if (!p || typeof p !== 'object') return;
          const name = p.name || '';
          const org = p.organization || '';
          const heading = [name, org].filter(Boolean).join(' — ');
          if (heading) {
            doc.font(headingFont).fontSize(style.pdf.subheadingSize).fillColor(style.docx?.headingColor ? `#${style.docx.headingColor}` : style.pdf.headingColor).text(heading);
          }
          if (p.dates) {
            doc.font(bodyFont).fontSize(style.pdf.bodySize - 1).fillColor('#666').text(p.dates);
          }
          if (p.description) {
            doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(p.description, { lineGap: style.pdf.lineGap });
          }
          if (Array.isArray(p.technologies) && p.technologies.length > 0) {
            doc.moveDown(0.15);
            doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(`Technologies: ${p.technologies.join(', ')}`, { lineGap: 1.55 });
          }
          doc.moveDown(0.5);
        });
      } else if (typeof projects === 'string') {
        doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(projects, { lineGap: style.pdf.lineGap });
      }
    }
  }
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

// Build DOCX resume
async function buildResumeDocx(parsed = {}, tailored = null, templateKey = 'classic', limitToOnePage = false) {
  const style = getTemplate(templateKey);
  const layout = style.layout || 'traditional';
  const children = [];

  // Adjust spacing for one-page constraint
  const spacing = limitToOnePage ? {
    titleAfter: style.docx.titleAfter ? Math.floor(style.docx.titleAfter * 0.7) : 80,
    contactAfter: style.docx.contactAfter ? Math.floor(style.docx.contactAfter * 0.7) : 80,
    headingBefore: style.docx.headingBefore ? Math.floor(style.docx.headingBefore * 0.6) : 60,
    headingAfter: style.docx.headingAfter ? Math.floor(style.docx.headingAfter * 0.6) : 60,
    bodyAfter: style.docx.bodyAfter ? Math.floor(style.docx.bodyAfter * 0.6) : 60,
    bulletSpacing: style.docx.bulletSpacing ? Math.floor(style.docx.bulletSpacing * 0.6) : 40,
  } : style.docx;

  const name = parsed.name || 'Resume';
  const contact = [parsed.email, parsed.phone, parsed.location].filter(Boolean).join(' · ');

  // Determine alignment and sizing based on layout
  const titleAlignment = (layout === 'centered' || layout === 'formal' || layout === 'minimalist' || layout === 'minimal' || layout === 'high-contrast' || layout === 'block-headers') ? AlignmentType.CENTER : AlignmentType.LEFT;
  const headingAlignment = (layout === 'block-headers') ? AlignmentType.CENTER : AlignmentType.LEFT;

  // Scale font sizes from PDF template proportionally (PDF uses points directly, DOCX uses half-points)
  const titleSizeDocx = Math.round(style.pdf.titleSize * 2); // Convert to half-points
  const headingSizeDocx = Math.round(style.pdf.headingSize * 2);
  const bodySizeDocx = Math.round(style.pdf.bodySize * 2);

  const addHeading = (text) => {
    const headingText = (layout === 'formal') ? text.toUpperCase() : text;
    const underline = (layout === 'accented' || layout === 'minimalist') ? { type: UnderlineType.SINGLE } : undefined;
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: spacing.headingBefore, after: spacing.headingAfter },
      alignment: headingAlignment,
      children: [new TextRun({ 
        text: headingText, 
        font: style.docx.headingFont || style.docx.font || 'Calibri', 
        bold: true,
        size: headingSizeDocx,
        underline: underline,
        color: style.docx.headingColor || undefined
      })],
    }));
  };

  const subheadingSizeDocx = Math.round(style.pdf.subheadingSize * 2);

  const addSubheading = (text) => {
    if (!text) return;
    children.push(new Paragraph({
      spacing: { before: limitToOnePage ? 60 : 100, after: limitToOnePage ? 40 : 60 },
      children: [new TextRun({ 
        text, 
        font: style.docx.headingFont || style.docx.font || 'Calibri', 
        bold: true,
        size: subheadingSizeDocx,
        color: style.docx.headingColor || undefined
      })],
    }));
  };

  const addBullet = (text, level = 0) => {
    if (!text) return;
    children.push(new Paragraph({
      bullet: { level },
      spacing: { after: spacing.bulletSpacing },
      children: [new TextRun({ text, font: style.docx.font || 'Calibri', size: bodySizeDocx, color: style.docx.bodyColor || undefined })],
    }));
  };

  const addText = (text, spacingAfter = spacing.bodyAfter, indent = 0) => {
    if (!text) return;
    children.push(new Paragraph({
      spacing: { after: spacingAfter },
      indent: { left: indent },
      children: [new TextRun({ text, font: style.docx.font || 'Calibri', size: bodySizeDocx, color: style.docx.bodyColor || undefined })],
    }));
  };

  // Header with proper sizing
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: spacing.titleAfter },
    alignment: titleAlignment,
    children: [new TextRun({ 
      text: name, 
      font: style.docx.headingFont || style.docx.font || 'Calibri', 
      bold: true,
      size: titleSizeDocx,
      color: style.docx.titleColor || undefined
    })],
  }));
  if (contact) {
    children.push(new Paragraph({ 
      spacing: { after: spacing.contactAfter }, 
      alignment: titleAlignment,
      children: [new TextRun({ 
        text: contact, 
        font: style.docx.font || 'Calibri',
        size: bodySizeDocx,
        color: style.docx.contactColor || undefined
      })] 
    }));
  }

  // Summary
  const summary = tailored?.tailored_summary || parsed.summary;
  if (summary) {
    addHeading('Summary');
    addText(summary, style.docx.bodyAfter);
  }

  // Skills
  const skills = (tailored?.target_skills && tailored.target_skills.length > 0) ? tailored.target_skills : parsed.skills || [];
  if (skills && skills.length > 0) {
    addHeading('Skills');
    addText(Array.isArray(skills) ? skills.join(', ') : skills, style.docx.bodyAfter);
  }

  // Education first
  if (parsed.education && Array.isArray(parsed.education) && parsed.education.length > 0) {
    addHeading('Education');
    parsed.education.forEach((edu) => {
      if (!edu || typeof edu !== 'object') return;
      const heading = [edu.degree, edu.field].filter(Boolean).join(' in ');
      if (heading) {
        addSubheading(heading);
      }
      if (edu.school) {
        addText(edu.school, 80, 0);
      }
      if (edu.dates) {
        addText(edu.dates, style.docx.bodyAfter, 0);
      }
    });
  }

  // Experience
  const expList = (tailored?.tailored_experience && tailored.tailored_experience.length > 0)
    ? tailored.tailored_experience
    : parsed.experience || [];
  if (Array.isArray(expList) && expList.length > 0) {
    addHeading('Experience');
    // Limit to top 3 items if one-page constraint, otherwise show all
    const itemsToShow = limitToOnePage ? expList.slice(0, 3) : expList;
    itemsToShow.forEach((exp) => {
      if (!exp || typeof exp !== 'object') return;
      const title = exp.role || exp.title || '';
      const company = exp.company || '';
      const heading = [title, company].filter(Boolean).join(' at ');
      if (heading) {
        addSubheading(heading);
      }
      if (exp.dates) {
        addText(exp.dates, limitToOnePage ? 40 : 80, 0);
      }
      if (exp.description) addText(exp.description, limitToOnePage ? 60 : 100, 0);
      if (Array.isArray(exp.bullets) && exp.bullets.length > 0) {
        // Limit to 2 bullets if one-page, otherwise show all
        const bulletsToShow = limitToOnePage ? exp.bullets.slice(0, 2) : exp.bullets;
        bulletsToShow.forEach((b) => addBullet(b, 0));
      }
    });
  }

  // Projects (skip if one-page constraint to save space)
  if (!limitToOnePage) {
    const projects = parsed.projects;
    if (projects) {
      addHeading('Projects');
      if (Array.isArray(projects)) {
        projects.forEach((p) => {
          if (!p || typeof p !== 'object') return;
          const heading = [p.name, p.organization].filter(Boolean).join(' — ');
          if (heading) {
            addSubheading(heading);
          }
          if (p.dates) {
            addText(p.dates, 80, 0);
          }
          if (p.description) addText(p.description, 100, 0);
          if (Array.isArray(p.technologies) && p.technologies.length > 0) {
            children.push(new Paragraph({
              spacing: { after: spacing.bodyAfter },
              children: [
                new TextRun({ text: 'Technologies: ', font: style.docx.font || 'Calibri', size: bodySizeDocx, bold: true, color: style.docx.bodyColor || undefined }),
                new TextRun({ text: p.technologies.join(', '), font: style.docx.font || 'Calibri', size: bodySizeDocx, color: style.docx.bodyColor || undefined })
              ],
            }));
          }
        });
      } else if (typeof projects === 'string') {
        addText(projects, spacing.bodyAfter);
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
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
async function checkAndHandleSubscriptionExpiry(user) {
  if (!user) return;

  const subscription = await Subscription.findOne({
    where: { userId: user.id },
    order: [['createdAt', 'DESC']],
  });

  if (!subscription) return;

  const now = new Date();
  const currentPeriodEnd = new Date(subscription.currentPeriodEnd);

  // If subscription has expired, handle based on tier
  if (currentPeriodEnd < now && (subscription.status === 'active' || subscription.status === 'canceled')) {
    if (subscription.tier === 'one-time' && user.tier === 'monthly') {
      // Expire one-time add-on for monthly users
      subscription.status = 'expired';
      await subscription.save();

      const usageMetrics = await UsageMetrics.findOne({ where: { userId: user.id } });
      if (usageMetrics) {
        const baseLimit = TIER_CONFIG.monthly.generationsLimit || 200;
        const bonus = usageMetrics.bonusGenerations || 0;
        usageMetrics.generationsLimit = Math.max(baseLimit, usageMetrics.generationsLimit - bonus);
        usageMetrics.bonusGenerations = 0;
        usageMetrics.bonusExpiresAt = null;
        await usageMetrics.save();
      }

      console.log(`[Subscription] User ${user.id} one-time add-on expired. Bonus removed.`);
      return;
    }

    // Standalone one-time or canceled plan expired -> downgrade to auth-free
    user.tier = 'auth-free';
    await user.save();

    // Reset usage metrics to auth-free limits
    const usageMetrics = await UsageMetrics.findOne({ where: { userId: user.id } });
    if (usageMetrics) {
      usageMetrics.generationsUsed = 0;
      usageMetrics.generationsLimit = TIER_CONFIG['auth-free'].generationsLimit;
      usageMetrics.currentJobCount = 0;
      usageMetrics.maxJobCount = TIER_CONFIG['auth-free'].jobsPerSession;
      usageMetrics.resetDate = now;
      usageMetrics.bonusGenerations = 0;
      usageMetrics.bonusExpiresAt = null;
      await usageMetrics.save();
    }

    console.log(`[Subscription] User ${user.id} one-time plan expired. Downgraded to auth-free.`);
  }
}

// Helper: Apply one-time bonus for monthly users (and expire when needed)
async function applyMonthlyBonus(user, usageMetrics) {
  if (!user || !usageMetrics) return usageMetrics;
  if (user.tier !== 'monthly') return usageMetrics;

  const baseLimit = TIER_CONFIG.monthly.generationsLimit || 200;
  const bonus = Math.min(50, usageMetrics.bonusGenerations || 0);
  const bonusExpiry = usageMetrics.bonusExpiresAt ? new Date(usageMetrics.bonusExpiresAt) : null;
  const now = new Date();

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
      await checkAndHandleSubscriptionExpiry(user);

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
        const today = new Date();
        const monthsDiff = (today.getFullYear() - lastReset.getFullYear()) * 12 + (today.getMonth() - lastReset.getMonth());
        
        if (monthsDiff >= 1) {
          // Reset the counter
          console.log(`[/api/upload] Resetting counter for user ${req.userId} due to monthly reset`);
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
      objective: parsedResume?.objective || parsedResume?.summary || '',
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
      await checkAndHandleSubscriptionExpiry(user);

      // Check if monthly reset is needed for auth-free tier
      if (user.tier === 'auth-free' && usageMetrics.resetDate) {
        const lastReset = new Date(usageMetrics.resetDate);
        const today = new Date();
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
      tailoredResume = await tailorResumeWithGemini(parsed, jobDescription, limitToOnePage);
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

app.post('/api/export-pdf', async (req, res) => {
  try {
    const parsed = req.body?.parsed;
    const tailored = req.body?.tailored || null;
    const limitToOnePage = req.body?.limitToOnePage === 'true' || req.body?.limitToOnePage === true;

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing parsed resume data.' });
    }

    const templateKey = req.body?.templateKey || 'classic';
    const style = getTemplate(templateKey);
    const doc = new PDFDocument({ size: 'A4', margin: style.pdf.margin || 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
    doc.pipe(res);

    // Generate DOCX first for consistency, then PDF mirrors it (if needed)
    buildResumePdf(doc, parsed, tailored, templateKey, limitToOnePage);

    doc.end();
  } catch (error) {
    console.error('Error exporting PDF:', error);
    res.status(500).json({ success: false, error: 'Failed to generate PDF.' });
  }
});

app.post('/api/export-pdf-cover', async (req, res) => {
  try {
    const parsed = req.body?.parsed;
    const cover = req.body?.cover || {};
    const limitToOnePage = req.body?.limitToOnePage === 'true' || req.body?.limitToOnePage === true;

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing parsed resume data.' });
    }

    const templateKey = req.body?.templateKey || 'classic';
    const style = getTemplate(templateKey);
    const doc = new PDFDocument({ size: 'A4', margin: style.pdf.margin || 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="cover-letter.pdf"');
    doc.pipe(res);

    buildCoverPdf(doc, parsed, templateKey, cover, limitToOnePage);

    doc.end();
  } catch (error) {
    console.error('Error exporting PDF cover:', error);
    res.status(500).json({ success: false, error: 'Failed to generate PDF cover letter.' });
  }
});

app.post('/api/export-docx', async (req, res) => {
  try {
    const parsed = req.body?.parsed;
    const tailored = req.body?.tailored || null;
    const limitToOnePage = req.body?.limitToOnePage === 'true' || req.body?.limitToOnePage === true;

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing parsed resume data.' });
    }

    const templateKey = req.body?.templateKey || 'classic';
    const buffer = await buildResumeDocx(parsed, tailored, templateKey, limitToOnePage);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="resume.docx"');
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting DOCX:', error);
    res.status(500).json({ success: false, error: 'Failed to generate DOCX.' });
  }
});

app.post('/api/export-docx-cover', async (req, res) => {
  try {
    const parsed = req.body?.parsed;
    const cover = req.body?.cover || {};
    const limitToOnePage = req.body?.limitToOnePage === 'true' || req.body?.limitToOnePage === true;

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing parsed resume data.' });
    }

    const templateKey = req.body?.templateKey || 'classic';
    const buffer = await buildCoverDocx(parsed, templateKey, cover, limitToOnePage);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="cover-letter.docx"');
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting DOCX cover:', error);
    res.status(500).json({ success: false, error: 'Failed to generate DOCX cover letter.' });
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
    await transporter.sendMail({
      from: process.env.EMAIL_USER || 'resumerushio@gmail.com',
      to: 'resumerushio@gmail.com',
      subject: `Bug Report: ${title}`,
      html: emailHTML,
      attachments: attachments,
    });

    console.log('[Bug Report] Email sent successfully');

    // Clean up uploaded file after sending
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting temp file:', err);
      });
    }

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
      // Authenticated user
      const user = await User.findByPk(req.userId);
      const usageMetrics = await UsageMetrics.findOne({
        where: { userId: req.userId },
        order: [['createdAt', 'DESC']],
      });

      console.log(`[/api/usage] User ${req.userId}: found usageMetrics=${!!usageMetrics}, tier=${user?.tier}`);

      if (user && usageMetrics) {
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
            usageMetrics.resetDate = new Date();
            await usageMetrics.save();
          }
        }
        
        used = usageMetrics.generationsUsed;
        jobsUsed = usageMetrics.currentJobCount || 0;
        jobsLimit = usageMetrics.maxJobCount || TIER_CONFIG[tier]?.jobsPerSession || TIER_CONFIG.free.jobsPerSession;

        bonusGenerations = usageMetrics.bonusGenerations || 0;
        bonusExpiresAt = usageMetrics.bonusExpiresAt || null;
        if (bonusGenerations > 0 && bonusExpiresAt) {
          const now = new Date();
          const expiry = new Date(bonusExpiresAt);
          const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
          bonusDaysLeft = daysLeft > 0 ? daysLeft : 0;
        }
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
