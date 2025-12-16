require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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

    // Return the parsed data
    res.json({
      success: true,
      data: parsedResume,
      tailored: tailoredResume
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
