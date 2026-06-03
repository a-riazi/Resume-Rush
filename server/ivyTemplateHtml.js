// ─────────────────────────────────────────────────────────────────────────────
// Ivy Resume — HTML Template
// Harvard/HBS style: centered header + HR divider, Arial font, centered bold
// section headings (no border), two-line entry rows, Activities section.
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

// ── Layout primitives ─────────────────────────────────────────────────────────

// Centered bold section heading — no border, no underline (key Ivy characteristic).
function ivySectionHeading(title) {
  return `
  <p style="
    font-family: Arial, sans-serif;
    font-size: 11pt;
    font-weight: bold;
    color: #000;
    text-align: center;
    margin: 12pt 0 3pt 0;
    padding: 0;
    page-break-after: avoid;
  ">${esc(title)}</p>`;
}

// Two-column table row: bold left content + plain right content (right-aligned).
// Used for: Institution + Location, Company + Location, Role + Dates.
function ivyRow(leftBoldHtml, rightHtml) {
  const cell = 'border:none;padding:0;vertical-align:top;font-family:Arial,sans-serif;font-size:11pt;color:#000;';
  return `
  <table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:none;margin:2pt 0 0 0;page-break-inside:avoid;">
    <tr>
      <td style="${cell}width:68%;font-weight:bold;">${leftBoldHtml}</td>
      <td style="${cell}width:32%;text-align:right;font-weight:400;">${rightHtml}</td>
    </tr>
  </table>`;
}

// ── Section builders ──────────────────────────────────────────────────────────

function ivyHeaderSection(parsed) {
  const name = esc(parsed.name || parsed.fullName || '');

  const contactParts = dedupeContactValues([
    parsed.location,
    parsed.phone,
    parsed.email,
    parsed.linkedin || parsed.links?.linkedin,
    parsed.github   || parsed.links?.github,
    parsed.website  || parsed.links?.portfolio,
  ]).map(esc);
  const contact = contactParts.join(' &nbsp;&bull;&nbsp; ');

  let html = '\n  <div style="text-align:center;margin-bottom:2pt;">';

  if (name) {
    html += `
    <p style="
      font-family: Arial, sans-serif;
      font-size: 20pt;
      font-weight: bold;
      color: #000;
      margin: 0;
      line-height: 1.2;
    ">${name}</p>`;
  } else {
    html += `
    <p style="font-family:Arial,sans-serif;font-size:11pt;color:#c00;margin:0;">[Name not extracted — please re-upload your resume]</p>`;
  }

  html += '\n  </div>';
  html += '\n  <hr style="border:none;border-top:1px solid #000;margin:5pt 0 5pt 0;">';

  if (contact) {
    html += `
  <p style="
    font-family: Arial, sans-serif;
    font-size: 10pt;
    color: #555;
    text-align: center;
    margin: 0 0 8pt 0;
    line-height: 1.5;
  ">${contact}</p>`;
  }

  return html;
}

function ivySummarySection(parsed, tailored) {
  const raw = tailored?.tailored_summary || parsed.summary || parsed.objective || '';
  const text = esc(cleanSummary(raw));
  if (!text) return '';

  return ivySectionHeading('Summary') + `
  <p style="
    font-family: Arial, sans-serif;
    font-size: 10.5pt;
    color: #000;
    margin: 4pt 0 0 0;
    line-height: 1.5;
  ">${text}</p>`;
}

function ivyEducationSection(parsed) {
  const items = parsed.education || [];
  if (!Array.isArray(items) || items.length === 0) return '';

  let html = ivySectionHeading('Education');

  for (const edu of items) {
    const school    = esc(edu.school || edu.institution || '');
    const location  = esc(edu.location || edu.address || '');
    const degree    = esc(edu.degree || '');
    const field     = esc(edu.field || edu.major || edu.concentration || '');
    const gpa       = edu.gpa ? ` &nbsp;&bull;&nbsp; GPA: ${esc(String(edu.gpa))}` : '';
    const dates     = esc(edu.dates || edu.dateRange || edu.graduationDate || '');
    const extraInfo = esc(edu.honors || edu.notes || edu.other || '');

    const degLine = [degree, field].filter(Boolean).join(', ');

    // Row 1: bold institution + location
    html += ivyRow(school || '&nbsp;', location);

    // Degree + concentration + optional GPA
    if (degLine) {
      html += `\n  <p style="font-family:Arial,sans-serif;font-size:11pt;color:#000;margin:1pt 0 0 0;line-height:1.3;">${degLine}${gpa}</p>`;
    }
    // Dates
    if (dates) {
      html += `\n  <p style="font-family:Arial,sans-serif;font-size:11pt;color:#000;margin:1pt 0 0 0;line-height:1.3;">${dates}</p>`;
    }
    // Extra info (honors, notes)
    if (extraInfo) {
      html += `\n  <p style="font-family:Arial,sans-serif;font-size:11pt;color:#000;margin:1pt 0 0 0;line-height:1.3;">${extraInfo}</p>`;
    }
    html += '\n  <div style="margin-bottom:6pt;"></div>';
  }

  return html;
}

function ivyExperienceSection(parsed, tailored) {
  const items = tailored?.tailored_experience || parsed.experience || [];
  if (!Array.isArray(items) || items.length === 0) return '';

  let html = ivySectionHeading('Experience');

  for (const exp of items) {
    const company  = esc(exp.company || '');
    const location = esc(exp.location || exp.address || '');
    const role     = esc(exp.role || exp.title || '');
    const dates    = esc(exp.dates || exp.dateRange || '');
    const bullets  = Array.isArray(exp.bullets) ? exp.bullets : [];

    // Row 1: bold company + location
    html += ivyRow(company || '&nbsp;', location);
    // Row 2: bold role + dates
    html += ivyRow(role || '&nbsp;', dates);

    if (bullets.length) {
      html += '\n  <ul style="margin:3pt 0 5pt 18pt;padding:0;page-break-inside:avoid;">';
      for (const b of bullets) {
        if (b && String(b).trim()) {
          html += `\n    <li style="font-family:Arial,sans-serif;font-size:10.5pt;color:#000;margin-bottom:2pt;line-height:1.4;page-break-inside:avoid;">${esc(b)}</li>`;
        }
      }
      html += '\n  </ul>';
    } else {
      html += '\n  <div style="margin-bottom:6pt;"></div>';
    }
  }

  return html;
}

// Activities: extracurricular involvement, clubs, organizations, volunteer work.
// Data priority: tailored_activities → tailored_projects → parsed.activities → parsed.projects
function ivyActivitiesSection(parsed, tailored) {
  const items = (
    tailored?.tailored_activities ||
    tailored?.tailored_projects ||
    parsed.activities ||
    parsed.projects ||
    []
  );
  if (!Array.isArray(items) || items.length === 0) return '';

  let html = ivySectionHeading('Activities');

  for (const item of items) {
    // Support both experience-style {company/role} and project/activity-style {org/name/description}
    const org      = esc(item.org || item.organization || item.company || item.name || item.title || '');
    const location = esc(item.location || item.address || '');
    const role     = esc(item.role || item.position || '');
    const dates    = esc(item.dates || item.dateRange || '');
    const bullets  = Array.isArray(item.bullets) ? item.bullets : [];
    const desc     = esc(item.description || '');

    // Row 1: bold org/name + location (omit row if empty)
    if (org || location) {
      html += ivyRow(org || '&nbsp;', location);
    }
    // Row 2: bold role + dates (omit if both empty)
    if (role || dates) {
      html += ivyRow(role || '&nbsp;', dates);
    }

    if (bullets.length) {
      html += '\n  <ul style="margin:3pt 0 5pt 18pt;padding:0;page-break-inside:avoid;">';
      for (const b of bullets) {
        if (b && String(b).trim()) {
          html += `\n    <li style="font-family:Arial,sans-serif;font-size:10.5pt;color:#000;margin-bottom:2pt;line-height:1.4;page-break-inside:avoid;">${esc(b)}</li>`;
        }
      }
      html += '\n  </ul>';
    } else if (desc) {
      html += `\n  <p style="font-family:Arial,sans-serif;font-size:10.5pt;color:#000;margin:2pt 0 5pt 0;line-height:1.4;">${desc}</p>`;
    } else {
      html += '\n  <div style="margin-bottom:6pt;"></div>';
    }
  }

  return html;
}

// Skills & Interests: categorized lines ("Bold Category: item1, item2").
// Preferred category order: Technical → Language → Laboratory → Interests → others.
function ivySkillsSection(parsed, tailored) {
  const IVY_SKILL_ORDER = ['Technical', 'Language', 'Laboratory', 'Interests'];

  const grouped = tailored?.skills_grouped;
  if (grouped && typeof grouped === 'object' && Object.keys(grouped).length > 0) {
    const allKeys = Object.keys(grouped);

    // Build a case-insensitive ordered key list: preferred order first, then remaining
    const resolveKey = (preferred) =>
      allKeys.find(ak => ak.toLowerCase() === preferred.toLowerCase()) || null;

    const finalOrder = [
      ...IVY_SKILL_ORDER.map(resolveKey).filter(Boolean),
      ...allKeys.filter(k => !IVY_SKILL_ORDER.some(ik => ik.toLowerCase() === k.toLowerCase())),
    ];

    let html = ivySectionHeading('Skills & Interests');
    for (const key of finalOrder) {
      const skills = grouped[key];
      if (!Array.isArray(skills) || skills.length === 0) continue;
      html += `\n  <p style="font-family:Arial,sans-serif;font-size:10.5pt;color:#000;margin:3pt 0 2pt 0;padding-left:9pt;line-height:1.45;"><span style="font-weight:bold;">${esc(key)}: </span>${skills.map(esc).join(', ')}</p>`;
    }
    return html;
  }

  // Flat fallback — show under "Technical"
  let skillsList = [];
  if (Array.isArray(tailored?.target_skills) && tailored.target_skills.length) {
    skillsList = tailored.target_skills;
  } else if (Array.isArray(parsed.skills) && parsed.skills.length) {
    skillsList = parsed.skills;
  } else if (typeof parsed.technical_skills === 'string' && parsed.technical_skills.trim()) {
    skillsList = parsed.technical_skills.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (!skillsList.length) return '';

  return (
    ivySectionHeading('Skills & Interests') +
    `\n  <p style="font-family:Arial,sans-serif;font-size:10.5pt;color:#000;margin:3pt 0 0 0;padding-left:9pt;line-height:1.45;"><span style="font-weight:bold;">Technical: </span>${skillsList.map(esc).join(', ')}</p>`
  );
}

// ── Dynamic section order ─────────────────────────────────────────────────────
// The AI's tailored.sections[] controls order; IVY_DEFAULT_ORDER fills any gaps.

const IVY_SECTION_RENDERERS = {
  summary:    (p, t) => ivySummarySection(p, t),
  education:  (p)    => ivyEducationSection(p),
  experience: (p, t) => ivyExperienceSection(p, t),
  activities: (p, t) => ivyActivitiesSection(p, t),
  skills:     (p, t) => ivySkillsSection(p, t),
};

const IVY_DEFAULT_ORDER = ['summary', 'education', 'experience', 'activities', 'skills'];

// ── Main export ───────────────────────────────────────────────────────────────

function buildIvyHtml(parsed = {}, tailored = null) {
  let body = ivyHeaderSection(parsed);

  const order = (Array.isArray(tailored?.sections) && tailored.sections.length > 0)
    ? [...tailored.sections, ...IVY_DEFAULT_ORDER.filter(k => !tailored.sections.includes(k))]
    : IVY_DEFAULT_ORDER;

  const seen = new Set();
  for (const key of order) {
    if (seen.has(key)) continue;
    seen.add(key);
    const render = IVY_SECTION_RENDERERS[key];
    if (render) body += render(parsed, tailored);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Resume</title>
  <style>
    @page { margin: 0.75in 0.75in; }
    @media print {
      body { padding: 0 !important; margin: 0 !important; max-width: none !important; }
      p { page-break-after: avoid; }
      table { page-break-inside: avoid; }
      ul { page-break-inside: avoid; }
      li { page-break-inside: avoid; }
      p { orphans: 3; widows: 3; }
    }
  </style>
</head>
<body style="
  font-family: Arial, sans-serif;
  font-size: 11pt;
  color: #000;
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

module.exports = { buildIvyHtml };
