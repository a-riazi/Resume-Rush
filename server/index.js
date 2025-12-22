require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType } = require('docx');
const pdf = require('pdf-parse');
const PDFDocument = require('pdfkit');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const { templates, templateKeys, getTemplate } = require('./templates');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Extract text from PDF
async function extractTextFromPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  // pdf-parse default export is a function
  const data = await pdf(dataBuffer);
  return data.text;
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    
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
async function tailorResumeWithGemini(parsedResume, jobDescription) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

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
- For "recommended_template", choose one key from this list: ${templateKeys.join(', ')}.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    let text = response.text();

    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const tailored = JSON.parse(text);
    if (tailored && tailored.recommended_template && !templateKeys.includes(tailored.recommended_template)) {
      tailored.recommended_template = 'classic';
    }
    return tailored;
  } catch (error) {
    console.error('Gemini tailoring error:', error);
    throw new Error('Failed to tailor resume with AI');
  }
}

// Generate cover letter with Gemini
async function generateCoverLetterWithGemini(parsedResume, jobDescription) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    
    const resumeSummary = `
Name: ${parsedResume.name || 'N/A'}
Summary: ${parsedResume.summary || 'N/A'}
Skills: ${Array.isArray(parsedResume.skills) ? parsedResume.skills.join(', ') : 'N/A'}
Experience: ${Array.isArray(parsedResume.experience) ? parsedResume.experience.map(e => `${e.role || e.title || ''} at ${e.company || ''}`).join('; ') : 'N/A'}
Education: ${Array.isArray(parsedResume.education) ? parsedResume.education.map(e => `${e.degree || ''} from ${e.school || ''}`).join('; ') : 'N/A'}
`;

    const prompt = `You are a professional cover letter writer. Write a compelling, professional cover letter for this job application.

RESUME INFORMATION:
${resumeSummary}

JOB DESCRIPTION:
${jobDescription || 'General application for a position that matches the candidate\'s background'}

Write a complete cover letter with the following structure:
- Opening paragraph: Express interest in the position and briefly introduce yourself
- 2-3 body paragraphs: Highlight relevant experience, skills, and achievements that match the job requirements
- Closing paragraph: Express enthusiasm and request for an interview

Write in first person. Be professional, confident, and specific. Make connections between the resume and job requirements.
Keep it concise (3-4 paragraphs total, around 250-350 words).

Return ONLY the body paragraphs of the cover letter (no greeting like "Dear Hiring Manager", no closing like "Sincerely" - those will be added automatically).
Separate paragraphs with double newlines (\\n\\n).`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();
    
    return text;
  } catch (error) {
    console.error('Gemini cover letter generation error:', error);
    throw new Error('Failed to generate cover letter with AI');
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

function buildResumePdf(doc, parsed = {}, tailored = null, templateKey = 'classic') {
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
    expList.forEach((exp) => {
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
        exp.bullets.forEach((b) => {
          doc.font(bodyFont).fontSize(style.pdf.bodySize).fillColor(style.docx?.bodyColor ? `#${style.docx.bodyColor}` : style.pdf.bodyColor).text(`• ${b}`, { lineGap: 1.6 });
        });
      }
      doc.moveDown(style.pdf.sectionGap);
    });
  }

  // Projects
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

// Build PDF cover letter (mirrors DOCX layout/colors)
function buildCoverPdf(doc, parsed = {}, templateKey = 'classic', cover = {}) {
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
async function buildResumeDocx(parsed = {}, tailored = null, templateKey = 'classic') {
  const style = getTemplate(templateKey);
  const layout = style.layout || 'traditional';
  const children = [];

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
      spacing: { before: style.docx.headingBefore, after: style.docx.headingAfter },
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
      spacing: { before: 100, after: 60 },
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
      spacing: { after: style.docx.bulletSpacing },
      children: [new TextRun({ text, font: style.docx.font || 'Calibri', size: bodySizeDocx, color: style.docx.bodyColor || undefined })],
    }));
  };

  const addText = (text, spacingAfter = style.docx.bodyAfter, indent = 0) => {
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
    spacing: { after: style.docx.titleAfter },
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
      spacing: { after: style.docx.contactAfter }, 
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
    expList.forEach((exp) => {
      if (!exp || typeof exp !== 'object') return;
      const title = exp.role || exp.title || '';
      const company = exp.company || '';
      const heading = [title, company].filter(Boolean).join(' at ');
      if (heading) {
        addSubheading(heading);
      }
      if (exp.dates) {
        addText(exp.dates, 80, 0);
      }
      if (exp.description) addText(exp.description, 100, 0);
      if (Array.isArray(exp.bullets) && exp.bullets.length > 0) {
        exp.bullets.forEach((b) => addBullet(b, 0));
      }
    });
  }

  // Projects
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
            spacing: { after: style.docx.bodyAfter },
            children: [
              new TextRun({ text: 'Technologies: ', font: style.docx.font || 'Calibri', size: bodySizeDocx, bold: true, color: style.docx.bodyColor || undefined }),
              new TextRun({ text: p.technologies.join(', '), font: style.docx.font || 'Calibri', size: bodySizeDocx, color: style.docx.bodyColor || undefined })
            ],
          }));
        }
      });
    } else if (typeof projects === 'string') {
      addText(projects, style.docx.bodyAfter);
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

// Build DOCX cover letter
async function buildCoverDocx(parsed = {}, templateKey = 'classic', cover = {}) {
  const style = getTemplate(templateKey);
  const layout = style.layout || 'traditional';
  const children = [];

  const name = parsed.name || 'Your Name';
  const contact = [parsed.email, parsed.phone, parsed.location].filter(Boolean).join(' · ');
  const titleAlignment = (layout === 'centered' || layout === 'formal' || layout === 'minimalist' || layout === 'minimal' || layout === 'high-contrast' || layout === 'block-headers') ? AlignmentType.CENTER : AlignmentType.LEFT;

  const titleSizeDocx = Math.round(style.pdf.titleSize * 2);
  const bodySizeDocx = Math.round(style.pdf.bodySize * 2);

  const addText = (text, spacingAfter = style.docx.bodyAfter) => {
    if (!text) return;
    children.push(new Paragraph({
      spacing: { after: spacingAfter },
      children: [new TextRun({ text, font: style.docx.font || 'Calibri', size: bodySizeDocx, color: style.docx.bodyColor || undefined })],
    }));
  };

  // Header
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: style.docx.titleAfter },
    alignment: titleAlignment,
    children: [new TextRun({ text: name, font: style.docx.headingFont || style.docx.font || 'Calibri', bold: true, size: titleSizeDocx, color: style.docx.titleColor || undefined })],
  }));
  if (contact) {
    children.push(new Paragraph({ spacing: { after: style.docx.contactAfter }, alignment: titleAlignment, children: [new TextRun({ text: contact, font: style.docx.font || 'Calibri', size: bodySizeDocx, color: style.docx.contactColor || undefined })] }));
  }

  // Date
  const dateText = cover.date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  addText(dateText, style.docx.bodyAfter);

  // Recipient block
  const recipientLines = [cover.recipientName, cover.recipientTitle, cover.company, cover.address1, cover.address2].filter(Boolean);
  recipientLines.forEach(line => addText(line, 80));

  // Greeting
  addText(cover.greeting || 'Dear Hiring Manager,', style.docx.bodyAfter);

  // Body paragraphs
  const body = (cover.body || '').trim();
  if (body.length > 0) {
    // Replace escaped newlines (\n) with actual newlines, then split by newlines
    const cleanedBody = body.replace(/\\n/g, '\n');
    cleanedBody.split(/\n+/).filter(p => p.trim().length > 0).forEach(p => addText(p.trim(), style.docx.bodyAfter));
  } else if (parsed.summary) {
    addText(parsed.summary, style.docx.bodyAfter);
  }

  // Closing
  addText(cover.closing || 'Sincerely,', 120);
  addText(name, style.docx.bodyAfter);

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// Upload and parse endpoint
app.post('/api/upload', upload.single('resume'), async (req, res) => {
  let filePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const jobDescription = (req.body?.jobDescription || '').trim();

    filePath = req.file.path;
    console.log(`Processing file: ${req.file.originalname}`);

    // Extract text from the resume
    const resumeText = await extractText(filePath, req.file.mimetype);
    
    if (!resumeText || resumeText.trim().length === 0) {
      throw new Error('Could not extract text from the file. The file may be empty or corrupted.');
    }

    console.log('Text extracted, sending to Gemini...');

    // Parse with Gemini
    const parsedResume = await parseResumeWithGemini(resumeText);

    let tailoredResume = null;
    let coverLetter = null;
    if (jobDescription.length > 0) {
      console.log('Tailoring resume to job description...');
      tailoredResume = await tailorResumeWithGemini(parsedResume, jobDescription);
      console.log('Generating cover letter...');
      coverLetter = await generateCoverLetterWithGemini(parsedResume, jobDescription);
    }

    console.log('Resume parsed successfully');

    // Delete the uploaded file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

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

    res.json({
      success: true,
      data: normalizedParsed,
      tailored: tailoredResume || null,
      coverLetter: coverLetter || null
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

app.post('/api/export-pdf', async (req, res) => {
  try {
    const parsed = req.body?.parsed;
    const tailored = req.body?.tailored || null;

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing parsed resume data.' });
    }

    const templateKey = req.body?.templateKey || 'classic';
    const style = getTemplate(templateKey);
    const doc = new PDFDocument({ size: 'A4', margin: style.pdf.margin || 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
    doc.pipe(res);

    buildResumePdf(doc, parsed, tailored, templateKey);

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

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing parsed resume data.' });
    }

    const templateKey = req.body?.templateKey || 'classic';
    const style = getTemplate(templateKey);
    const doc = new PDFDocument({ size: 'A4', margin: style.pdf.margin || 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="cover-letter.pdf"');
    doc.pipe(res);

    buildCoverPdf(doc, parsed, templateKey, cover);

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

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing parsed resume data.' });
    }

    const templateKey = req.body?.templateKey || 'classic';
    const buffer = await buildResumeDocx(parsed, tailored, templateKey);

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

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing parsed resume data.' });
    }

    const templateKey = req.body?.templateKey || 'classic';
    const buffer = await buildCoverDocx(parsed, templateKey, cover);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="cover-letter.docx"');
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting DOCX cover:', error);
    res.status(500).json({ success: false, error: 'Failed to generate DOCX cover letter.' });
  }
});

// Proofread endpoint

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Resume Rocket API is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Resume Rocket server running on http://localhost:${PORT}`);
  console.log(`✓ Gemini API configured`);
  console.log(`✓ Ready to parse resumes`);
});
