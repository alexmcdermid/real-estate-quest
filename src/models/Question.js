/**
 * A Question document
 * @typedef {Object} Question
 * @property {UUID} documentID - The question UUID in firestore.
 * @property {string} question - The question text.
 * @property {Array<string>} choices - Array of four responses.
 * @property {number} correctChoice - Index of the correct response (0-based).
 * @property {number} chapter - Chapter reference.
 * @property {UUID} sharedQuestionText - (Optional) UUID reference to a shared question text document.
 */
