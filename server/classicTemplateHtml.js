// ─────────────────────────────────────────────────────────────────────────────
// Classic Resume — HTML Template  (high-quality rewrite)
// Self-contained HTML, inline styles only, ATS-safe.
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(val) {
  if (val == null) return '';
  return String(val)
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Strip common section-label prefixes Gemini may include in summary text.
// e.g. "Objective: Master's student…" → "Master's student…"
function cleanSummary(val) {
  if (!val) return '';
  return String(val)
    .trim()
    .replace(/^(objective|professional summary|summary|profile|overview|about me)\s*[:\-–—]?\s*/i, '')
    .trim();
}

function dedupeContactValues(values) {
  const seen = new Set();
  return (values || [])
    .filter(Boolean)
    .map((v) => String(v).trim())
    .filter(Boolean)
    .filter((v) => {
      const key = v.toLowerCase().replace(/\/+$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sectionHeading(title) {
  return `
  <h2 style="
    font-family: Georgia, serif;
    font-size: 10.5pt;
    font-weight: bold;
    color: #111;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 12pt 0 3pt 0;
    padding-bottom: 2.5pt;
    border-bottom: 1.25px solid #222;
    page-break-after: avoid;
  ">${esc(title)}</h2>`;
}

// Two-column row: left = rich HTML, right = date right-aligned.
function rowWithDate(leftHtml, dateText) {
  const base = 'border:none;padding:0;vertical-align:top;font-family:Georgia,serif;font-size:10pt;color:#1a1a1a;';
  return `
  <table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:none;margin:4pt 0 0 0;page-break-inside:avoid;">
    <tr>
      <td style="${base} width:76%;">${leftHtml}</td>
      <td style="${base} width:24%;text-align:right;color:#555;font-size:9.5pt;">${esc(dateText)}</td>
    </tr>
  </table>`;
}

// ── Section builders ──────────────────────────────────────────────────────────

function headerSection(parsed) {
  const name = esc(parsed.name || parsed.fullName || '');

  const contactParts = dedupeContactValues([
    parsed.email,
    parsed.phone,
    parsed.location,
    parsed.linkedin || parsed.links?.linkedin,
    parsed.github   || parsed.links?.github,
    parsed.website  || parsed.links?.portfolio,
  ]).map(esc);
  const contact = contactParts.join(' &nbsp;&bull;&nbsp; ');

  let html = '\n  <div style="text-align:center;margin-bottom:10pt;padding-bottom:8pt;border-bottom:2px solid #111;">';

  if (name) {
    html += `
    <h1 style="
      font-family: Georgia, serif;
      font-size: 20pt;
      font-weight: bold;
      color: #111;
      margin: 0 0 5pt 0;
      letter-spacing: 0.03em;
    ">${name}</h1>`;
  } else {
    html += `
    <p style="font-family:Georgia,serif;font-size:11pt;color:#c00;margin:0 0 4pt 0;">[Name not extracted — please re-upload your resume]</p>`;
  }

  if (contact) {
    html += `
    <p style="
      font-family: Georgia, serif;
      font-size: 9.5pt;
      color: #444;
      margin: 0;
      line-height: 1.5;
    ">${contact}</p>`;
  }

  html += '\n  </div>';
  return html;
}

function summarySection(parsed, tailored) {
  const raw = tailored?.tailored_summary || parsed.summary || parsed.objective || '';
  const text = esc(cleanSummary(raw));
  if (!text) return '';

  return sectionHeading('Professional Summary') + `
  <p style="
    font-family: Georgia, serif;
    font-size: 10pt;
    color: #1a1a1a;
    margin: 4pt 0 0 0;
    line-height: 1.55;
  ">${text}</p>`;
}

function experienceSection(parsed, tailored) {
  const items = tailored?.tailored_experience || parsed.experience || [];
  if (!Array.isArray(items) || items.length === 0) return '';

  let html = sectionHeading('Experience');

  for (const exp of items) {
    const company = esc(exp.company || '');
    const role    = esc(exp.role || exp.title || '');
    const dates   = exp.dates || exp.dateRange || '';
    const bullets = Array.isArray(exp.bullets) ? exp.bullets : [];

    let leftHtml = '';
    if (company && role) {
      leftHtml = `<span style="font-weight:bold;">${company}</span><span style="color:#555;"> &mdash; </span><span style="font-style:italic;">${role}</span>`;
    } else if (company) {
      leftHtml = `<span style="font-weight:bold;">${company}</span>`;
    } else if (role) {
      leftHtml = `<span style="font-style:italic;">${role}</span>`;
    }

    html += rowWithDate(leftHtml, dates);

    if (bullets.length) {
      html += '\n  <ul style="margin:3pt 0 6pt 16pt;padding:0;page-break-inside:avoid;">';
      for (const b of bullets) {
        if (b && String(b).trim()) {
          html += `\n    <li style="font-family:Georgia,serif;font-size:10pt;color:#1a1a1a;margin-bottom:2pt;line-height:1.45;page-break-inside:avoid;">${esc(b)}</li>`;
        }
      }
      html += '\n  </ul>';
    } else {
      html += '<div style="margin-bottom:7pt;"></div>';
    }
  }
  return html;
}

function educationSection(parsed) {
  const items = parsed.education || [];
  if (!Array.isArray(items) || items.length === 0) return '';

  let html = sectionHeading('Education');

  for (const edu of items) {
    const school  = esc(edu.school || edu.institution || '');
    const degree  = esc(edu.degree || '');
    const field   = esc(edu.field || edu.major || '');
    const dates   = edu.dates || edu.dateRange || edu.graduationDate || '';
    const gpa     = edu.gpa ? ` &nbsp;&bull;&nbsp; GPA: ${esc(edu.gpa)}` : '';
    const degLine = [degree, field].filter(Boolean).join(' in ');

    html += rowWithDate(`<span style="font-weight:bold;">${school}</span>`, dates);
    if (degLine) {
      html += `\n  <p style="font-family:Georgia,serif;font-size:10pt;font-style:italic;color:#444;margin:2pt 0 6pt 0;">${degLine}${gpa}</p>`;
    } else {
      html += '<div style="margin-bottom:6pt;"></div>';
    }
  }
  return html;
}

function skillsSection(parsed, tailored) {
  // Prefer categorized skills from tailored output
  const grouped = tailored?.skills_grouped;
  if (grouped && typeof grouped === 'object' && Object.keys(grouped).length > 0) {
    let html = sectionHeading('Skills');
    for (const [category, skills] of Object.entries(grouped)) {
      if (!Array.isArray(skills) || skills.length === 0) continue;
      html += `\n  <p style="font-family:Georgia,serif;font-size:10pt;color:#1a1a1a;margin:4pt 0 2pt 0;line-height:1.5;"><span style="font-weight:bold;">${esc(category)}:</span> ${skills.map(esc).join(', ')}</p>`;
    }
    return html;
  }

  // Fallback: flat list with bullet separators
  let skillsList = [];
  if (Array.isArray(tailored?.target_skills) && tailored.target_skills.length) {
    skillsList = tailored.target_skills;
  } else if (Array.isArray(parsed.skills) && parsed.skills.length) {
    skillsList = parsed.skills;
  } else if (typeof parsed.technical_skills === 'string' && parsed.technical_skills.trim()) {
    skillsList = parsed.technical_skills.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (!skillsList.length) return '';

  return sectionHeading('Skills') + `
  <p style="font-family:Georgia,serif;font-size:10pt;color:#1a1a1a;margin:4pt 0 0 0;line-height:1.55;">${skillsList.map(esc).join(' &bull; ')}</p>`;
}

function projectsSection(parsed, tailored) {
  const items = tailored?.tailored_projects || parsed.projects || [];
  if (!Array.isArray(items) || items.length === 0) return '';

  let html = sectionHeading('Projects');

  for (const proj of items) {
    const title = esc(proj.name || proj.title || '');
    const org   = esc(proj.organization || '');
    const dates = proj.dates || '';
    const desc  = esc(proj.description || '');
    const techs = Array.isArray(proj.technologies)
      ? proj.technologies.filter(Boolean).map(esc)
      : [];

    let leftHtml = title ? `<span style="font-weight:bold;">${title}</span>` : '';
    if (org) leftHtml += `<span style="color:#555;"> &mdash; </span><span style="font-style:italic;">${org}</span>`;
    if (leftHtml) html += rowWithDate(leftHtml, dates);

    if (desc) {
      html += `\n  <p style="font-family:Georgia,serif;font-size:10pt;color:#1a1a1a;margin:2pt 0 2pt 0;line-height:1.45;">${desc}</p>`;
    }
    if (techs.length) {
      html += `\n  <p style="font-family:Georgia,serif;font-size:9.5pt;color:#555;margin:1pt 0 6pt 0;font-style:italic;">${techs.join(', ')}</p>`;
    } else {
      html += '<div style="margin-bottom:6pt;"></div>';
    }
  }
  return html;
}

function certificationsSection(parsed) {
  const items = parsed.certifications || [];
  if (!Array.isArray(items) || items.length === 0) return '';

  let html = sectionHeading('Certifications');
  for (const cert of items) {
    const name   = esc(cert.name || '');
    const issuer = esc(cert.issuer || '');
    const date   = cert.date || '';
    if (!name) continue;
    const leftHtml = issuer
      ? `<span style="font-weight:bold;">${name}</span> <span style="color:#555;">&mdash;</span> <span style="font-style:italic;">${issuer}</span>`
      : `<span style="font-weight:bold;">${name}</span>`;
    html += rowWithDate(leftHtml, date);
    html += '<div style="margin-bottom:4pt;"></div>';
  }
  return html;
}

function awardsSection(parsed) {
  const items = parsed.awards || [];
  if (!Array.isArray(items) || items.length === 0) return '';

  let html = sectionHeading('Awards & Honors');
  for (const award of items) {
    const title  = esc(award.title || '');
    const issuer = esc(award.issuer || '');
    const date   = award.date || '';
    if (!title) continue;
    const leftHtml = issuer
      ? `<span style="font-weight:bold;">${title}</span> <span style="color:#555;">&mdash;</span> <span style="font-style:italic;">${issuer}</span>`
      : `<span style="font-weight:bold;">${title}</span>`;
    html += rowWithDate(leftHtml, date);
    html += '<div style="margin-bottom:4pt;"></div>';
  }
  return html;
}

function languagesSection(parsed) {
  const items = parsed.languages || [];
  if (!Array.isArray(items) || items.length === 0) return '';
  return sectionHeading('Languages') + `
  <p style="font-family:Georgia,serif;font-size:10pt;color:#1a1a1a;margin:4pt 0 0 0;">${items.map(esc).join(' &bull; ')}</p>`;
}

// ── Dynamic section order ─────────────────────────────────────────────────────
// tailored.sections may contain an ordered array like:
//   ["summary", "education", "skills", "experience", "projects"]
// Entry-level/academic resumes put education before experience.

const SECTION_RENDERERS = {
  summary:        (p, t) => summarySection(p, t),
  experience:     (p, t) => experienceSection(p, t),
  education:      (p)    => educationSection(p),
  skills:         (p, t) => skillsSection(p, t),
  projects:       (p, t) => projectsSection(p, t),
  certifications: (p)    => certificationsSection(p),
  awards:         (p)    => awardsSection(p),
  languages:      (p)    => languagesSection(p),
};

const DEFAULT_ORDER = ['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'awards', 'languages'];

// ── Main export ───────────────────────────────────────────────────────────────

function buildClassicHtml(parsed = {}, tailored = null) {
  let body = headerSection(parsed);

  const order = (Array.isArray(tailored?.sections) && tailored.sections.length > 0)
    ? [...tailored.sections, ...DEFAULT_ORDER.filter(k => !tailored.sections.includes(k))]
    : DEFAULT_ORDER;

  const seen = new Set();
  for (const key of order) {
    if (seen.has(key)) continue;
    seen.add(key);
    const render = SECTION_RENDERERS[key];
    if (render) body += render(parsed, tailored);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Resume</title>
  <style>
    @page { margin: 0.67in 0.75in; }
    @media print {
      body { padding: 0 !important; margin: 0 !important; max-width: none !important; }
      h2 { page-break-after: avoid; }
      table { page-break-inside: avoid; }
      ul { page-break-inside: avoid; }
      li { page-break-inside: avoid; }
      p { orphans: 3; widows: 3; }
    }
  </style>
</head>
<body style="
  font-family: Georgia, serif;
  font-size: 10pt;
  color: #1a1a1a;
  margin: 0 auto;
  padding: 48pt 54pt 60pt 54pt;
  max-width: 760px;
  background: #fff;
  line-height: 1.4;
">
${body}
</body>
</html>`;
}

module.exports = { buildClassicHtml };
