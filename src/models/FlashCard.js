/**
 * A FlashCard document
 * @typedef {Object} FlashCard
 * @property {UUID} documentID - The flashcard UUID in firestore.
 * @property {number} cardNumber - The card number, by chapter (for ordering).
 * @property {string} front - The content shown on the front of the card.
 * @property {string} back - The content shown on the back of the card.
 * @property {number} chapter - Chapter reference (matching your existing chapters).
 * @property {Array<string>} tags - Optional tags for categorizing cards (e.g., "definitions", "concepts").
 * @property {boolean} premium - Whether this is a premium-only flashcard.
 * @property {number} difficulty - Optional difficulty rating (1-3).
 */