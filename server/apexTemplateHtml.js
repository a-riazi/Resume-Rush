// ─────────────────────────────────────────────────────────────────────────────
// Apex Resume — HTML Template
// Executive style: ALL-CAPS name, bold contact line, prominent summary box
// with left-border accent, ALL-CAPS section headings with 2px bottom border,
// experience with uppercase company + inline location, combined Education &
// Certifications section, Core Competencies bullet-list skills.
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

function apexSectionHeading(title) {
  return `
  <h2 style="
    font-family: Arial, sans-serif;
    font-size: 13pt;
    font-weight: bold;
    text-transform: uppercase;
    border-bottom: 1.5px solid #333;
    padding-bottom: 2.5px;
    margin: 16pt 0 10pt 0;
    color: #000;
    page-break-after: avoid;
  ">${esc(title)}</h2>`;
}

// ── Section builders ──────────────────────────────────────────────────────────

function apexHeaderSection(parsed) {
  const name = esc(parsed.name || parsed.fullName || '');

  const contactParts = dedupeContactValues([
    parsed.location ? `Address: ${esc(parsed.location)}` : null,
    parsed.phone    ? `Phone: ${esc(parsed.phone)}` : null,
    parsed.email    ? `Email: ${esc(parsed.email)}` : null,
    (parsed.linkedin || parsed.links?.linkedin) ? esc(parsed.linkedin || parsed.links?.linkedin) : null,
  ]);

  let html = '';
  if (name) {
    html += `
  <h1 style="
    font-family: Arial, sans-serif;
    font-size: 26pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #000;
    margin: 0 0 5pt 0;
  ">${name}</h1>`;
  }
  if (contactParts.length) {
    html += `
  <p style="
    font-family: Arial, sans-serif;
    font-size: 10pt;
    font-weight: bold;
    color: #444;
    margin: 0 0 15pt 0;
    line-height: 1.4;
  ">${contactParts.join(' &nbsp;|&nbsp; ')}</p>`;
  }
  return html;
}

function apexSummaryBox(parsed, tailored) {
  const raw = tailored?.tailored_summary || parsed.summary || parsed.objective || '';
  const text = esc(cleanSummary(raw));
  if (!text) return '';

  return `
  <div style="
    background-color: #f4f4f4;
    padding: 12pt 15pt;
    border-left: 4px solid #333;
    margin-bottom: 0;
    font-family: Arial, sans-serif;
    font-size: 11pt;
    color: #222;
    line-height: 1.5;
    font-style: italic;
  "><strong style="font-style:normal;">PROFESSIONAL SUMMARY: </strong>${text}</div>`;
}

function apexExperienceSection(parsed, tailored) {
  const items = tailored?.tailored_experience || parsed.experience || [];
  if (!Array.isArray(items) || !items.length) return '';

  let html = apexSectionHeading('Professional Experience');
  const cell = 'border:none;padding:0;vertical-align:baseline;font-family:Arial,sans-serif;font-size:11pt;color:#000;';

  for (const exp of items) {
    const company  = esc(exp.company || '');
    const location = esc(exp.location || exp.address || '');
    const role     = esc(exp.role || exp.title || '');
    const dates    = esc(exp.dates || exp.dateRange || '');
    const bullets  = Array.isArray(exp.bullets) ? exp.bullets : [];

    // Company (uppercase bold) + inline location (normal weight)
    const locationSpan = location
      ? ` <span style="font-weight:normal;text-transform:none;font-size:11pt;">| ${location}</span>`
      : '';
    html += `
  <p style="
    font-family: Arial, sans-serif;
    font-size: 12pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #000;
    margin: 10pt 0 0 0;
  ">${company}${locationSpan}</p>`;

    // Role (bold) + right-aligned dates — table row
    html += `
  <table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:none;margin:3pt 0 6pt 0;page-break-inside:avoid;">
    <tr>
      <td style="${cell}font-weight:bold;">${role}</td>
      <td style="${cell}text-align:right;font-style:italic;color:#333;">${dates}</td>
    </tr>
  </table>`;

    if (bullets.length) {
      html += `
  <ul style="margin:3pt 0 12pt 25pt;padding:0;page-break-inside:avoid;">`;
      for (const b of bullets) {
        if (b && String(b).trim()) {
          html += `
    <li style="font-family:Arial,sans-serif;font-size:11pt;color:#222;margin-bottom:4pt;line-height:1.35;page-break-inside:avoid;">${esc(b)}</li>`;
        }
      }
      html += `
  </ul>`;
    } else {
      html += `
  <div style="margin-bottom:12pt;"></div>`;
    }
  }
  return html;
}

// Combined Education & Certifications section.
// Education entries: "Degree, Field — School, Location (dates)"
// Cert entries:      "Cert Name — Issuer (date)"
function apexEducationCertSection(parsed) {
  const eduItems  = parsed.education      || [];
  const certItems = parsed.certifications || [];
  if (!eduItems.length && !certItems.length) return '';

  let html = apexSectionHeading('Education & Certifications');
  html += `
  <ul style="margin:4pt 0 0 25pt;padding:0;page-break-inside:avoid;">`;

  for (const edu of eduItems) {
    const degree   = esc(edu.degree || '');
    const field    = esc(edu.field || edu.major || '');
    const school   = esc(edu.school || edu.institution || '');
    const location = esc(edu.location || '');
    const dates    = esc(edu.dates || edu.dateRange || edu.graduationDate || '');
    const degLine  = [degree, field].filter(Boolean).join(', ');
    const schoolLoc = [school, location].filter(Boolean).join(', ');
    const dateStr  = dates ? ` <em>(${dates})</em>` : '';

    let liContent = '';
    if (degLine) liContent += `<strong>${degLine}</strong>`;
    if (schoolLoc) liContent += (liContent ? ' &mdash; ' : '') + schoolLoc + dateStr;
    else if (dates) liContent += dateStr;
    if (!liContent) continue;

    html += `
    <li style="font-family:Arial,sans-serif;font-size:11pt;color:#222;margin-bottom:5pt;line-height:1.4;">${liContent}</li>`;
  }

  for (const cert of certItems) {
    const certName = esc(cert.name || cert.title || '');
    const issuer   = esc(cert.issuer || cert.organization || '');
    const date     = esc(cert.date || cert.dates || '');
    if (!certName) continue;
    let liContent = `<strong>${certName}</strong>`;
    if (issuer) liContent += ` &mdash; ${issuer}`;
    if (date)   liContent += ` <em>(${date})</em>`;
    html += `
    <li style="font-family:Arial,sans-serif;font-size:11pt;color:#222;margin-bottom:5pt;line-height:1.4;">${liContent}</li>`;
  }

  html += `
  </ul>`;
  return html;
}

function apexSkillsSection(parsed, tailored) {
  const grouped = tailored?.skills_grouped;
  if (grouped && typeof grouped === 'object' && Object.keys(grouped).length > 0) {
    let html = apexSectionHeading('Core Competencies & Technical Skills');
    html += `
  <ul style="margin:4pt 0 0 25pt;padding:0;page-break-inside:avoid;">`;
    for (const [key, skills] of Object.entries(grouped)) {
      if (!Array.isArray(skills) || !skills.length) continue;
      html += `
    <li style="font-family:Arial,sans-serif;font-size:11pt;color:#222;margin-bottom:4pt;line-height:1.35;"><strong>${esc(key)}:</strong> ${skills.map(esc).join(', ')}</li>`;
    }
    html += `
  </ul>`;
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

  return apexSectionHeading('Core Competencies & Technical Skills') + `
  <ul style="margin:4pt 0 0 25pt;padding:0;">
    <li style="font-family:Arial,sans-serif;font-size:11pt;color:#222;margin-bottom:4pt;"><strong>Technical:</strong> ${skillsList.map(esc).join(', ')}</li>
  </ul>`;
}

// ── Dynamic section order ─────────────────────────────────────────────────────

const APEX_SECTION_RENDERERS = {
  summary:                  (p, t) => apexSummaryBox(p, t),
  experience:               (p, t) => apexExperienceSection(p, t),
  education_certifications: (p)    => apexEducationCertSection(p),
  skills:                   (p, t) => apexSkillsSection(p, t),
};

const APEX_DEFAULT_ORDER = ['summary', 'experience', 'education_certifications', 'skills'];

// Normalize AI-returned section key aliases to the canonical Apex key.
function apexCanonical(key) {
  if (key === 'education' || key === 'education_certifications') {
    return 'education_certifications';
  }
  return key;
}

// ── Main export ───────────────────────────────────────────────────────────────

function buildApexHtml(parsed = {}, tailored = null) {
  let body = apexHeaderSection(parsed);

  const order = (Array.isArray(tailored?.sections) && tailored.sections.length > 0)
    ? [...tailored.sections, ...APEX_DEFAULT_ORDER.filter(k => !tailored.sections.includes(k))]
    : APEX_DEFAULT_ORDER;

  const seen = new Set();
  for (const key of order) {
    const canonical = apexCanonical(key);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const render = APEX_SECTION_RENDERERS[canonical];
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
  color: #222;
  margin: 0 auto;
  padding: 48pt 54pt 60pt 54pt;
  max-width: 760px;
  background: #fff;
  line-height: 1.3;
">
${body}
</body>
</html>`;
}

module.exports = { buildApexHtml };
