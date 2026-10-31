/**
 * Escapes the characters that let text break out into HTML, so v-html shows it as plain text.
 *
 * @param {string} text - Untrusted text.
 * @returns {string} - The text with & < > " ' replaced by HTML entities.
 */
export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// AI-written text is untrusted, so it is escaped before the formatting adds its own tags.
// Human question and flashcard files are trusted and rely on HTML entities such as &#8203;, so they render as written.
function escapeHtmlIfAiGenerated(contentItem, text) {
  return contentItem.aiGenerated === true ? escapeHtml(text) : text;
}

/**
 * Formats a question's text or a flashcard face for v-html: newlines become paragraph breaks and **text** becomes bold.
 *
 * @param {Object} contentItem - The question or flashcard; its `aiGenerated` flag decides whether the text is escaped.
 * @param {string} text - The text to format: question.question, flashcard.front or flashcard.back.
 * @returns {string} - The HTML to render.
 */
export function formatContentTextAsHtml(contentItem, text) {
  return escapeHtmlIfAiGenerated(contentItem, text)
    .replace(/\n/g, '<br><br>')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
}

/**
 * Formats a question's explanation for v-html: **text** becomes bold italics.
 *
 * @param {Object} question - The question (its `explanation` text and `aiGenerated` flag are used).
 * @returns {string} - The HTML to render.
 */
export function formatExplanationAsHtml(question) {
  return escapeHtmlIfAiGenerated(question, question.explanation)
    .replace(/\*\*(.*?)\*\*/g, '<i><b>$1</b></i>');
}
