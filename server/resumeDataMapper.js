'use strict';

/**
 * resumeDataMapper.js
 * Maps AI output (parsed + tailored) to the shape consumed by templateEngine.
 * For the classic template the HTML builder (classicTemplateHtml.js) takes the
 * raw parsed + tailored objects directly, so this module simply passes them
 * through while preserving one-page compression options for future use.
 */

/**
 * @param {object}  parsed          – output of parseResumeWithGemini()
 * @param {object}  tailored        – output of tailorResumeWithGemini() (may be null)
 * @param {boolean} limitToOnePage
 * @param {object}  config          – template config from getConfig()
 * @returns {object}
 */
function mapToTemplateData(parsed = {}, tailored = null, limitToOnePage = false, config = {}) {
  // One-page bullet trimming
  if (limitToOnePage && tailored && Array.isArray(tailored.tailored_experience)) {
    const maxBullets = (config.onePage && config.onePage.bulletCountMax) || 2;
    tailored = {
      ...tailored,
      tailored_experience: tailored.tailored_experience.map(exp => ({
        ...exp,
        bullets: Array.isArray(exp.bullets) ? exp.bullets.slice(0, maxBullets) : exp.bullets,
      })),
    };
  }

  return { parsed, tailored };
}

module.exports = { mapToTemplateData };
