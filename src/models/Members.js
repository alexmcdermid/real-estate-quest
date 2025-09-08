/**
 * Represents a Member document in Firestore.
 * @typedef {Object} Member
 * @property {UUID} memberID - The unique identifier for the member document in Firestore - corresponds to userID.
 * @property {Date} cancelAt - Timestamp indicating when the membership subscription is scheduled to be cancelled (at the end of the current billing period).
 * @property {Date} cancelTime - Timestamp indicating when the membership subscription is cancelled from our end.
 * @property {Date} resumeTime - Timestamp indicating if the membership subscription is resumed from cancelled state.

 * @property {string} customerId - The unique identifier for the customer in the payment processing system (e.g., Stripe customer ID).
 * @property {boolean} member - A flag indicating whether the user is currently considered an active member.
 * @property {string} subscriptionId - The unique identifier for the specific subscription in the payment processing system (e.g., Stripe subscription ID).
 * @property {string} subscriptionType - The type or billing frequency of the subscription (e.g., "Monthly", "Lifetime").
 * @property {boolean} manualClaimSyncRequired - A flag to indicate a manual sync is required for claims.
 * @property {boolean} admin - A flag indicating whether the user has admin privileges (default: false, can only be set manually in Firebase console).
 */