// ─────────────────────────────────────────────────────────────────────────────
// Classic Resume Template  (html-to-docx pipeline)
// Generates HTML via classicTemplateHtml.js, then converts to DOCX buffer.
// ─────────────────────────────────────────────────────────────────────────────

const HTMLtoDOCX = require('html-to-docx');
const { buildClassicHtml } = require('./classicTemplateHtml');

/**
 * Build a Classic-style DOCX buffer from parsed resume data and AI-tailored
 * fields.
 *
 * @param {object} parsed   - Original parsed resume (from /api/upload)
 * @param {object} tailored - AI tailored fields (from /api/tailor), may be null
 * @returns {Promise<Buffer>}
 */
async function buildClassicDocx(parsed = {}, tailored = null) {
  const html = buildClassicHtml(parsed, tailored);
  const buffer = await HTMLtoDOCX(html, null, {
    font: 'Georgia',
    fontSize: 21,          // 10.5 pt in half-points
    complexScripts: false,
    table: { row: { cantSplit: false } },
    margins: {
      top:    1080,        // 0.75 in (twips)
      bottom: 1080,
      left:   1080,
      right:  1080,
    },
  });
  return buffer;
}

module.exports = { buildClassicDocx };
