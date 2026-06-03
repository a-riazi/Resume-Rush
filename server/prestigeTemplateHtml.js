// ─────────────────────────────────────────────────────────────────────────────
// Prestige Resume — HTML Template
// Professional style: centered ALL-CAPS name, | contact separators,
// ALL-CAPS section headings with bottom border, bold entry name + right-aligned
// italic location, italic subtitle line (role | dates), Activities & Leadership
// section, categorized bullet-list skills.
// Self-contained HTML, inline styles only, ATS-safe.
// ─────────────────────────────────────────────────────────────────────────────

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

function prestigeSectionHeading(title) {
  return `
  <h2 style="
    font-family: Arial, sans-serif;
    font-size: 11pt;
    font-weight: bold;
    text-transform: uppercase;
    border-bottom: 1px solid #000;
    padding-bottom: 2px;
    margin: 13pt 0 7pt 0;
    color: #000;
    page-break-after: avoid;
  ">${esc(title)}</h2>`;
}

// Bold name (left) + italic location (right) in a two-column table row.
function prestigeEntryHeader(nameHtml, locationText) {
  const cell = 'border:none;padding:0;vertical-align:baseline;font-family:Arial,sans-serif;font-size:11pt;color:#000;';
  return `
  <table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:none;margin:8pt 0 0 0;page-break-inside:avoid;">
    <tr>
      <td style="${cell}font-weight:bold;">${nameHtml}</td>
      <td style="${cell}text-align:right;font-style:italic;">${esc(locationText)}</td>
    </tr>
  </table>`;
}

// ── Section builders ──────────────────────────────────────────────────────────

function prestigeHeaderSection(parsed) {
  const name = esc(parsed.name || parsed.fullName || '');

  const contactParts = dedupeContactValues([
    parsed.location,
    parsed.phone,
    parsed.email,
    parsed.linkedin || parsed.links?.linkedin,
    parsed.github   || parsed.links?.github,
    parsed.website  || parsed.links?.portfolio,
  ]).map(esc);
  const contact = contactParts.join(' &nbsp;|&nbsp; ');

  let html = '';
  if (name) {
    html += `
  <h1 style="
    font-family: Arial, sans-serif;
    font-size: 24pt;
    font-weight: bold;
    text-align: center;
    text-transform: uppercase;
    color: #000;
    margin: 0 0 5pt 0;
  ">${name}</h1>`;
  }
  if (contact) {
    html += `
  <p style="
    font-family: Arial, sans-serif;
    font-size: 10pt;
    text-align: center;
    color: #555;
    margin: 0 0 12pt 0;
    line-height: 1.4;
  ">${contact}</p>`;
  }
  return html;
}

function prestigeSummarySection(parsed, tailored) {
  const raw = tailored?.tailored_summary || parsed.summary || parsed.objective || '';
  const text = esc(cleanSummary(raw));
  if (!text) return '';

  return prestigeSectionHeading('Summary') + `
  <p style="
    font-family: Arial, sans-serif;
    font-size: 11pt;
    color: #000;
    margin: 4pt 0 0 0;
    line-height: 1.45;
  ">${text}</p>`;
}

function prestigeEducationSection(parsed) {
  const items = parsed.education || [];
  if (!Array.isArray(items) || !items.length) return '';

  let html = prestigeSectionHeading('Education');

  for (const edu of items) {
    const school   = esc(edu.school || edu.institution || '');
    const location = esc(edu.location || edu.address || '');
    const degree   = esc(edu.degree || '');
    const field    = esc(edu.field || edu.major || edu.concentration || '');
    const gpaRaw   = edu.gpa ? ` (GPA: ${esc(String(edu.gpa))}/4.0)` : '';
    const dates    = esc(edu.dates || edu.dateRange || edu.graduationDate || '');
    const degLine  = [degree, field].filter(Boolean).join(', ');
    const subtitle = [degLine ? `${degLine}${gpaRaw}` : null, dates].filter(Boolean).join(' | ');
    const honors   = esc(edu.honors || '');
    const courses  = esc(edu.relevantCoursework || edu.coursework || '');

    html += prestigeEntryHeader(school, location);
    if (subtitle) {
      html += `\n  <p style="font-family:Arial,sans-serif;font-size:11pt;font-style:italic;color:#000;margin:2pt 0 5pt 0;">${subtitle}</p>`;
    }
    if (honors || courses) {
      html += '\n  <ul style="margin:3pt 0 8pt 20pt;padding:0;page-break-inside:avoid;">';
      if (honors) html += `\n    <li style="font-family:Arial,sans-serif;font-size:11pt;color:#000;margin-bottom:3pt;"><strong>Honors:</strong> ${honors}</li>`;
      if (courses) html += `\n    <li style="font-family:Arial,sans-serif;font-size:11pt;color:#000;margin-bottom:3pt;"><strong>Relevant Coursework:</strong> ${courses}</li>`;
      html += '\n  </ul>';
    } else {
      html += '\n  <div style="margin-bottom:8pt;"></div>';
    }
  }
  return html;
}

function prestigeExperienceSection(parsed, tailored) {
  const items = tailored?.tailored_experience || parsed.experience || [];
  if (!Array.isArray(items) || !items.length) return '';

  let html = prestigeSectionHeading('Experience');

  for (const exp of items) {
    const company  = esc(exp.company || '');
    const location = esc(exp.location || exp.address || '');
    const role     = esc(exp.role || exp.title || '');
    const dates    = esc(exp.dates || exp.dateRange || '');
    const bullets  = Array.isArray(exp.bullets) ? exp.bullets : [];
    const subtitle = [role, dates].filter(Boolean).join(' | ');

    html += prestigeEntryHeader(company, location);
    if (subtitle) {
      html += `\n  <p style="font-family:Arial,sans-serif;font-size:11pt;font-style:italic;color:#000;margin:2pt 0 4pt 0;">${subtitle}</p>`;
    }
    if (bullets.length) {
      html += '\n  <ul style="margin:3pt 0 12pt 20pt;padding:0;page-break-inside:avoid;">';
      for (const b of bullets) {
        if (b && String(b).trim()) {
          html += `\n    <li style="font-family:Arial,sans-serif;font-size:11pt;color:#000;margin-bottom:3pt;line-height:1.35;page-break-inside:avoid;">${esc(b)}</li>`;
        }
      }
      html += '\n  </ul>';
    } else {
      html += '\n  <div style="margin-bottom:12pt;"></div>';
    }
  }
  return html;
}

// Activities & Leadership — same structure as experience, different heading.
// Data priority: tailored_activities → tailored_projects → parsed.activities → parsed.projects
function prestigeActivitiesSection(parsed, tailored) {
  const items = (
    tailored?.tailored_activities ||
    tailored?.tailored_projects ||
    parsed.activities ||
    parsed.projects ||
    []
  );
  if (!Array.isArray(items) || !items.length) return '';

  let html = prestigeSectionHeading('Activities & Leadership');

  for (const item of items) {
    const org      = esc(item.org || item.organization || item.company || item.name || item.title || '');
    const location = esc(item.location || item.address || '');
    const role     = esc(item.role || item.position || '');
    const dates    = esc(item.dates || item.dateRange || '');
    const bullets  = Array.isArray(item.bullets) ? item.bullets : [];
    const desc     = esc(item.description || '');
    const subtitle = [role, dates].filter(Boolean).join(' | ');

    if (org || location) html += prestigeEntryHeader(org || '&nbsp;', location);
    if (subtitle) {
      html += `\n  <p style="font-family:Arial,sans-serif;font-size:11pt;font-style:italic;color:#000;margin:2pt 0 4pt 0;">${subtitle}</p>`;
    }
    if (bullets.length) {
      html += '\n  <ul style="margin:3pt 0 12pt 20pt;padding:0;page-break-inside:avoid;">';
      for (const b of bullets) {
        if (b && String(b).trim()) {
          html += `\n    <li style="font-family:Arial,sans-serif;font-size:11pt;color:#000;margin-bottom:3pt;line-height:1.35;page-break-inside:avoid;">${esc(b)}</li>`;
        }
      }
      html += '\n  </ul>';
    } else if (desc) {
      html += `\n  <p style="font-family:Arial,sans-serif;font-size:11pt;color:#000;margin:2pt 0 10pt 0;line-height:1.35;">${desc}</p>`;
    } else {
      html += '\n  <div style="margin-bottom:10pt;"></div>';
    }
  }
  return html;
}

function prestigeSkillsSection(parsed, tailored) {
  const grouped = tailored?.skills_grouped;
  if (grouped && typeof grouped === 'object' && Object.keys(grouped).length > 0) {
    let html = prestigeSectionHeading('Skills & Interests');
    html += '\n  <ul style="margin:4pt 0 0 20pt;padding:0;page-break-inside:avoid;">';
    for (const [key, skills] of Object.entries(grouped)) {
      if (!Array.isArray(skills) || !skills.length) continue;
      html += `\n    <li style="font-family:Arial,sans-serif;font-size:11pt;color:#000;margin-bottom:3pt;line-height:1.35;"><strong>${esc(key)}:</strong> ${skills.map(esc).join(', ')}</li>`;
    }
    html += '\n  </ul>';
    return html;
  }

  // Flat fallback
  let skillsList = [];
  if (Array.isArray(tailored?.target_skills) && tailored.target_skills.length) {
    skillsList = tailored.target_skills;
  } else if (Array.isArray(parsed.skills) && parsed.skills.length) {
    skillsList = parsed.skills;
  } else if (typeof parsed.technical_skills === 'string' && parsed.technical_skills.trim()) {
    skillsList = parsed.technical_skills.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (!skillsList.length) return '';

  return prestigeSectionHeading('Skills & Interests') + `
  <ul style="margin:4pt 0 0 20pt;padding:0;">
    <li style="font-family:Arial,sans-serif;font-size:11pt;color:#000;margin-bottom:3pt;"><strong>Technical:</strong> ${skillsList.map(esc).join(', ')}</li>
  </ul>`;
}

// ── Dynamic section order ─────────────────────────────────────────────────────

const PRESTIGE_SECTION_RENDERERS = {
  summary:               (p, t) => prestigeSummarySection(p, t),
  education:             (p)    => prestigeEducationSection(p),
  experience:            (p, t) => prestigeExperienceSection(p, t),
  activities_leadership: (p, t) => prestigeActivitiesSection(p, t),
  skills:                (p, t) => prestigeSkillsSection(p, t),
};

const PRESTIGE_DEFAULT_ORDER = ['summary', 'education', 'experience', 'activities_leadership', 'skills'];

// Normalize AI-returned section key aliases to the canonical Prestige key.
function prestigeCanonical(key) {
  if (key === 'activities' || key === 'projects' || key === 'activities_leadership') {
    return 'activities_leadership';
  }
  return key;
}

// ── Main export ───────────────────────────────────────────────────────────────

function buildPrestigeHtml(parsed = {}, tailored = null) {
  let body = prestigeHeaderSection(parsed);

  const order = (Array.isArray(tailored?.sections) && tailored.sections.length > 0)
    ? [...tailored.sections, ...PRESTIGE_DEFAULT_ORDER.filter(k => !tailored.sections.includes(k))]
    : PRESTIGE_DEFAULT_ORDER;

  const seen = new Set();
  for (const key of order) {
    const canonical = prestigeCanonical(key);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const render = PRESTIGE_SECTION_RENDERERS[canonical];
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
      h2 { page-break-after: avoid; }
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
  line-height: 1.15;
">
${body}
</body>
</html>`;
}

module.exports = { buildPrestigeHtml };
