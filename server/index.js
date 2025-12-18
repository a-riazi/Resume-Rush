require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const pdf = require('pdf-parse');
const PDFDocument = require('pdfkit');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

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
  ]
}

Rules:
- Use ONLY facts from the candidate data; do not fabricate companies, roles, or metrics.
- Prefer concise, action-oriented bullets; mirror job terminology where appropriate.
- Integrate relevant job keywords directly into the summary and bullets instead of listing them separately.
- Do NOT mention the job title, company, or that this is tailored to a specific posting; weave fit implicitly without explicit job references.
- If something is missing, use empty string or empty array.
- Output must be valid JSON with no trailing commas.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    let text = response.text();

    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const tailored = JSON.parse(text);
    return tailored;
  } catch (error) {
    console.error('Gemini tailoring error:', error);
    throw new Error('Failed to tailor resume with AI');
  }
}


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

function addSectionTitle(doc, text) {
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111').text(text);
  doc.moveDown(0.25);
}

function addLine(doc) {
  doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke();
  doc.moveDown(0.6);
}

function buildResumePdf(doc, parsed = {}, tailored = null) {
  const contact = [parsed.email, parsed.phone, parsed.location].filter(Boolean).join(' · ');
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#111').text(parsed.name || 'Resume');
  if (contact) {
    doc.moveDown(0.15);
    doc.font('Helvetica').fontSize(11).fillColor('#444').text(contact);
  }
  addLine(doc);

  const summary = tailored?.tailored_summary || parsed.summary;
  if (summary) {
    addSectionTitle(doc, 'Summary');
    doc.font('Helvetica').fontSize(11).fillColor('#222').text(summary, { lineGap: 2 });
  }

  const skills = (tailored?.target_skills && tailored.target_skills.length > 0) ? tailored.target_skills : parsed.skills || [];
  if (skills.length > 0) {
    addSectionTitle(doc, 'Skills');
    doc.font('Helvetica').fontSize(11).fillColor('#222').text(skills.join(', '), { lineGap: 2 });
  }

  // Render Education before Experience
  if (parsed.education && Array.isArray(parsed.education) && parsed.education.length > 0) {
    addSectionTitle(doc, 'Education');
    parsed.education.forEach((edu) => {
      const heading = [edu.degree, edu.field].filter(Boolean).join(' in ');
      if (heading) {
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text(heading);
      }
      if (edu.school) {
        doc.font('Helvetica').fontSize(11).fillColor('#222').text(edu.school);
      }
      if (edu.dates) {
        doc.font('Helvetica').fontSize(10).fillColor('#666').text(edu.dates);
      }
      doc.moveDown(0.5);
    });
  }

  const expList = (tailored?.tailored_experience && tailored.tailored_experience.length > 0)
    ? tailored.tailored_experience
    : parsed.experience || [];
  if (expList.length > 0) {
    addSectionTitle(doc, 'Experience');
    expList.forEach((exp) => {
      const title = exp.role || exp.title || '';
      const company = exp.company || '';
      const heading = [title, company].filter(Boolean).join(' at ');
      if (heading) {
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text(heading);
      }
      if (exp.dates) {
        doc.font('Helvetica').fontSize(10).fillColor('#666').text(exp.dates);
      }
      if (exp.description) {
        doc.font('Helvetica').fontSize(11).fillColor('#222').text(exp.description, { lineGap: 2 });
      }
      if (exp.bullets && Array.isArray(exp.bullets) && exp.bullets.length > 0) {
        doc.moveDown(0.15);
        exp.bullets.forEach((b) => {
          doc.font('Helvetica').fontSize(11).fillColor('#222').text(`• ${b}`, { lineGap: 1.5 });
        });
      }
      doc.moveDown(0.6);
    });
  }

  // Projects
  const projects = parsed.projects;
  if (projects) {
    addSectionTitle(doc, 'Projects');
    if (Array.isArray(projects)) {
      projects.forEach((p) => {
        if (!p || typeof p !== 'object') return;
        const name = p.name || '';
        const org = p.organization || '';
        const heading = [name, org].filter(Boolean).join(' — ');
        if (heading) {
          doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text(heading);
        }
        if (p.dates) {
          doc.font('Helvetica').fontSize(10).fillColor('#666').text(p.dates);
        }
        if (p.description) {
          doc.font('Helvetica').fontSize(11).fillColor('#222').text(p.description, { lineGap: 2 });
        }
        if (Array.isArray(p.technologies) && p.technologies.length > 0) {
          doc.moveDown(0.15);
          doc.font('Helvetica').fontSize(11).fillColor('#222').text(`Technologies: ${p.technologies.join(', ')}`, { lineGap: 1.5 });
        }
        doc.moveDown(0.5);
      });
    } else if (typeof projects === 'string') {
      doc.font('Helvetica').fontSize(11).fillColor('#222').text(projects, { lineGap: 2 });
    }
  }
}

// Build DOCX resume
async function buildResumeDocx(parsed = {}, tailored = null) {
  const children = [];

  const name = parsed.name || 'Resume';
  const contact = [parsed.email, parsed.phone, parsed.location].filter(Boolean).join(' · ');

  const addHeading = (text) => {
    children.push(new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 120 } }));
  };

  const addBullet = (text, level = 0) => {
    if (!text) return;
    children.push(new Paragraph({ text, bullet: { level }, spacing: { after: 80 } }));
  };

  const addText = (text, spacingAfter = 120, indent = 0) => {
    if (!text) return;
    children.push(new Paragraph({ text, spacing: { after: spacingAfter }, indent: { left: indent } }));
  };

  // Header
  children.push(new Paragraph({ text: name, heading: HeadingLevel.TITLE, spacing: { after: 140 } }));
  if (contact) {
    children.push(new Paragraph({ text: contact, spacing: { after: 220 } }));
  }

  // Summary
  const summary = tailored?.tailored_summary || parsed.summary;
  if (summary) {
    addHeading('Summary');
    addText(summary, 140);
  }

  // Skills
  const skills = (tailored?.target_skills && tailored.target_skills.length > 0) ? tailored.target_skills : parsed.skills || [];
  if (skills && skills.length > 0) {
    addHeading('Skills');
    addText(Array.isArray(skills) ? skills.join(', ') : skills, 140);
  }

  // Education first
  if (parsed.education && Array.isArray(parsed.education) && parsed.education.length > 0) {
    addHeading('Education');
    parsed.education.forEach((edu) => {
      if (!edu || typeof edu !== 'object') return;
      const heading = [edu.degree, edu.field].filter(Boolean).join(' in ');
      const line = heading || edu.school || '';
      const dates = edu.dates ? ` (${edu.dates})` : '';
      addBullet(`${line}${dates}`.trim(), 0);
      if (edu.school && edu.school !== line) {
        addText(edu.school, 100, 360);
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
      const dates = exp.dates ? ` (${exp.dates})` : '';
      addBullet(`${heading}${dates}`.trim(), 0);
      if (exp.description) addText(exp.description, 100, 360);
      if (Array.isArray(exp.bullets) && exp.bullets.length > 0) {
        exp.bullets.forEach((b) => addBullet(b, 1));
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
        const dates = p.dates ? ` (${p.dates})` : '';
        addBullet(`${heading}${dates}`.trim(), 0);
        if (p.description) addText(p.description, 100, 360);
        if (Array.isArray(p.technologies) && p.technologies.length > 0) {
          addText(`Technologies: ${p.technologies.join(', ')}`, 100, 360);
        }
      });
    } else if (typeof projects === 'string') {
      addText(projects, 140);
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

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
    if (jobDescription.length > 0) {
      console.log('Tailoring resume to job description...');
      tailoredResume = await tailorResumeWithGemini(parsedResume, jobDescription);
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
      tailored: tailoredResume || null
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

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
    doc.pipe(res);

    buildResumePdf(doc, parsed, tailored);

    doc.end();
  } catch (error) {
    console.error('Error exporting PDF:', error);
    res.status(500).json({ success: false, error: 'Failed to generate PDF.' });
  }
});

app.post('/api/export-docx', async (req, res) => {
  try {
    const parsed = req.body?.parsed;
    const tailored = req.body?.tailored || null;

    if (!parsed || typeof parsed !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing parsed resume data.' });
    }

    const buffer = await buildResumeDocx(parsed, tailored);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="resume.docx"');
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting DOCX:', error);
    res.status(500).json({ success: false, error: 'Failed to generate DOCX.' });
  }
});

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
