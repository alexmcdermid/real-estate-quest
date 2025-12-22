import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineSecret} from "firebase-functions/params";
import admin from "firebase-admin";
import crypto from "crypto";
import Stripe from "stripe";
/**
 * Custom rate limiter implementation using Firestore
 */
class SimpleRateLimiter {
  /**
   * Creates a new SimpleRateLimiter instance
   * @param {string} name - The name of the rate limiter
   * @param {number} maxCalls - Maximum calls allowed in the period
   * @param {number} periodSeconds - Time period in seconds
   * @param {object} db - Firestore database instance
   */
  constructor(name, maxCalls, periodSeconds, db) {
    this.name = name;
    this.maxCalls = maxCalls;
    this.periodSeconds = periodSeconds;
    this.db = db;
  }

  /**
   * Checks rate limit and records usage
   * @param {string} qualifier - Unique identifier for rate limiting
   * @return {Promise} Promise that rejects if rate limit exceeded
   */
  async rejectOnQuotaExceededOrRecordUsage(qualifier) {
    const now = admin.firestore.Timestamp.now();
    const periodStart = admin.firestore.Timestamp.fromMillis(
        now.toMillis() - (this.periodSeconds * 1000),
    );

    const docRef = this.db.collection("rate_limits").doc(`${this.name}_${qualifier}`);

    return this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      const data = doc.exists ? doc.data() : {calls: [], lastReset: now};

      // Remove old calls outside the time window
      const recentCalls = data.calls.filter((call) => call.toMillis() > periodStart.toMillis());

      // Always update the document to persist cleaned calls
      transaction.set(docRef, {
        calls: recentCalls,
        lastReset: now,
      });

      if (recentCalls.length >= this.maxCalls) {
        throw new Error("Rate limit exceeded");
      }

      // Add current call and update again
      recentCalls.push(now);
      transaction.set(docRef, {
        calls: recentCalls,
        lastReset: now,
      });
    });
  }
}

admin.initializeApp();
const db = admin.firestore();

const unauthLimiter = new SimpleRateLimiter("unauth_rate_limiter", 40, 60, db);
const authLimiter = new SimpleRateLimiter("user_rate_limiter", 40, 60, db);
const activityLimiter = new SimpleRateLimiter("activity_rate_limiter", 120, 60, db);

const stripeSecretKeyDev = defineSecret("STRIPE_SECRET_KEY_DEV");
const stripeWebhookSecretDev = defineSecret("STRIPE_WEBHOOK_SECRET_DEV");
const stripeSecretKeyProd = defineSecret("STRIPE_SECRET_KEY_PROD");
const stripeWebhookSecretProd = defineSecret("STRIPE_WEBHOOK_SECRET_PROD");

const githubToken = defineSecret("GITHUB_TOKEN");
const githubUsername = defineSecret("GITHUB_USERNAME");
const githubRepo = defineSecret("GITHUB_REPO");

const isProduction = process.env.NODE_ENV === "production";

// Initialize Stripe (lazy initialization in functions)
let stripe;

const ACTIVITY_LOG_PAGE_SIZE = 20;
const RATE_LIMIT_LOG_PAGE_SIZE = 20;
const ERROR_LOG_PAGE_SIZE = 20;
const MEMBERS_PAGE_SIZE = 20;
const USERS_PAGE_SIZE = 20;

/**
 * Normalizes an activity log document from Firestore by converting timestamps
 * and calculating event counts.
 *
 * @param {Object} doc - The Firestore document snapshot.
 * @return {Object} The normalized activity log data.
 */
function normalizeActivityLogDoc(doc) {
  const log = doc.data();
  log.id = doc.id;

  let createdAtMs = null;
  if (log.createdAt && typeof log.createdAt.toDate === "function") {
    createdAtMs = log.createdAt.toMillis();
    log.createdAt = log.createdAt.toDate().toISOString();
  } else if (typeof log.createdAt === "string") {
    const parsed = Date.parse(log.createdAt);
    createdAtMs = Number.isNaN(parsed) ? null : parsed;
  }

  const counts = log.counts || {};
  const questionEvents = Number(counts.questions) || 0;
  const flashcardEvents = Number(counts.flashcards) || 0;
  const questionCorrect = Number(counts.questionCorrect) || 0;
  const questionIncorrect = Number(counts.questionIncorrect) || 0;
  const totalEvents = typeof counts.total === "number" ?
    counts.total :
    (typeof log.totalEvents === "number" ? log.totalEvents :
      questionEvents + flashcardEvents);

  log.eventCount = totalEvents;
  log.counts = {
    questions: questionEvents,
    flashcards: flashcardEvents,
    total: totalEvents,
    questionCorrect,
    questionIncorrect,
  };
  log.questionCorrect = questionCorrect;
  log.questionIncorrect = questionIncorrect;
  log.createdAtMs = createdAtMs;

  return log;
}

/**
 * Normalizes a rate limit log document from Firestore by converting timestamps.
 *
 * @param {Object} doc - The Firestore document snapshot.
 * @return {Object} The normalized rate limit log data.
 */
function normalizeRateLimitLogDoc(doc) {
  const logData = doc.data();
  logData.id = doc.id;

  if (logData.timestamp && typeof logData.timestamp.toDate === "function") {
    logData.timestampMs = logData.timestamp.toMillis();
    logData.timestamp = logData.timestamp.toDate().toISOString();
  } else if (typeof logData.timestamp === "string") {
    const parsed = Date.parse(logData.timestamp);
    logData.timestampMs = Number.isNaN(parsed) ? null : parsed;
  }
  return logData;
}

/**
 * Normalizes an error log document from Firestore by converting timestamps.
 *
 * @param {Object} doc - The Firestore document snapshot.
 * @return {Object} The normalized error log data.
 */
function normalizeErrorLogDoc(doc) {
  const e = doc.data();
  e.id = doc.id;
  if (e.timestamp && typeof e.timestamp.toDate === "function") {
    e.timestampMs = e.timestamp.toMillis();
    e.timestamp = e.timestamp.toDate().toISOString();
  } else if (typeof e.timestamp === "string") {
    const parsed = Date.parse(e.timestamp);
    e.timestampMs = Number.isNaN(parsed) ? null : parsed;
  }
  if (e.firstSeen && typeof e.firstSeen.toDate === "function") {
    e.firstSeen = e.firstSeen.toDate().toISOString();
  }
  if (e.lastSeen && typeof e.lastSeen.toDate === "function") {
    e.lastSeenMs = e.lastSeen.toMillis();
    e.lastSeen = e.lastSeen.toDate().toISOString();
  }
  return e;
}

/**
 * Safely stringifies an object by omitting circular references.
 *
 * @param {any} obj - The object to stringify.
 * @param {number} [indent=2] - The number of spaces to use for indentation.
 * @return {string} The JSON string representation of the object.
 */
// function safeStringify(obj, indent = 2) {
//   const cache = new Set();
//   return JSON.stringify(obj, (key, value) => {
//     if (typeof value === "object" && value !== null) {
//       if (cache.has(value)) {
//         // Duplicate reference found, discard key
//         return;
//       }
//       cache.add(value);
//     }
//     return value;
//   }, indent);
// }

/**
 * Writes structured function error logs to Firestore with simple deduplication.
 * If a matching error (same functionName, message, authUid/ip) exists within
 * ERROR_DEDUPE_WINDOW_SECONDS it will increment `occurrences` and update `lastSeen`.
 * The helper will never throw.
 *
 * @param {Error|any} err
 * @param {object} meta - { functionName, uid, ip, requestData, severity }
 */
async function logFunctionError(err, meta = {}) {
  const ERROR_DEDUPE_WINDOW_SECONDS = 60 * 60;
  const MAX_REQUEST_DATA_LENGTH = 2000;
  try {
    const now = admin.firestore.Timestamp.now();

    const message = err && err.message ? String(err.message) : String(err || "unknown error");
    const stack = err && err.stack ? String(err.stack).slice(0, 10000) : null;

    let requestData = meta.requestData || null;
    if (requestData && typeof requestData === "object") {
      try {
        requestData = JSON.stringify(requestData);
      } catch (e) {
        requestData = String(requestData);
      }
    }

    if (requestData && requestData.length > MAX_REQUEST_DATA_LENGTH) {
      requestData = requestData.slice(0, MAX_REQUEST_DATA_LENGTH) + "... [truncated]";
    }

    // Determine bucket and user-friendly message
    const bucket = meta.bucket || (payloadIsStripeError(err, meta) ? "stripe" : "generic");

    const humanMessage = meta.humanMessage || (bucket === "stripe" ?
      "Error with payment provider (Stripe). Please contact support." :
      "An unexpected error occurred. If this keeps happening please contact support.");

    const payload = {
      timestamp: now,
      firstSeen: now,
      lastSeen: now,
      functionName: meta.functionName || meta.fn || "unknown",
      message,
      stack,
      severity: meta.severity || "error",
      authUid: meta.uid || null,
      ip: meta.ip || null,
      requestData: requestData || null,
      bucket,
      humanMessage,
      env: process.env.NODE_ENV || "unknown",
      occurrences: 1,
    };

    // Attempt a dedupe: look for an existing similar error in the dedupe window
    const windowStart = admin.firestore.Timestamp.fromMillis(now.toMillis() - (ERROR_DEDUPE_WINDOW_SECONDS * 1000));

    const query = db.collection("function_error_logs")
        .where("functionName", "==", payload.functionName)
        .where("message", "==", payload.message)
        .where("lastSeen", ">=", windowStart)
        .orderBy("lastSeen", "desc")
        .limit(1);

    const snap = await query.get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      try {
        await doc.ref.update({
          occurrences: admin.firestore.FieldValue.increment(1),
          lastSeen: now,
          // preserve the earliest firstSeen, but update stack/requestData if helpful
          stack: stack || doc.data().stack || null,
          requestData: payload.requestData || doc.data().requestData || null,
        });
        return;
      } catch (e) {
        // fall through to attempt to add new doc if update fails
        console.error("Failed to update existing error log:", e);
      }
    }

    // No recent duplicate found; add a new document
    await db.collection("function_error_logs").add(payload);
  } catch (loggerErr) {
    // Never allow the logger to throw or affect business logic
    try {
      console.error("logFunctionError failed:", loggerErr);
    } catch (ignore) {
      // ignore
    }
  }
}

/**
 * Heuristically determines whether an error is related to Stripe.
 *
 * Checks, in order:
 * - explicit meta.bucket === 'stripe'
 * - presence of common Stripe error fields on the error object (type, code, statusCode)
 * - whether the function name contains Stripe-related keywords
 *
 * @param {any} err - The thrown error object (may be null/undefined).
 * @param {Object} [meta] - Optional metadata passed by the caller.
 * @param {string} [meta.functionName] - Name of the Cloud Function where the error occurred.
 * @param {string} [meta.bucket] - Explicit bucket override (e.g. 'stripe').
 * @return {boolean} True when the error is likely a Stripe-related error.
 */
function payloadIsStripeError(err, meta) {
  if (meta && meta.bucket === "stripe") return true;
  if (!err) return false;
  if (err.type || err.code || err.statusCode) return true;
  const fn = (meta.functionName || meta.fn || "").toLowerCase();
  if (fn.includes("stripe") || fn.includes("checkout") || fn.includes("billing")) return true;
  return false;
}

export const logStudyActivity = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (request) => {
      const vid = typeof request.data?.visitorId === "string" ? request.data.visitorId.slice(0, 120) : null;
      const qualifier = request.auth?.uid ?
        `u_${request.auth.uid}` :
        vid ?
          `v_${vid}` :
          request.rawRequest.ip || "anon";
      try {
        await activityLimiter.rejectOnQuotaExceededOrRecordUsage(qualifier);
      } catch (err) {
        try {
          await db.collection("rate_limit_logs").add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: "activity",
            qualifier,
            uid: request.auth?.uid || null,
            ip: request.rawRequest?.ip || null,
            userAgent: request.rawRequest?.headers?.["user-agent"] || null,
          });
        } catch (logErr) {
          console.error("Failed to log rate limit event (activity):", logErr);
        }
        throw new HttpsError(
            "resource-exhausted",
            "Too many events – please try again in a moment.",
        );
      }

      const incomingEvents = Array.isArray(request.data?.events) ?
        request.data.events.slice(0, 20) : [];

      if (incomingEvents.length === 0) {
        throw new HttpsError("invalid-argument", "events array with at least one entry is required.");
      }

      const allowedTypes = new Set(["question", "flashcard"]);
      const sanitizedEvents = [];

      for (const raw of incomingEvents) {
        if (!raw || typeof raw !== "object") continue;

        const type = typeof raw.type === "string" ? raw.type.toLowerCase() : "";
        if (!allowedTypes.has(type)) continue;

        const chapter = Number(raw.chapter);
        const itemNumber = Number(raw.itemNumber);
        const event = {
          type,
          action: typeof raw.action === "string" ? raw.action.slice(0, 32) : "unknown",
          chapter: Number.isFinite(chapter) ? chapter : null,
          itemNumber: Number.isFinite(itemNumber) ? itemNumber : null,
          isCorrect: typeof raw.isCorrect === "boolean" ? raw.isCorrect : null,
          selectedChoice: Number.isFinite(raw.selectedChoice) ? raw.selectedChoice : null,
          difficulty: typeof raw.difficulty === "string" ? raw.difficulty.slice(0, 32) : null,
          clientTs: typeof raw.clientTs === "number" ? raw.clientTs : null,
          isPremiumContent: raw.isPremiumContent === true,
          isProUser: raw.isProUser === true,
        };

        sanitizedEvents.push(event);
      }

      if (sanitizedEvents.length === 0) {
        throw new HttpsError("invalid-argument", "No valid events were provided.");
      }

      const questionCount = sanitizedEvents.filter((e) => e.type === "question").length;
      const flashcardCount = sanitizedEvents.filter((e) => e.type === "flashcard").length;
      const questionCorrect = sanitizedEvents.filter(
          (e) => e.type === "question" && e.isCorrect === true).length;
      const questionIncorrect = sanitizedEvents.filter(
          (e) => e.type === "question" && e.isCorrect === false).length;
      const visitorId = typeof request.data?.visitorId === "string" ?
        request.data.visitorId.slice(0, 120) : null;

      try {
        await db.collection("study_activity_logs").add({
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          env: process.env.NODE_ENV || "unknown",
          uid: request.auth?.uid || null,
          visitorId: visitorId || null,
          ip: request.rawRequest?.ip || null,
          userAgent: request.rawRequest?.headers?.["user-agent"] || null,
          counts: {
            questions: questionCount,
            flashcards: flashcardCount,
            total: sanitizedEvents.length,
            questionCorrect,
            questionIncorrect,
          },
          events: sanitizedEvents,
        });

        return {success: true, stored: sanitizedEvents.length};
      } catch (error) {
        await logFunctionError(error, {
          functionName: "logStudyActivity",
          uid: request.auth?.uid || null,
          ip: request.rawRequest?.ip || null,
          requestData: {eventCount: sanitizedEvents.length},
          severity: "error",
        });
        throw new HttpsError("internal", "Failed to record activity");
      }
    },
);

export const getQuestionsByChapter = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },

    async (request) => {
      const qualifier = request.auth?.uid? `u_${request.auth.uid}`: request.rawRequest.ip;
      const limiter = request.auth?.uid ? authLimiter : unauthLimiter;
      try {
        await limiter.rejectOnQuotaExceededOrRecordUsage(qualifier);
      } catch (err) {
        try {
          await db.collection("rate_limit_logs").add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: "questions",
            qualifier,
            uid: request.auth?.uid || null,
            ip: request.rawRequest.ip || null,
            userAgent: request.rawRequest.headers["user-agent"] || null,
          });
        } catch (logErr) {
          console.error("Failed to log rate limit event (questions):", logErr);
        }
        throw new HttpsError(
            "resource-exhausted",
            "Too many requests – please try again in a minute.",
        );
      }

      console.log("is prod", isProduction);
      let isPremium = false;
      const authContext = request.auth;

      if (authContext && authContext.uid) {
        const proStatus = authContext.token?.proStatus;
        const member = authContext.token?.member;
        console.log(`User ${authContext.uid} - checking member claim: '${member}' - checking proStatus claim: '${proStatus}'`);

        if (member === true && (proStatus === "Monthly" || proStatus === "Lifetime")) {
          isPremium = true;
          console.log(`User ${authContext.uid} IS premium.`);
        } else {
          isPremium = false;
          console.log(`User ${authContext.uid} is NOT premium.`);
        }
      } else {
        console.log("No authenticated user detected in context.");
        isPremium = false;
      }

      const chapter = parseInt(request.data?.chapter) || 1;
      console.log(`Workspaceing questions for chapter: ${chapter} (Premium: ${isPremium})`);

      let questionsQuery = db.collection("questions")
          .where("chapter", "==", chapter);

      if (!isPremium) {
        console.log("Querying non-premium questions only.");
        questionsQuery = questionsQuery.where("premium", "==", false).orderBy("questionNumber");
      } else {
        console.log("Querying all questions for premium user.");
        questionsQuery = questionsQuery.orderBy("questionNumber");
      }

      const snapshot = await questionsQuery.get();

      if (snapshot.empty) {
        console.log(`No questions found for chapter ${chapter} matching criteria.`);
        return {questions: []};
      }

      console.log(`Found ${snapshot.docs.length} questions.`);
      const questions = snapshot.docs.map((doc) => {
        const questionData = doc.data();
        questionData.id = doc.id;
        return questionData;
      });

      return {questions: questions};
    },
);

export const getFlashCardsByChapter = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (request) => {
      const qualifier = request.auth?.uid? `u_${request.auth.uid}`: request.rawRequest.ip;
      const limiter = request.auth?.uid ? authLimiter : unauthLimiter;
      try {
        await limiter.rejectOnQuotaExceededOrRecordUsage(qualifier);
      } catch (err) {
        try {
          await db.collection("rate_limit_logs").add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: "flashcards",
            qualifier,
            uid: request.auth?.uid || null,
            ip: request.rawRequest.ip || null,
            userAgent: request.rawRequest.headers["user-agent"] || null,
          });
        } catch (logErr) {
          console.error("Failed to log rate limit event (flashcards):", logErr);
        }
        throw new HttpsError(
            "resource-exhausted",
            "Too many requests – please try again in a minute.",
        );
      }

      console.log("is prod", isProduction);
      let isPremium = false;
      const authContext = request.auth;

      if (authContext && authContext.uid) {
        const proStatus = authContext.token?.proStatus;
        const member = authContext.token?.member;
        console.log(`User ${authContext.uid} - checking member claim: '${member}' - checking proStatus claim: '${proStatus}'`);

        if (member === true && (proStatus === "Monthly" || proStatus === "Lifetime")) {
          isPremium = true;
          console.log(`User ${authContext.uid} IS premium.`);
        } else {
          isPremium = false;
          console.log(`User ${authContext.uid} is NOT premium.`);
        }
      } else {
        console.log("No authenticated user detected in context.");
        isPremium = false;
      }

      const chapter = parseInt(request.data?.chapter) || 1;
      console.log(`Fetching flashcards for chapter: ${chapter} (Premium: ${isPremium})`);

      let flashcardsQuery = db.collection("flashcards")
          .where("chapter", "==", chapter);

      if (!isPremium) {
        console.log("Querying non-premium flashcards only.");
        flashcardsQuery = flashcardsQuery.where("premium", "==", false).orderBy("cardNumber");
      } else {
        console.log("Querying all flashcards for premium user.");
        flashcardsQuery = flashcardsQuery.orderBy("cardNumber");
      }

      const snapshot = await flashcardsQuery.get();

      if (snapshot.empty) {
        console.log(`No flashcards found for chapter ${chapter} matching criteria.`);
        return {flashcards: []};
      }

      console.log(`Found ${snapshot.docs.length} flashcards.`);
      const flashcards = snapshot.docs.map((doc) => {
        const flashcardData = doc.data();
        flashcardData.id = doc.id;
        return flashcardData;
      });

      return {flashcards: flashcards};
    },
);

export const preloadContent = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (request) => {
      const qualifier = request.auth?.uid? `u_${request.auth.uid}`: request.rawRequest.ip;
      const limiter = request.auth?.uid ? authLimiter : unauthLimiter;
      try {
        await limiter.rejectOnQuotaExceededOrRecordUsage(qualifier);
      } catch (err) {
        try {
          await db.collection("rate_limit_logs").add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: "preload",
            qualifier,
            uid: request.auth?.uid || null,
            ip: request.rawRequest.ip || null,
            userAgent: request.rawRequest.headers["user-agent"] || null,
          });
        } catch (logErr) {
          console.error("Failed to log rate limit event (preload):", logErr);
        }
        throw new HttpsError(
            "resource-exhausted",
            "Too many requests – please try again in a minute.",
        );
      }

      console.log("is prod", isProduction);
      let isPremium = false;
      const authContext = request.auth;

      if (authContext && authContext.uid) {
        const proStatus = authContext.token?.proStatus;
        const member = authContext.token?.member;
        console.log(`User ${authContext.uid} - checking member claim: '${member}' - checking proStatus claim: '${proStatus}'`);

        if (member === true && (proStatus === "Monthly" || proStatus === "Lifetime")) {
          isPremium = true;
          console.log(`User ${authContext.uid} IS premium.`);
        } else {
          isPremium = false;
          console.log(`User ${authContext.uid} is NOT premium.`);
        }
      } else {
        console.log("No authenticated user detected in context.");
        isPremium = false;
      }

      const chaptersToPreload = [1, 2, 3];
      console.log(`Preloading content for chapters: ${chaptersToPreload.join(", ")} (Premium: ${isPremium})`);

      const result = {
        questions: {},
        flashcards: {},
      };

      for (const chapter of chaptersToPreload) {
        try {
          let questionsQuery = db.collection("questions")
              .where("chapter", "==", chapter);

          if (!isPremium) {
            questionsQuery = questionsQuery.where("premium", "==", false).orderBy("questionNumber");
          } else {
            questionsQuery = questionsQuery.orderBy("questionNumber");
          }

          const questionsSnapshot = await questionsQuery.get();
          result.questions[chapter] = questionsSnapshot.docs.map((doc) => {
            const questionData = doc.data();
            questionData.id = doc.id;
            return questionData;
          });

          let flashcardsQuery = db.collection("flashcards")
              .where("chapter", "==", chapter);

          if (!isPremium) {
            flashcardsQuery = flashcardsQuery.where("premium", "==", false).orderBy("cardNumber");
          } else {
            flashcardsQuery = flashcardsQuery.orderBy("cardNumber");
          }

          const flashcardsSnapshot = await flashcardsQuery.get();
          result.flashcards[chapter] = flashcardsSnapshot.docs.map((doc) => {
            const flashcardData = doc.data();
            flashcardData.id = doc.id;
            return flashcardData;
          });

          console.log(`Preloaded chapter ${chapter}: ${result.questions[chapter].length} 
            questions, ${result.flashcards[chapter].length} flashcards`);
        } catch (error) {
          console.error(`Error preloading chapter ${chapter}:`, error);
          result.questions[chapter] = [];
          result.flashcards[chapter] = [];
        }
      }

      const totalQuestions = Object.values(result.questions).reduce((sum, arr) => sum + arr.length, 0);
      const totalFlashcards = Object.values(result.flashcards).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`Preload complete: ${totalQuestions} total questions, ${totalFlashcards} total flashcards`);

      return result;
    },
);

export const importFlashCardsFromRepo = onSchedule(
    {
      schedule: "0 1 * * *", // Run at 1:00 AM daily (1 hour after questions import)
      timeZone: "America/Los_Angeles",
      region: "us-west1",
      secrets: [githubToken, githubUsername, githubRepo],
    },
    async () => {
      try {
        const token = githubToken.value();
        const username = githubUsername.value();
        const repo = githubRepo.value();

        if (!token || !username || !repo) {
          console.error("Missing GitHub credentials");
          return;
        }

        const metadataRef = db.collection("metadata").doc("flashcards");

        // Get existing metadata document for hash
        const metadataDoc = await metadataRef.get();
        const metadata = metadataDoc.exists ? metadataDoc.data() : {};

        // The file path for flashcards in the repo
        const repoUrl = `https://api.github.com/repos/${username}/${repo}/contents/flashcards.js`;

        const response = await fetch(repoUrl, {
          headers: {Authorization: `token ${token}`},
        });
        const data = await response.json();

        if (!data.content) {
          console.error("No content found in the flashcards.js file from GitHub");
          return;
        }

        // Decode the file content (GitHub returns the content in base64)
        const jsonStr = Buffer.from(data.content, "base64").toString("utf8");

        // Compute a SHA-256 hash of the JSON string
        const newHash = crypto.createHash("sha256").update(jsonStr).digest("hex");
        const storedHash = metadata.hash || null;

        if (storedHash === newHash) {
          console.log("No changes detected for flashcards; skipping update.");
          return;
        }

        // Parse the flashcards (json)
        const flashcards = JSON.parse(jsonStr);
        console.log(`Fetched ${flashcards.length} flashcards from repo`);

        // Delete all existing flashcards
        const flashcardsQuerySnapshot = await db.collection("flashcards").get();
        const deleteBatch = db.batch();
        flashcardsQuerySnapshot.docs.forEach((doc) => {
          deleteBatch.delete(doc.ref);
        });
        await deleteBatch.commit();
        console.log("Cleared all existing flashcards");

        // Add new flashcards in batches (max 500 batch size)
        const batchSize = 400;
        let batchCount = 0;

        for (let i = 0; i < flashcards.length; i += batchSize) {
          const batch = db.batch();
          const batchItems = flashcards.slice(i, i + batchSize);

          batchItems.forEach((flashcard) => {
            const docRef = db.collection("flashcards").doc();
            batch.set(docRef, flashcard);
          });

          await batch.commit();
          batchCount++;
          console.log(`Imported batch ${batchCount} (${batchItems.length} flashcards)`);
        }

        // Update the stored hash in metadata
        await metadataRef.set({hash: newHash});
        console.log(`Flashcards imported successfully. Updated metadata hash.`);
      } catch (error) {
        console.error("Error importing flashcards:", error);
      }
    },
);

export const importQuestionsFromRepo = onSchedule(
    {
      schedule: "0 0 * * *",
      timeZone: "America/Los_Angeles",
      region: "us-west1",
      secrets: [githubToken, githubUsername, githubRepo],
    },
    async () => {
      try {
        const token = githubToken.value();
        const username = githubUsername.value();
        const repo = githubRepo.value();

        if (!token || !username || !repo) {
          console.error("Missing GitHub credentials");
          return;
        }

        const chapters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
        const metadataRef = db.collection("metadata").doc("questions");

        // Get existing metadata document for hashes
        const metadataDoc = await metadataRef.get();
        const metadata = metadataDoc.exists ? metadataDoc.data() : {};

        for (const chapter of chapters) {
          const repoUrl = `https://api.github.com/repos/${username}/${repo}/contents/${chapter}.js`;

          const response = await fetch(repoUrl, {
            headers: {Authorization: `token ${token}`},
          });
          const data = await response.json();
          if (!data.content) {
            console.error(`No content found in the file for chapter ${chapter} from GitHub`);
            continue;
          }

          // Decode the file content (GitHub returns the content in base64)
          const jsonStr = Buffer.from(data.content, "base64").toString("utf8");

          // Compute a SHA-256 hash of the JSON string
          const newHash = crypto.createHash("sha256").update(jsonStr).digest("hex");
          const storedHash = metadata[`hash_${chapter}`] || null;
          if (storedHash === newHash) {
            console.log(`No changes detected for chapter ${chapter}; skipping update.`);
            continue;
          }

          // Parse the questions (json)
          const questions = JSON.parse(jsonStr);
          console.log(`Fetched questions for chapter ${chapter} from repo:`, questions);

          // Delete all existing questions for this chapter
          const chapterQuerySnapshot = await db
              .collection("questions")
              .where("chapter", "==", chapter)
              .get();
          const deleteBatch = db.batch();
          chapterQuerySnapshot.docs.forEach((doc) => {
            deleteBatch.delete(doc.ref);
          });
          await deleteBatch.commit();
          console.log(`Cleared the questions for chapter ${chapter}`);

          // Add new questions in a batch write (ensure each question has the correct chapter field)
          const addBatch = db.batch();
          questions.forEach((question) => {
            question.chapter = chapter;
            const docRef = db.collection("questions").doc();
            addBatch.set(docRef, question);
          });
          await addBatch.commit();
          console.log(`Questions for chapter ${chapter} imported to Firestore successfully`);

          // Update the stored hash for this chapter in metadata
          metadata[`hash_${chapter}`] = newHash;
        }

        // Save updated metadata (all chapter hashes)
        await metadataRef.set(metadata);
        console.log("Updated metadata hashes for chapters:", chapters);
      } catch (error) {
        console.error("Error importing questions:", error);
      }
    },
);

export const expireCanceledMemberships = onSchedule(
    {
      schedule: "0 0 * * *",
      timeZone: "America/Los_Angeles",
      region: "us-west1",
    },
    async () => {
      const now = admin.firestore.Timestamp.now();

      const snapshot = await db.collection("members")
          .where("cancelAt", "<=", now)
          .where("subscriptionType", "==", "Monthly")
          .get();

      if (snapshot.empty) {
        console.log("No memberships to expire.");
        return;
      }

      const batch = db.batch();

      for (const doc of snapshot.docs) {
        const userId = doc.id;

        batch.set(doc.ref, {
          member: false,
          subscriptionType: null,
          cancelAt: admin.firestore.FieldValue.delete(),
        }, {merge: true});

        await admin.auth().setCustomUserClaims(userId, {member: false, proStatus: null});
        console.log(`Expired membership for user: ${userId}`);
      }

      await batch.commit();
    },
);

export const createCheckoutSession = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
      secrets: [stripeSecretKeyDev, stripeSecretKeyProd],
    },
    async (request) => {
      console.log("is prod", isProduction);
      const stripeSecretKey = isProduction ? stripeSecretKeyProd : stripeSecretKeyDev;
      const authContext = request.auth;

      if (!authContext || !authContext.uid) {
        console.error("No authenticated user detected.");
        throw new Error("Authentication required");
      }

      const userId = authContext.uid;
      const {type, successUrl, cancelUrl} = request.data;

      // Initialize Stripe with the secret key
      stripe = stripe || new Stripe(stripeSecretKey.value());

      try {
      // Determine the mode based on the priceId
        const mode = type === "lifetime" ? "payment" : "subscription";
        const subType = type === "lifetime" ? "Lifetime" : "Monthly";

        let priceId;

        if (isProduction) {
          if (type === "lifetime") {
            priceId = "price_1RCnE0D0qfc5FtYvebtSnn2E"; // prod lifetime
          } else {
            priceId = "price_1RCq08D0qfc5FtYvyVaSkEO2"; // prod monthly
          }
        } else {
          if (type === "lifetime") {
            priceId = "price_1RAZgSDHHGtkTOPhyhqr29ai"; // dev lifetime
          } else {
            priceId = "price_1RCq0dDHHGtkTOPht9gQjVxa"; // dev monthly
          }
        }

        console.log("Creating Stripe Checkout session with:", {
          payment_method_types: ["card"],
          mode,
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          success_url: `${successUrl}&sessionId={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl,
          metadata: {
            userId,
            subType,
          },
        });

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode,
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          success_url: `${successUrl}&sessionId={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl,
          metadata: {
            userId,
            subType,
          },
        });

        // Return the session URL instead of the session ID
        return {url: session.url};
      } catch (error) {
        console.error("Error creating Stripe Checkout session:", error);
        const humanMsg = "Error on create checkout session (Stripe). Please try again or contact support if the issue persists.";
        await logFunctionError(error, {
          functionName: "createCheckoutSession",
          uid: authContext?.uid || null,
          ip: request.rawRequest?.ip || null,
          requestData: {type, isProd: isProduction},
          severity: "error",
          bucket: "stripe",
          humanMessage: humanMsg,
        });
        throw new HttpsError("internal", humanMsg);
      }
    },
);

export const handleStripeWebhook = onRequest(
    {
      region: "us-west1",
      enforceAppCheck: true,
      secrets: [stripeSecretKeyDev, stripeSecretKeyProd, stripeWebhookSecretDev, stripeWebhookSecretProd],
    },
    async (req, res) => {
      console.log("is prod", isProduction);
      const stripeSecretKey = isProduction ? stripeSecretKeyProd : stripeSecretKeyDev;
      const stripeWebhookSecret = isProduction ? stripeWebhookSecretProd : stripeWebhookSecretDev;
      // Initialize Stripe with the secret key
      stripe = stripe || new Stripe(stripeSecretKey.value());

      const sig = req.headers["stripe-signature"];

      console.log("Stripe Webhook Details:", {
        rawBody: req.rawBody.toString(),
        signature: sig,
        stripeSecretKey: stripeSecretKey.value(),
        stripeWebhookSecret: stripeWebhookSecret.value(),
        eventType: req.body.type,
        eventData: req.body.data,
      });
      let event;

      // Use rawBody instead of req.body
      try {
        if (!req.rawBody) {
          throw new Error("Raw body is not available. Ensure Firebase Functions is configured correctly.");
        }

        event = stripe.webhooks.constructEvent(req.rawBody, sig, stripeWebhookSecret.value());
      } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        await logFunctionError(err, {
          functionName: "handleStripeWebhook",
          uid: null,
          ip: req.ip || req.rawRequest?.ip || null,
          requestData: {eventType: req.body?.type},
          severity: "warning",
          bucket: "stripe",
          humanMessage: "Payment webhook error. Check logs and Stripe dashboard.",
        });
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      // Handle the event
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const userId = session.metadata?.userId;
          const subscriptionType = session.metadata?.subType;

          console.log("Processing checkout.session.completed for session:", session.id);
          console.log("Session metadata:", session.metadata);

          if (!userId) {
            console.warn("Missing userId. Cannot process session.");
            break;
          }

          const userDocRef = db.collection("members").doc(userId);
          const customerId = session.customer;
          const subscriptionId = session.subscription;

          if (subscriptionType === "Monthly") {
            try {
              console.log(`Handling recurring subscription setup for user: ${userId}`);

              await userDocRef.set(
                  {
                    member: true,
                    subscriptionId: subscriptionId,
                    customerId: customerId,
                    subscriptionType: subscriptionType,
                    subscriptionStart: admin.firestore.FieldValue.serverTimestamp(),
                  },
                  {merge: true},
              );

              await admin.auth().setCustomUserClaims(userId, {
                member: true,
                proStatus: subscriptionType,
              });

              console.log(`Subscription activated for user: ${userId} with proStatus: ${subscriptionType}`);
            } catch (error) {
              console.error("Error handling subscription activation:", error);
              return res.status(500).send("Internal Server Error");
            }
          } else if (subscriptionType === "Lifetime") {
            console.log(`Handling one-time payment for Lifetime upgrade for user: ${userId}`);

            try {
              const existingDoc = await userDocRef.get();
              const userData = existingDoc.exists ? existingDoc.data() : null;

              if (userData?.subscriptionId) {
                try {
                  await stripe.subscriptions.cancel(userData.subscriptionId);
                  console.log(`Cancelled existing subscription for user: ${userId}`);
                } catch (cancelErr) {
                  console.warn(`Failed to cancel sub ${userData.subscriptionId} for user ${userId}:`, cancelErr);
                }
              }

              const subscriptionStart = (userData && userData.subscriptionStart) ?
              userData.subscriptionStart :
              admin.firestore.FieldValue.serverTimestamp();

              await userDocRef.set(
                  {
                    customerId: customerId,
                    subscriptionId: admin.firestore.FieldValue.delete(),
                    subscriptionType: subscriptionType,
                    cancelAt: admin.firestore.FieldValue.delete(),
                    member: true,
                    subscriptionStart: subscriptionStart,
                  },
                  {merge: true},
              );

              try {
                const user = await admin.auth().getUser(userId);
                const existingClaims = user.customClaims || {};
                delete existingClaims.expires;

                await admin.auth().setCustomUserClaims(userId, {
                  ...existingClaims,
                  member: true,
                  proStatus: subscriptionType,
                });

                console.log(`User ${userId} upgraded to Lifetime successfully.`);
              } catch (authErr) {
                console.error(`Failed to update custom claims for user ${userId}:`, authErr);
              }
            } catch (err) {
              console.error("Failed to handle lifetime upgrade:", err);
              return res.status(500).send("Internal Server Error");
            }
          } else {
            console.warn(`Unknown subscriptionType '${subscriptionType}' for user: ${userId}`);
          }

          break;
        }
        case "customer.subscription.updated": {
          const subscription = event.data.object;
          const customerId = subscription.customer;
          const cancelAt = subscription.cancel_at_period_end ? subscription.cancel_at : null;

          const memberSnap = await db.collection("members")
              .where("customerId", "==", customerId)
              .limit(1)
              .get();

          if (memberSnap.empty) {
            console.warn(`No user found in Firestore for customerId: ${customerId}`);
            break;
          }

          const memberDoc = memberSnap.docs[0];
          const userId = memberDoc.id;
          const memberData = memberDoc.data();

          try {
            if (cancelAt) {
              // user scheduled a cancellation
              const cancelDate = new Date(cancelAt * 1000);
              console.log(`User ${userId} scheduled cancel at: ${cancelDate.toISOString()}`);

              await db.collection("members").doc(userId).set(
                  {
                    cancelAt: admin.firestore.Timestamp.fromDate(cancelDate),
                    cancelTime: admin.firestore.FieldValue.serverTimestamp(),
                  },
                  {merge: true},
              );

              const user = await admin.auth().getUser(userId);
              const existingClaims = user.customClaims || {};

              await admin.auth().setCustomUserClaims(userId, {
                ...existingClaims,
                member: true,
                proStatus: "Monthly",
                expires: cancelAt,
              });
            } else {
              const hadCancelScheduled = !!memberData.cancelAt;

              if (!hadCancelScheduled) {
                // renewal / invoice roll / metadata update
                console.log(`User ${userId} subscription updated with no cancellation scheduled. No action needed.`);
                break;
              }
              // user resumed subscription — remove scheduled cancel
              console.log(`User ${userId} resumed subscription. Clearing cancelAt.`);

              await db.collection("members").doc(userId).set(
                  {
                    cancelAt: admin.firestore.FieldValue.delete(),
                    resumeTime: admin.firestore.FieldValue.serverTimestamp(),
                  },
                  {merge: true},
              );

              const user = await admin.auth().getUser(userId);
              const existingClaims = user.customClaims || {};
              delete existingClaims.expires;

              await admin.auth().setCustomUserClaims(userId, {
                ...existingClaims,
                member: true,
                proStatus: "Monthly",
              });
            }
          } catch (error) {
            console.error("Failed to update subscription state:", error);
            return res.status(500).send("Internal Server Error");
          }

          break;
        }
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.status(200).send("Webhook received");
    },
);

export const manageSubscription = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
      secrets: [stripeSecretKeyDev, stripeSecretKeyProd],
    },
    async (request) => {
      const authContext = request.auth;

      if (!authContext || !authContext.uid) {
        console.error("No authenticated user detected.");
        throw new Error("Authentication required");
      }

      console.log("is prod", isProduction);

      const stripeSecretKey = isProduction ? stripeSecretKeyProd : stripeSecretKeyDev;

      stripe = stripe || new Stripe(stripeSecretKey.value());

      const userId = authContext.uid;

      try {
      // Fetch the customer ID from Firestore
        const userDoc = await db.collection("members").doc(userId).get();
        if (!userDoc.exists || !userDoc.data().customerId) {
          console.error(`No customer ID found for user: ${userId}`);
          throw new Error("Customer not found");
        }

        const customerId = userDoc.data().customerId;

        // Create a billing portal session
        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: request.data.returnUrl,
        });

        return {url: session.url};
      } catch (error) {
        console.error("Error creating billing portal session:", error);
        const humanMsg = "Error on manage subscription (Stripe). Please try again or contact support if the issue persists.";
        await logFunctionError(error, {
          functionName: "manageSubscription",
          uid: authContext?.uid || null,
          ip: request.rawRequest?.ip || null,
          requestData: {isProd: isProduction},
          severity: "error",
          bucket: "stripe",
          humanMessage: humanMsg,
        });
        throw new HttpsError("internal", humanMsg);
      }
    },
);

export const syncClaimsOnManualUpdate = onDocumentUpdated(
    {
      document: "members/{userId}",
      region: "us-west1",
    },
    async (event) => {
      const userId = event.params.userId;

      const beforeSnap = event.data?.before;
      const afterSnap = event.data?.after;

      if (!beforeSnap || !afterSnap) {
        console.log(`Snapshot data missing for event on user: ${userId}. Skipping.`);
        return null;
      }

      const beforeData = beforeSnap.data();
      const afterData = afterSnap.data();

      if (beforeData?.manualClaimSyncRequired !== true && afterData?.manualClaimSyncRequired === true) {
        console.log(`Manual claim sync triggered for user: ${userId}`);

        const desiredClaims = {
          member: afterData.member === true,
          proStatus: afterData.subscriptionType || null,
          expires: afterData.cancelAt ? afterData.cancelAt.seconds : null,
          isAdmin: afterData.admin === true,
        };

        try {
          const user = await admin.auth().getUser(userId);
          const currentClaims = user.customClaims || {};

          const currentClaimsToCompare = {
            member: currentClaims.member === true,
            proStatus: currentClaims.proStatus || null,
            expires: currentClaims.expires || null,
            isAdmin: currentClaims.isAdmin === true,
          };

          const needsUpdate = JSON.stringify(desiredClaims) !== JSON.stringify(currentClaimsToCompare);

          if (needsUpdate) {
            console.log(`Updating claims for user ${userId}:`, desiredClaims);
            await admin.auth().setCustomUserClaims(userId, desiredClaims);
          } else {
            console.log(`Claims for user ${userId} are already up-to-date.`);
          }

          await afterSnap.ref.update({
            manualClaimSyncRequired: false,
          });

          console.log(`Successfully processed manual claim sync and reset flag for user: ${userId}`);
        } catch (error) {
          console.error(`Error updating claims or resetting flag for user ${userId}:`, error);
        }
      }
      return null;
    });

export const getAdminData = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (request) => {
      const authContext = request.auth;

      if (!authContext || !authContext.uid) {
        throw new HttpsError("unauthenticated", "Authentication required");
      }

      // Check if user is admin
      const isAdminClaim = authContext.token?.isAdmin;
      if (!isAdminClaim) {
        throw new HttpsError("permission-denied", "Admin access required");
      }

      const userId = authContext.uid;
      console.log(`Admin data request from user: ${userId}`);

      try {
        // Get Firebase Auth users (paginated)
        let allUsers = [];
        let totalAuthUsers = 0;
        let usersHasMore = false;
        let usersCursor = null;
        try {
          // First page for initial table data
          const firstPage = await admin.auth().listUsers(USERS_PAGE_SIZE);
          totalAuthUsers += firstPage.users.length;
          usersHasMore = !!firstPage.pageToken;
          usersCursor = firstPage.pageToken || null;
          allUsers = firstPage.users.map((user) => ({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            creationTime: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime,
            emailVerified: user.emailVerified,
            customClaims: user.customClaims || {},
          }));

          // Count remaining users to get an accurate total
          let pageToken = firstPage.pageToken;
          while (pageToken) {
            const result = await admin.auth().listUsers(1000, pageToken);
            totalAuthUsers += result.users.length;
            pageToken = result.pageToken;
          }
        } catch (authError) {
          console.error("Error fetching users from Auth:", authError);
        }

        // Get members data (paginated)
        const membersSnapshot = await db.collection("members")
            .orderBy(admin.firestore.FieldPath.documentId(), "desc")
            .limit(MEMBERS_PAGE_SIZE + 1)
            .get();
        const members = [];
        const membersHasMore = membersSnapshot.size > MEMBERS_PAGE_SIZE;
        const memberDocs = membersHasMore ?
          membersSnapshot.docs.slice(0, MEMBERS_PAGE_SIZE) :
          membersSnapshot.docs;
        const lastMemberDoc = memberDocs[memberDocs.length - 1];
        const membersCursor = lastMemberDoc ? {
          id: lastMemberDoc.id,
        } : null;

        for (const doc of memberDocs) {
          const memberData = doc.data();
          memberData.id = doc.id;

          // Convert Timestamps to readable dates
          if (memberData.cancelAt && typeof memberData.cancelAt.toDate === "function") {
            memberData.cancelAt = memberData.cancelAt.toDate().toISOString();
          }

          members.push(memberData);
        }

        // Get rate limit logs (paginated)
        const rateLimitSnapshot = await db.collection("rate_limit_logs")
            .orderBy("timestamp", "desc")
            .orderBy(admin.firestore.FieldPath.documentId(), "desc")
            .limit(RATE_LIMIT_LOG_PAGE_SIZE + 1)
            .get();

        const rateLimitDocs = rateLimitSnapshot.docs;
        const rateLimitHasMore = rateLimitDocs.length > RATE_LIMIT_LOG_PAGE_SIZE;
        const rateLimitSlice = rateLimitHasMore ?
          rateLimitDocs.slice(0, RATE_LIMIT_LOG_PAGE_SIZE) :
          rateLimitDocs;
        const rateLimitLogs = rateLimitSlice.map(normalizeRateLimitLogDoc);
        const lastRateDoc = rateLimitSlice[rateLimitSlice.length - 1];
        const lastRateTs = lastRateDoc?.get("timestamp");
        const rateLimitCursor = lastRateDoc ? {
          timestampMs: lastRateTs?.toMillis ?
            lastRateTs.toMillis() :
            (typeof lastRateTs === "string" ? Date.parse(lastRateTs) : null),
          id: lastRateDoc.id,
        } : null;

        // Study activity logs (batched user/visitor events)
        const activitySnapshot = await db.collection("study_activity_logs")
            .orderBy("createdAt", "desc")
            .orderBy(admin.firestore.FieldPath.documentId(), "desc")
            .limit(ACTIVITY_LOG_PAGE_SIZE + 1)
            // Only fetch lightweight fields to avoid shipping large event payloads
            .select("createdAt", "env", "uid", "visitorId", "ip", "counts", "totalEvents")
            .get();

        const activityDocs = activitySnapshot.docs;
        const activityHasMore = activityDocs.length > ACTIVITY_LOG_PAGE_SIZE;
        const activityDocsSlice = activityHasMore ?
          activityDocs.slice(0, ACTIVITY_LOG_PAGE_SIZE) :
          activityDocs;
        const activityLogs = activityDocsSlice.map(normalizeActivityLogDoc);
        const lastActivityDoc = activityDocsSlice[activityDocsSlice.length - 1];
        const lastActivityCreatedAt = lastActivityDoc?.get("createdAt");
        const activityCursor = lastActivityDoc ? {
          createdAtMs: lastActivityCreatedAt?.toMillis ?
            lastActivityCreatedAt.toMillis() :
            (typeof lastActivityCreatedAt === "string" ?
              Date.parse(lastActivityCreatedAt) : null),
          id: lastActivityDoc.id,
        } : null;

        const activityStats = activityLogs.reduce((acc, log) => {
          acc.totalBatches += 1;
          acc.totalEvents += log.eventCount || 0;
          acc.questionEvents += log.counts?.questions || 0;
          acc.flashcardEvents += log.counts?.flashcards || 0;
          if (log.visitorId) acc.visitors.add(log.visitorId);
          if (log.uid) acc.users.add(log.uid);
          return acc;
        }, {
          totalBatches: 0,
          totalEvents: 0,
          questionEvents: 0,
          flashcardEvents: 0,
          visitors: new Set(),
          users: new Set(),
        });

        const [
          activityTotalSnapshot,
          rateLimitTotalSnapshot,
          errorTotalSnapshot,
          membersTotalSnapshot,
        ] = await Promise.all([
          db.collection("study_activity_logs").count().get(),
          db.collection("rate_limit_logs").count().get(),
          db.collection("function_error_logs").count().get(),
          db.collection("members").count().get(),
        ]);
        const activityLogsTotal = activityTotalSnapshot.data().count;
        const rateLimitLogsTotal = rateLimitTotalSnapshot.data().count;
        const errorLogsTotal = errorTotalSnapshot.data().count;
        const membersTotal = membersTotalSnapshot.data().count;

        // Get recent function error logs (paginated)
        let errorLogs = [];
        let errorHasMore = false;
        let errorCursor = null;
        try {
          const errorSnapshot = await db.collection("function_error_logs")
              .orderBy("lastSeen", "desc")
              .orderBy(admin.firestore.FieldPath.documentId(), "desc")
              .limit(ERROR_LOG_PAGE_SIZE + 1)
              .get();

          const errorDocs = errorSnapshot.docs;
          errorHasMore = errorDocs.length > ERROR_LOG_PAGE_SIZE;
          const errorSlice = errorHasMore ? errorDocs.slice(0, ERROR_LOG_PAGE_SIZE) : errorDocs;
          errorLogs = errorSlice.map(normalizeErrorLogDoc);
          const lastErrorDoc = errorSlice[errorSlice.length - 1];
          const lastSeen = lastErrorDoc?.get("lastSeen");
          errorCursor = lastErrorDoc ? {
            lastSeenMs: lastSeen?.toMillis ?
              lastSeen.toMillis() :
              (typeof lastSeen === "string" ? Date.parse(lastSeen) : null),
            id: lastErrorDoc.id,
          } : null;
        } catch (err) {
          console.error("Failed to fetch function_error_logs:", err);
        }

        // Get content stats
        const questionsSnapshotSize = (await db.collection("questions").get()).size;
        const flashcardsSnapshotSize = (await db.collection("flashcards").get()).size;

        // Calculate stats (exclude admin accounts from member counts)
        const adminUsers = members.filter((m) => m.admin === true).length;

        // Members excluding admin accounts
        const nonAdminMembers = members.filter((m) => m.admin !== true);

        // Members are defined as users with an active Monthly or Lifetime subscription
        const monthlyMembers = nonAdminMembers.filter((m) =>
          m.subscriptionType === "Monthly" && m.member === true,
        ).length;
        const lifetimeMembers = nonAdminMembers.filter((m) =>
          m.subscriptionType === "Lifetime" && m.member === true,
        ).length;

        // Total members is the sum of monthly + lifetime (exclude admin accounts)
        const totalMembers = monthlyMembers + lifetimeMembers;

        // Rate limit stats
        const rateLimitStats = {
          totalLogs: rateLimitLogsTotal,
          questionLogs: rateLimitLogs.filter((log) => log.type === "questions").length,
          flashcardLogs: rateLimitLogs.filter((log) => log.type === "flashcards").length,
          uniqueIPs: [...new Set(rateLimitLogs.map((log) => log.ip).filter(Boolean))].length,
          uniqueUsers: [...new Set(rateLimitLogs.map((log) => log.uid).filter(Boolean))].length,
        };

        console.log(`Admin data request completed. ` +
          `Returning ${totalAuthUsers} auth users, ${totalMembers} members ` +
          `and ${rateLimitLogs.length} rate limit logs.`);

        return {
          users: allUsers,
          members,
          rateLimitLogs,
          rateLimitLogsPageInfo: {
            hasMore: rateLimitHasMore,
            cursor: rateLimitCursor,
            page: 1,
            pageSize: RATE_LIMIT_LOG_PAGE_SIZE,
            total: rateLimitLogsTotal,
          },
          errorLogs,
          errorLogsPageInfo: {
            hasMore: errorHasMore,
            cursor: errorCursor,
            page: 1,
            pageSize: ERROR_LOG_PAGE_SIZE,
            total: errorLogsTotal,
          },
          activityLogs,
          activityLogsPageInfo: {
            hasMore: activityHasMore,
            cursor: activityCursor,
            page: 1,
            pageSize: ACTIVITY_LOG_PAGE_SIZE,
            total: activityLogsTotal,
          },
          membersPageInfo: {
            hasMore: membersHasMore,
            cursor: membersCursor,
            page: 1,
            pageSize: MEMBERS_PAGE_SIZE,
            total: membersTotal,
          },
          usersPageInfo: {
            hasMore: usersHasMore,
            cursor: usersCursor,
            page: 1,
            pageSize: USERS_PAGE_SIZE,
            total: totalAuthUsers,
          },
          stats: {
            totalAuthUsers,
            totalMembers,
            monthlyMembers,
            lifetimeMembers,
            adminUsers,
            contentStats: {
              totalQuestions: questionsSnapshotSize,
              totalFlashcards: flashcardsSnapshotSize,
            },
            rateLimitStats,
            activityStats: {
              totalBatches: activityStats.totalBatches,
              totalEvents: activityStats.totalEvents,
              questionEvents: activityStats.questionEvents,
              flashcardEvents: activityStats.flashcardEvents,
              uniqueVisitors: activityStats.visitors.size,
              uniqueUsers: activityStats.users.size,
            },
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        console.error("Error fetching admin data:", error);
        await logFunctionError(error, {
          functionName: "getAdminData",
          uid: authContext?.uid || null,
          ip: request.rawRequest?.ip || null,
          severity: "error",
          bucket: "generic",
          humanMessage: "An internal server error occurred while loading admin data.",
        });
        throw new HttpsError("internal", "Failed to fetch admin data");
      }
    },
);

export const getStudyActivityLogsPage = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (request) => {
      const authContext = request.auth;

      if (!authContext || !authContext.uid) {
        throw new HttpsError("unauthenticated", "Authentication required");
      }

      const isAdminClaim = authContext.token?.isAdmin;
      if (!isAdminClaim) {
        throw new HttpsError("permission-denied", "Admin access required");
      }

      const page = Number(request.data?.page) || 1;
      const pageSize = Number(request.data?.pageSize) || ACTIVITY_LOG_PAGE_SIZE;
      const offset = (page - 1) * pageSize;

      // Get total count
      const totalQuery = db.collection("study_activity_logs");
      const totalSnapshot = await totalQuery.count().get();
      const total = totalSnapshot.data().count;

      const query = db.collection("study_activity_logs")
          .orderBy("createdAt", "desc")
          .orderBy(admin.firestore.FieldPath.documentId(), "desc")
          .offset(offset)
          .limit(pageSize)
          .select("createdAt", "env", "uid", "visitorId", "ip", "counts", "totalEvents");

      const snapshot = await query.get();
      const activityLogs = snapshot.docs.map(normalizeActivityLogDoc);
      const hasMore = (page * pageSize) < total;

      return {
        activityLogs,
        pageInfo: {
          hasMore,
          page,
          pageSize,
          total,
        },
      };
    },
);

export const getRateLimitLogsPage = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (request) => {
      const authContext = request.auth;

      if (!authContext || !authContext.uid) {
        throw new HttpsError("unauthenticated", "Authentication required");
      }

      const isAdminClaim = authContext.token?.isAdmin;
      if (!isAdminClaim) {
        throw new HttpsError("permission-denied", "Admin access required");
      }

      const page = Number(request.data?.page) || 1;
      const pageSize = Number(request.data?.pageSize) || RATE_LIMIT_LOG_PAGE_SIZE;
      const offset = (page - 1) * pageSize;

      // Get total count
      const totalQuery = db.collection("rate_limit_logs");
      const totalSnapshot = await totalQuery.count().get();
      const total = totalSnapshot.data().count;

      const query = db.collection("rate_limit_logs")
          .orderBy("timestamp", "desc")
          .orderBy(admin.firestore.FieldPath.documentId(), "desc")
          .offset(offset)
          .limit(pageSize);

      const snapshot = await query.get();
      const rateLimitLogs = snapshot.docs.map(normalizeRateLimitLogDoc);
      const hasMore = (page * pageSize) < total;

      return {
        rateLimitLogs,
        pageInfo: {
          hasMore,
          page,
          pageSize,
          total,
        },
      };
    },
);

export const getFunctionErrorLogsPage = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (request) => {
      const authContext = request.auth;

      if (!authContext || !authContext.uid) {
        throw new HttpsError("unauthenticated", "Authentication required");
      }

      const isAdminClaim = authContext.token?.isAdmin;
      if (!isAdminClaim) {
        throw new HttpsError("permission-denied", "Admin access required");
      }

      const page = Number(request.data?.page) || 1;
      const pageSize = Number(request.data?.pageSize) || ERROR_LOG_PAGE_SIZE;
      const offset = (page - 1) * pageSize;

      // Get total count
      const totalQuery = db.collection("function_error_logs");
      const totalSnapshot = await totalQuery.count().get();
      const total = totalSnapshot.data().count;

      const query = db.collection("function_error_logs")
          .orderBy("lastSeen", "desc")
          .orderBy(admin.firestore.FieldPath.documentId(), "desc")
          .offset(offset)
          .limit(pageSize);

      const snapshot = await query.get();
      const errorLogs = snapshot.docs.map(normalizeErrorLogDoc);
      const hasMore = (page * pageSize) < total;

      return {
        errorLogs,
        pageInfo: {
          hasMore,
          page,
          pageSize,
          total,
        },
      };
    },
);

export const getMembersPage = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (request) => {
      const authContext = request.auth;
      if (!authContext?.uid) {
        throw new HttpsError("unauthenticated", "Authentication required");
      }
      if (!authContext.token?.isAdmin) {
        throw new HttpsError("permission-denied", "Admin access required");
      }

      const page = Number(request.data?.page) || 1;
      const pageSize = Number(request.data?.pageSize) || MEMBERS_PAGE_SIZE;
      const offset = (page - 1) * pageSize;

      // Get total count
      const totalQuery = db.collection("members");
      const totalSnapshot = await totalQuery.count().get();
      const total = totalSnapshot.data().count;

      const query = db.collection("members")
          .orderBy(admin.firestore.FieldPath.documentId(), "desc")
          .offset(offset)
          .limit(pageSize);

      const snapshot = await query.get();
      const members = snapshot.docs.map((doc) => {
        const data = doc.data();
        data.id = doc.id;
        if (data.cancelAt && typeof data.cancelAt.toDate === "function") {
          data.cancelAt = data.cancelAt.toDate().toISOString();
        }
        return data;
      });
      const hasMore = (page * pageSize) < total;

      return {
        members,
        pageInfo: {
          hasMore,
          page,
          pageSize,
          total,
        },
      };
    },
);

export const getUsersPage = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (request) => {
      const authContext = request.auth;
      if (!authContext?.uid) {
        throw new HttpsError("unauthenticated", "Authentication required");
      }
      if (!authContext.token?.isAdmin) {
        throw new HttpsError("permission-denied", "Admin access required");
      }

      const page = Number(request.data?.page) || 1;
      const pageSize = Number(request.data?.pageSize) || USERS_PAGE_SIZE;
      const offset = (page - 1) * pageSize;

      // For Firebase Auth, we need to load all users since no offset support
      // This is acceptable for admin since user count is typically small
      let allUsers = [];
      let pageToken = undefined;
      do {
        const result = await admin.auth().listUsers(1000, pageToken);
        allUsers = allUsers.concat(result.users);
        pageToken = result.pageToken;
      } while (pageToken);

      const total = allUsers.length;
      const start = offset;
      const end = start + pageSize;
      const users = allUsers.slice(start, end).map((user) => ({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        creationTime: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime,
        emailVerified: user.emailVerified,
        customClaims: user.customClaims || {},
      }));

      const hasMore = end < total;

      return {
        users,
        pageInfo: {
          hasMore,
          page,
          pageSize,
          total,
        },
      };
    },
);
