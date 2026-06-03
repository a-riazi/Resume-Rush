'use strict';

/**
 * templateEngine.js
 * Thin adapter — delegates HTML generation to classicTemplateHtml.js.
 * renderTemplate(key, data, opts) → HTML string
 * getConfig(key)                 → config with docxExportOptions
 */

const { buildClassicHtml } = require('./classicTemplateHtml');

// ── Config registry ───────────────────────────────────────────────────────────

const configs = {
  classic: {
    key:   'classic',
    label: 'Classic',
    docxExportOptions: {
      orientation: 'portrait',
      margins: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
      font:               'Georgia',
      fontSize:           21,          // 10.5 pt in half-points
      complexScriptsFont: 'Georgia',
      lineHeight:         276,
      title:              'Resume',
    },
  },
};

function getConfig(templateKey) {
  return configs[templateKey] || configs.classic;
}

// ── Render ────────────────────────────────────────────────────────────────────

/**
 * @param {string}  templateKey
 * @param {object}  data  – output of mapToTemplateData(); carries .parsed + .tailored
 * @param {object}  [opts]
 * @returns {string} complete HTML
 */
function renderTemplate(templateKey, data, opts = {}) {
  return buildClassicHtml(data.parsed || {}, data.tailored || null);
}

module.exports = { renderTemplate, getConfig };
