// ─────────────────────────────────────────────────────────────────────────────
// Dual Resume — HTML Template
// Two-column sidebar: large ALL-CAPS name header, left 30% (gray bg, contact +
// skill category sections), right 70% (experience entries + HR + education).
// Fixed layout — no dynamic section ordering.
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

// Left sidebar section heading — navy, uppercase.
function dualSidebarHeading(title) {
  return `
    <p style="
      font-family: Calibri, Arial, sans-serif;
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      color: #2c3e50;
      margin: 12pt 0 5pt 0;
      padding: 0;
    ">${esc(title)}</p>`;
}

// Right column section heading — navy, uppercase, slightly larger.
function dualMainHeading(title) {
  return `
    <p style="
      font-family: Calibri, Arial, sans-serif;
      font-size: 12pt;
      font-weight: bold;
      text-transform: uppercase;
      color: #2c3e50;
      margin: 0 0 8pt 0;
      padding: 0;
    ">${esc(title)}</p>`;
}

// ── Column builders ───────────────────────────────────────────────────────────

function buildDualLeftColumn(parsed, tailored) {
  let html = '';

  // ── Contact ──────────────────────────────────────────────────────────────
  html += dualSidebarHeading('Contact');
  const contactItems = dedupeContactValues([
    parsed.location,
    parsed.phone,
    parsed.email,
    parsed.linkedin || parsed.links?.linkedin,
    parsed.github   || parsed.links?.github,
    parsed.website  || parsed.links?.portfolio,
  ]);
  if (contactItems.length) {
    html += `
    <p style="font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#333;margin:0 0 0 0;line-height:1.7;">`;
    html += contactItems.map(esc).join('<br>');
    html += `</p>`;
  }

  // ── Skills from skills_grouped — each key becomes its own sidebar section ─
  const grouped = tailored?.skills_grouped;
  if (grouped && typeof grouped === 'object' && Object.keys(grouped).length > 0) {
    for (const [key, skills] of Object.entries(grouped)) {
      if (!Array.isArray(skills) || !skills.length) continue;
      html += dualSidebarHeading(key);
      html += `
    <ul style="margin:0;padding-left:14pt;font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#333;">`;
      for (const skill of skills) {
        html += `
      <li style="margin-bottom:3pt;">${esc(skill)}</li>`;
      }
      html += `
    </ul>`;
    }
  } else {
    // Flat fallback
    let skillsList = [];
    if (Array.isArray(tailored?.target_skills) && tailored.target_skills.length) {
      skillsList = tailored.target_skills;
    } else if (Array.isArray(parsed.skills) && parsed.skills.length) {
      skillsList = parsed.skills;
    }
    if (skillsList.length) {
      html += dualSidebarHeading('Technical Skills');
      html += `
    <ul style="margin:0;padding-left:14pt;font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#333;">`;
      for (const skill of skillsList) {
        html += `
      <li style="margin-bottom:3pt;">${esc(skill)}</li>`;
      }
      html += `
    </ul>`;
    }
  }

  return html;
}

function buildDualRightColumn(parsed, tailored) {
  let html = '';

  // ── Professional Experience ───────────────────────────────────────────────
  const expItems = tailored?.tailored_experience || parsed.experience || [];
  if (expItems.length) {
    html += dualMainHeading('Professional Experience');
    for (const exp of expItems) {
      const company = esc(exp.company || '');
      const role    = esc(exp.role || exp.title || '');
      const dates   = esc(exp.dates || exp.dateRange || '');
      const bullets = Array.isArray(exp.bullets) ? exp.bullets : [];
      const entryTitle = [company, role].filter(Boolean).join(' \u2014 ');

      if (entryTitle) {
        html += `
    <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;font-weight:bold;color:#000;margin:8pt 0 2pt 0;">${entryTitle}</p>`;
      }
      if (dates) {
        html += `
    <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;font-style:italic;color:#333;margin:0 0 4pt 0;">${dates}</p>`;
      }
      if (bullets.length) {
        html += `
    <ul style="margin:3pt 0 12pt 18pt;padding:0;font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#333;">`;
        for (const b of bullets) {
          if (b && String(b).trim()) {
            html += `
      <li style="margin-bottom:3pt;line-height:1.35;">${esc(b)}</li>`;
          }
        }
        html += `
    </ul>`;
      } else {
        html += `
    <div style="margin-bottom:10pt;"></div>`;
      }
    }
  }

  // ── HR separator before education ─────────────────────────────────────────
  const eduItems = parsed.education || [];
  if (expItems.length && eduItems.length) {
    html += `
    <hr style="border:0;border-top:1px solid #ccc;margin:15pt 0;">`;
  }

  // ── Education ─────────────────────────────────────────────────────────────
  if (eduItems.length) {
    html += dualMainHeading('Education');
    for (const edu of eduItems) {
      const school  = esc(edu.school || edu.institution || '');
      const degree  = esc(edu.degree || '');
      const field   = esc(edu.field || edu.major || '');
      const dates   = esc(edu.dates || edu.dateRange || edu.graduationDate || '');
      const degLine = [degree, field].filter(Boolean).join(', ');

      if (school) {
        html += `
    <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;font-weight:bold;color:#000;margin:8pt 0 2pt 0;">${school}</p>`;
      }
      if (degLine || dates) {
        html += `
    <p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;font-style:italic;color:#333;margin:0 0 8pt 0;">`;
        if (degLine) html += degLine;
        if (degLine && dates) html += '<br>';
        if (dates) html += dates;
        html += `</p>`;
      }
    }
  }

  return html;
}

// ── Main export ───────────────────────────────────────────────────────────────

function buildDualHtml(parsed = {}, tailored = null) {
  const name = esc(parsed.name || parsed.fullName || '');
  const leftContent  = buildDualLeftColumn(parsed, tailored);
  const rightContent = buildDualRightColumn(parsed, tailored);

  const leftStyle  = 'width:30%;background-color:#f8f9fa;border-right:2px solid #ddd;padding:10pt;vertical-align:top;';
  const rightStyle = 'width:70%;padding:0 0 0 20pt;vertical-align:top;';

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
      table { page-break-inside: avoid; }
      ul { page-break-inside: avoid; }
      li { page-break-inside: avoid; }
    }
  </style>
</head>
<body style="
  font-family: Calibri, Arial, sans-serif;
  font-size: 11pt;
  color: #333;
  margin: 0 auto;
  padding: 48pt 54pt 60pt 54pt;
  max-width: 960px;
  background: #fff;
  line-height: 1.2;
">
  <p style="
    font-family: Calibri, Arial, sans-serif;
    font-size: 28pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #000;
    margin: 0 0 14pt 0;
    line-height: 1.1;
  ">${name}</p>
  <table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="${leftStyle}">${leftContent}
      </td>
      <td style="${rightStyle}">${rightContent}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { buildDualHtml };
