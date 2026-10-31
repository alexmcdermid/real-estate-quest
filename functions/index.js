import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineSecret} from "firebase-functions/params";
import admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import crypto from "crypto";
import Stripe from "stripe";
import {
  MIN_AI_QUESTIONS_PER_RUN,
  MAX_AI_QUESTIONS_PER_RUN,
  resolveQuestionSource,
  parseRequestedQuestionSource,
  normalizeAiSettings,
  validateAiQuestion,
  computeContentHash,
  parseChapterFile,
  appendAiQuestionToChapterFile,
  normalizeAiChapterDocs,
  timestampToIso,
} from "./aiQuestions.js";
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
// The AI generator's own database: questionsAiPending (the review queue) and generationRuns.
const aiDb = getFirestore(admin.app(), "ai");

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

// Fine-grained token with contents read/write on the AI questions repo only. Its owner is GITHUB_USERNAME.
const aiQuestionsGithubToken = defineSecret("AI_QUESTIONS_GITHUB_TOKEN");
const aiQuestionsGithubRepo = defineSecret("AI_QUESTIONS_GITHUB_REPO");

const isProduction = process.env.NODE_ENV === "production";

// Initialize Stripe (lazy initialization in functions)
let stripe;

const ACTIVITY_LOG_PAGE_SIZE = 20;
const RATE_LIMIT_LOG_PAGE_SIZE = 20;
const ERROR_LOG_PAGE_SIZE = 20;
const MEMBERS_PAGE_SIZE = 20;
const USERS_PAGE_SIZE = 20;
const AI_GENERATION_RUNS_PAGE_SIZE = 10;

const QUESTION_CHAPTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const CHAPTER_LOCK_TTL_MS = 2 * 60 * 1000;
const FIRESTORE_BATCH_WRITE_LIMIT = 500;
// Keeps every GitHub call well inside the chapter lock's TTL (fetch would otherwise wait up to 5 minutes).
const GITHUB_REQUEST_TIMEOUT_MS = 20 * 1000;
const GITHUB_COMMIT_ATTEMPTS = 3;
const PENDING_QUESTION_ID_MAX_LENGTH = 128;
const REJECTION_REASON_MAX_LENGTH = 500;

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

/**
 * Throws unless the caller is signed in and has the isAdmin claim.
 *
 * @param {object} request - The callable request.
 * @return {string} The admin's uid.
 */
function requireAdmin(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  if (!request.auth.token?.isAdmin) {
    throw new HttpsError("permission-denied", "Admin access required");
  }
  return request.auth.uid;
}

/**
 * Reads metadata/aiQuestions with defaults applied (everything off when the document is missing).
 *
 * @return {Promise<object>} {generationEnabled, servingEnabled, questionsPerRun}.
 */
async function readAiSettings() {
  const aiSettingsDoc = await db.collection("metadata").doc("aiQuestions").get();
  return normalizeAiSettings(aiSettingsDoc.data());
}

/**
 * Reads the questionSource a client asked for, rejecting unknown values.
 *
 * @param {any} value - request.data.questionSource.
 * @return {string} The requested source ("mixed" when none was sent).
 */
function readRequestedQuestionSource(value) {
  try {
    return parseRequestedQuestionSource(value);
  } catch (error) {
    throw new HttpsError("invalid-argument", error.message);
  }
}

/**
 * Fetches a chapter's questions for the applied question source: human questions first, then AI questions,
 * each sorted by questionNumber. Free users only get free questions.
 *
 * @param {object} params
 * @param {number} params.chapter - The chapter number.
 * @param {boolean} params.isPremium - Whether the caller is a pro member.
 * @param {string} params.questionSource - The applied source, from resolveQuestionSource.
 * @return {Promise<Array<object>>} The questions, each with its document id.
 */
async function fetchQuestionsForChapter({chapter, isPremium, questionSource}) {
  let humanQuestionsQuery = db.collection("questions")
      .where("chapter", "==", chapter);
  if (!isPremium) {
    humanQuestionsQuery = humanQuestionsQuery.where("premium", "==", false).orderBy("questionNumber");
  } else {
    humanQuestionsQuery = humanQuestionsQuery.orderBy("questionNumber");
  }

  // Equality filters only, so questionsAi needs no composite index. Sorted in memory instead.
  let aiQuestionsQuery = db.collection("questionsAi")
      .where("chapter", "==", chapter);
  if (!isPremium) {
    aiQuestionsQuery = aiQuestionsQuery.where("premium", "==", false);
  }

  const [humanQuestionsSnapshot, aiQuestionsSnapshot] = await Promise.all([
    questionSource === "ai" ? null : humanQuestionsQuery.get(),
    questionSource === "human" ? null : aiQuestionsQuery.get(),
  ]);

  const humanQuestions = humanQuestionsSnapshot ?
    humanQuestionsSnapshot.docs.map((doc) => ({...doc.data(), id: doc.id})) :
    [];
  const aiQuestions = aiQuestionsSnapshot ?
    aiQuestionsSnapshot.docs
        .map((doc) => ({...doc.data(), id: doc.id}))
        .sort((first, second) => first.questionNumber - second.questionNumber) :
    [];
  return [...humanQuestions, ...aiQuestions];
}

/**
 * The metadata/content fields that make clients drop their cached questions on their next page load.
 *
 * @return {object} Fields to merge into metadata/content.
 */
function buildContentVersionBump() {
  return {
    contentVersion: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Sends a request to the GitHub contents API for one file of a repo.
 *
 * @param {object} params
 * @param {string} params.repoOwner - The repo's owner.
 * @param {string} params.repoName - The repo's name.
 * @param {string} params.repoToken - A token with access to the repo.
 * @param {string} params.filePath - The file's path in the repo.
 * @param {object} [params.requestOptions] - Extra fetch options (method, headers, body).
 * @return {Promise<Response>} The fetch response.
 */
function requestRepoFile({repoOwner, repoName, repoToken, filePath, requestOptions = {}}) {
  return fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
    ...requestOptions,
    headers: {
      "Authorization": `token ${repoToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "real-estate-quest-functions",
      ...requestOptions.headers,
    },
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
  });
}

/**
 * Describes a GitHub response for log and error messages.
 *
 * @param {Response} response - The fetch response.
 * @return {Promise<string>} The status and the start of the response body.
 */
async function describeGithubResponse(response) {
  const responseText = await response.text().catch(() => "");
  return `status ${response.status}: ${responseText.slice(0, 200)}`;
}

/**
 * Reads one file from a GitHub repo.
 *
 * @param {object} params
 * @param {string} params.repoOwner - The repo's owner.
 * @param {string} params.repoName - The repo's name.
 * @param {string} params.repoToken - A token with read access to the repo.
 * @param {string} params.filePath - The file's path in the repo.
 * @return {Promise<object|null>} {content (decoded utf8), sha}, or null when the file does not exist.
 */
async function fetchRepoFile({repoOwner, repoName, repoToken, filePath}) {
  const response = await requestRepoFile({repoOwner, repoName, repoToken, filePath});
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub GET ${filePath} failed with ${await describeGithubResponse(response)}`);
  }
  const responseBody = await response.json();
  if (!responseBody.content) {
    throw new Error(`GitHub GET ${filePath} returned no file content`);
  }
  return {content: Buffer.from(responseBody.content, "base64").toString("utf8"), sha: responseBody.sha};
}

/**
 * Creates or updates one file in a GitHub repo.
 *
 * @param {object} params
 * @param {string} params.repoOwner - The repo's owner.
 * @param {string} params.repoName - The repo's name.
 * @param {string} params.repoToken - A token with contents write access to the repo.
 * @param {string} params.filePath - The file's path in the repo.
 * @param {string} params.fileContent - The new file content.
 * @param {string} [params.sha] - The sha of the file being replaced; left out when creating the file.
 * @param {string} params.commitMessage - The commit message.
 * @return {Promise<string>} "committed", or "conflict" when the file changed since it was read.
 */
async function putRepoFile({repoOwner, repoName, repoToken, filePath, fileContent, sha, commitMessage}) {
  const requestBody = {
    message: commitMessage,
    content: Buffer.from(fileContent, "utf8").toString("base64"),
  };
  if (sha) requestBody.sha = sha;

  const response = await requestRepoFile({
    repoOwner,
    repoName,
    repoToken,
    filePath,
    requestOptions: {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(requestBody),
    },
  });
  if (response.status === 200 || response.status === 201) return "committed";
  // 409: the sha is stale. 422: the file was created after it was read, so a sha was required.
  if (response.status === 409 || response.status === 422) {
    console.warn(`GitHub PUT ${filePath} reported a conflict with ${await describeGithubResponse(response)}`);
    return "conflict";
  }
  throw new Error(`GitHub PUT ${filePath} failed with ${await describeGithubResponse(response)}`);
}

/**
 * Takes a lock document in the locks collection. Locks expire on their own, so a holder that dies
 * can't block anyone for longer than ttlMs.
 *
 * @param {string} lockId - The lock's document id.
 * @param {string} owner - Who is taking the lock (for debugging).
 * @param {number} ttlMs - How long the lock lasts.
 * @return {Promise<string|null>} The lock token, or null when someone else holds the lock.
 */
async function acquireLock(lockId, owner, ttlMs) {
  const lockRef = db.collection("locks").doc(lockId);
  return db.runTransaction(async (transaction) => {
    const lockDoc = await transaction.get(lockRef);
    const now = admin.firestore.Timestamp.now();
    const existingExpiresAt = lockDoc.exists ? lockDoc.get("expiresAt") : null;
    if (existingExpiresAt?.toMillis && existingExpiresAt.toMillis() > now.toMillis()) {
      return null;
    }
    const lockToken = crypto.randomUUID();
    transaction.set(lockRef, {
      lockToken,
      owner,
      acquiredAt: now,
      expiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + ttlMs),
    });
    return lockToken;
  });
}

/**
 * Releases a lock if the caller still holds it. Never throws.
 *
 * @param {string} lockId - The lock's document id.
 * @param {string} lockToken - The token acquireLock returned.
 */
async function releaseLock(lockId, lockToken) {
  const lockRef = db.collection("locks").doc(lockId);
  try {
    await db.runTransaction(async (transaction) => {
      const lockDoc = await transaction.get(lockRef);
      if (lockDoc.exists && lockDoc.get("lockToken") === lockToken) {
        transaction.delete(lockRef);
      }
    });
  } catch (error) {
    console.error(`Failed to release lock ${lockId}:`, error);
  }
}

/**
 * Replaces one chapter of a question collection in a single batch: deletes the chapter's documents, adds the
 * new ones, stores the source file's hash and bumps metadata/content. Students never see a half-written chapter.
 *
 * @param {object} params
 * @param {string} params.collectionName - "questions" or "questionsAi".
 * @param {number} params.chapter - The chapter number.
 * @param {Array<object>} params.questionDocs - The chapter's new documents.
 * @param {string} params.fileHash - The hash of the repo file the documents came from.
 * @return {Promise<number>} The number of documents written.
 */
async function replaceChapterDocuments({collectionName, chapter, questionDocs, fileHash}) {
  const existingChapterSnapshot = await db.collection(collectionName)
      .where("chapter", "==", chapter)
      .get();
  // + 2 for the hash and contentVersion writes
  const batchWriteCount = existingChapterSnapshot.size + questionDocs.length + 2;
  if (batchWriteCount > FIRESTORE_BATCH_WRITE_LIMIT) {
    throw new Error(`Replacing ${collectionName} chapter ${chapter} needs ${batchWriteCount} writes, ` +
      `more than the ${FIRESTORE_BATCH_WRITE_LIMIT} one batch allows`);
  }

  const batch = db.batch();
  existingChapterSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
  questionDocs.forEach((questionDoc) => batch.set(db.collection(collectionName).doc(), questionDoc));
  batch.set(db.collection("metadata").doc(collectionName), {[`hash_${chapter}`]: fileHash}, {merge: true});
  batch.set(db.collection("metadata").doc("content"), buildContentVersionBump(), {merge: true});
  await batch.commit();
  return questionDocs.length;
}

/**
 * Imports one chapter file from a repo into its collection, holding the chapter lock throughout.
 * The file is fetched after the lock is taken, so this always writes the newest file.
 *
 * @param {object} params
 * @param {string} params.repoOwner - The repo's owner.
 * @param {string} params.repoName - The repo's name.
 * @param {string} params.repoToken - A token with read access to the repo.
 * @param {string} params.filePath - The chapter file's path in the repo.
 * @param {string} params.collectionName - "questions" or "questionsAi".
 * @param {number} params.chapter - The chapter number.
 * @param {boolean} params.isAiRepo - Whether the file comes from the AI questions repo.
 * @return {Promise<object>} {chapter, status: "locked", "missing", "unchanged" or "imported", questionCount}.
 */
async function importChapterFromRepo({repoOwner, repoName, repoToken, filePath, collectionName, chapter, isAiRepo}) {
  const lockId = `${collectionName}_chapter_${chapter}`;
  const lockToken = await acquireLock(lockId, "nightly-import", CHAPTER_LOCK_TTL_MS);
  // Skipping is safe: the holder (an approval) is already writing the newest file.
  if (!lockToken) return {chapter, status: "locked"};

  try {
    const repoFile = await fetchRepoFile({repoOwner, repoName, repoToken, filePath});
    if (!repoFile) return {chapter, status: "missing"};

    const fileHash = computeContentHash(repoFile.content);
    const metadataDoc = await db.collection("metadata").doc(collectionName).get();
    if (metadataDoc.get(`hash_${chapter}`) === fileHash) return {chapter, status: "unchanged"};

    const parsedQuestions = parseChapterFile(repoFile.content);
    const questionDocs = isAiRepo ?
      normalizeAiChapterDocs(parsedQuestions, chapter) :
      parsedQuestions.map((question) => ({...question, chapter}));
    const questionCount = await replaceChapterDocuments({collectionName, chapter, questionDocs, fileHash});
    return {chapter, status: "imported", questionCount};
  } finally {
    await releaseLock(lockId, lockToken);
  }
}

/**
 * Builds the questionsAi documents for an AI chapter file during an approval, with the nightly import's checks.
 *
 * @param {Array} parsedChapterFile - The parsed chapter file.
 * @param {number} chapter - The chapter number.
 * @return {Array<object>} The questionsAi documents.
 * @throws {HttpsError} failed-precondition when an entry is invalid, since the import would refuse the file.
 */
function normalizeAiChapterDocsForApproval(parsedChapterFile, chapter) {
  try {
    return normalizeAiChapterDocs(parsedChapterFile, chapter);
  } catch (error) {
    throw new HttpsError("failed-precondition", `Chapter ${chapter}'s AI file has an invalid entry: ${error.message}`);
  }
}

/**
 * Adds an approved question to its chapter file in the AI repo, retrying when GitHub reports a conflict.
 * Safe to repeat: when the file already has the question's aiQuestionId, nothing is committed.
 * Nothing is committed to a chapter file the nightly import can't import either.
 *
 * @param {object} params
 * @param {string} params.repoOwner - The AI repo's owner.
 * @param {string} params.repoName - The AI repo's name.
 * @param {string} params.repoToken - A token with contents write access to the AI repo.
 * @param {object} params.approvedQuestion - {chapter, question, choices, correctChoice, explanation, premium,
 *   aiQuestionId}.
 * @return {Promise<object>} {committedContent, questionDocs (the questionsAi documents for committedContent),
 *   questionNumber, alreadyInRepo, entryAlreadyInRepo (only when alreadyInRepo)}.
 */
async function commitAiQuestionToRepo({repoOwner, repoName, repoToken, approvedQuestion}) {
  const chapter = approvedQuestion.chapter;
  const filePath = `${chapter}.json`;
  for (let attempt = 1; attempt <= GITHUB_COMMIT_ATTEMPTS; attempt++) {
    const repoFile = await fetchRepoFile({repoOwner, repoName, repoToken, filePath});
    const existingQuestions = repoFile ? parseChapterFile(repoFile.content) : [];
    const appendResult = appendAiQuestionToChapterFile(existingQuestions, approvedQuestion);
    if (appendResult.alreadyInRepo) {
      // An earlier attempt committed but did not finish; only the Firestore step is left.
      return {
        committedContent: repoFile.content,
        questionDocs: normalizeAiChapterDocsForApproval(existingQuestions, chapter),
        questionNumber: appendResult.questionNumber,
        alreadyInRepo: true,
        entryAlreadyInRepo: appendResult.entryAlreadyInRepo,
      };
    }

    // Checked before the commit, so an invalid entry already in the file stops the approval with nothing committed.
    const questionDocs = normalizeAiChapterDocsForApproval(parseChapterFile(appendResult.fileContent), chapter);
    const putResult = await putRepoFile({
      repoOwner,
      repoName,
      repoToken,
      filePath,
      fileContent: appendResult.fileContent,
      sha: repoFile?.sha,
      commitMessage: `Add AI question ${appendResult.questionNumber} to chapter ${chapter}`,
    });
    if (putResult === "committed") {
      return {
        committedContent: appendResult.fileContent,
        questionDocs,
        questionNumber: appendResult.questionNumber,
        alreadyInRepo: false,
      };
    }
    console.warn(`GitHub conflict on ${filePath}, attempt ${attempt} of ${GITHUB_COMMIT_ATTEMPTS}`);
  }
  throw new HttpsError("aborted", `GitHub reported a conflict ${GITHUB_COMMIT_ATTEMPTS} times. Try again.`);
}

/**
 * Checks the pendingQuestionId argument of the AI review callables.
 *
 * @param {any} pendingQuestionId - The value the client sent.
 * @return {string} The pending question's document id.
 */
function readPendingQuestionId(pendingQuestionId) {
  if (typeof pendingQuestionId !== "string" || pendingQuestionId === "" ||
      pendingQuestionId.length > PENDING_QUESTION_ID_MAX_LENGTH || pendingQuestionId.includes("/")) {
    throw new HttpsError("invalid-argument", "pendingQuestionId must be a document id");
  }
  return pendingQuestionId;
}

/**
 * Shapes a questionsAiPending document for the admin review list.
 *
 * @param {Object} doc - The Firestore document snapshot.
 * @return {Object} The pending question.
 */
function normalizePendingQuestionDoc(doc) {
  const pendingQuestion = doc.data();
  return {
    id: doc.id,
    chapter: pendingQuestion.chapter,
    question: pendingQuestion.question,
    choices: pendingQuestion.choices,
    correctChoice: pendingQuestion.correctChoice,
    explanation: pendingQuestion.explanation,
    generatedAt: timestampToIso(pendingQuestion.generatedAt),
    generationRunId: pendingQuestion.generationRunId ?? null,
    trigger: pendingQuestion.trigger ?? null,
    requestedBy: pendingQuestion.requestedBy ?? null,
  };
}

/**
 * Shapes a generationRuns document for the admin page.
 *
 * @param {Object} doc - The Firestore document snapshot.
 * @return {Object} The generation run.
 */
function normalizeGenerationRunDoc(doc) {
  const generationRun = doc.data();
  return {
    id: doc.id,
    trigger: generationRun.trigger ?? null,
    chapter: generationRun.chapter ?? null,
    requestedQuestionCount: generationRun.requestedQuestionCount ?? null,
    generatedQuestionCount: generationRun.generatedQuestionCount ?? null,
    status: generationRun.status ?? null,
    errors: Array.isArray(generationRun.errors) ? generationRun.errors : [],
    dryRun: generationRun.dryRun === true,
    requestedBy: generationRun.requestedBy ?? null,
    startedAt: timestampToIso(generationRun.startedAt),
    finishedAt: timestampToIso(generationRun.finishedAt),
    model: generationRun.model ?? null,
  };
}

/**
 * Counts a chapter's live human and AI questions, in total and free, for the approve screen.
 *
 * @param {number} chapter - The chapter number.
 * @return {Promise<object>} {humanTotal, humanFree, aiTotal, aiFree}.
 */
async function countChapterSplit(chapter) {
  const countMatchingDocs = async (query) => (await query.count().get()).data().count;
  const humanChapterQuery = db.collection("questions").where("chapter", "==", chapter);
  const aiChapterQuery = db.collection("questionsAi").where("chapter", "==", chapter);
  const [humanTotal, humanFree, aiTotal, aiFree] = await Promise.all([
    countMatchingDocs(humanChapterQuery),
    countMatchingDocs(humanChapterQuery.where("premium", "==", false)),
    countMatchingDocs(aiChapterQuery),
    countMatchingDocs(aiChapterQuery.where("premium", "==", false)),
  ]);
  return {humanTotal, humanFree, aiTotal, aiFree};
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
          aiGenerated: raw.aiGenerated === true,
          aiQuestionId: typeof raw.aiQuestionId === "string" ? raw.aiQuestionId.slice(0, 64) : null,
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
      const requestedQuestionSource = readRequestedQuestionSource(request.data?.questionSource);
      const aiSettings = await readAiSettings();
      const questionSource = resolveQuestionSource({
        aiQuestionsServed: aiSettings.servingEnabled,
        isPro: isPremium,
        requestedQuestionSource,
      });
      console.log(`Fetching questions for chapter: ${chapter} (Premium: ${isPremium}, source: ${questionSource})`);
      console.log(isPremium ? "Querying all questions for premium user." : "Querying non-premium questions only.");

      const questions = await fetchQuestionsForChapter({chapter, isPremium, questionSource});

      if (questions.length === 0) {
        console.log(`No questions found for chapter ${chapter} matching criteria.`);
      } else {
        console.log(`Found ${questions.length} questions.`);
      }

      return {questions, questionSource};
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

      const requestedQuestionSource = readRequestedQuestionSource(request.data?.questionSource);
      const aiSettings = await readAiSettings();
      const questionSource = resolveQuestionSource({
        aiQuestionsServed: aiSettings.servingEnabled,
        isPro: isPremium,
        requestedQuestionSource,
      });

      const chaptersToPreload = [1, 2, 3];
      console.log(`Preloading content for chapters: ${chaptersToPreload.join(", ")} ` +
        `(Premium: ${isPremium}, source: ${questionSource})`);

      const result = {
        questions: {},
        flashcards: {},
        questionSource,
      };

      for (const chapter of chaptersToPreload) {
        try {
          result.questions[chapter] = await fetchQuestionsForChapter({chapter, isPremium, questionSource});

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

export const getContentStatus = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async () => {
      // Two document reads behind App Check, so no rate limiter.
      const [contentDoc, aiSettingsDoc] = await db.getAll(
          db.collection("metadata").doc("content"),
          db.collection("metadata").doc("aiQuestions"),
      );
      return {
        contentVersion: Number(contentDoc.get("contentVersion")) || 0,
        aiQuestionsServed: normalizeAiSettings(aiSettingsDoc.data()).servingEnabled,
      };
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
      timeoutSeconds: 300,
      secrets: [githubToken, githubUsername, githubRepo, aiQuestionsGithubToken, aiQuestionsGithubRepo],
    },
    async () => {
      const repoOwner = githubUsername.value();
      const repoImports = [];

      if (repoOwner && githubRepo.value() && githubToken.value()) {
        repoImports.push({
          repoName: githubRepo.value(),
          repoToken: githubToken.value(),
          collectionName: "questions",
          fileExtension: "js",
          isAiRepo: false,
        });
      } else {
        console.error("Missing GitHub credentials for the human questions repo; skipping the human questions import");
      }

      if (repoOwner && aiQuestionsGithubRepo.value() && aiQuestionsGithubToken.value()) {
        repoImports.push({
          repoName: aiQuestionsGithubRepo.value(),
          repoToken: aiQuestionsGithubToken.value(),
          collectionName: "questionsAi",
          fileExtension: "json",
          isAiRepo: true,
        });
      } else {
        console.error("Missing GitHub credentials for the AI questions repo; skipping the AI questions import");
      }

      for (const {repoName, repoToken, collectionName, fileExtension, isAiRepo} of repoImports) {
        const chaptersByStatus = {};
        for (const chapter of QUESTION_CHAPTERS) {
          let status;
          try {
            const importResult = await importChapterFromRepo({
              repoOwner,
              repoName,
              repoToken,
              filePath: `${chapter}.${fileExtension}`,
              collectionName,
              chapter,
              isAiRepo,
            });
            status = importResult.status;
          } catch (error) {
            status = "failed";
            console.error(`Error importing ${collectionName} chapter ${chapter}:`, error);
            await logFunctionError(error, {
              functionName: "importQuestionsFromRepo",
              requestData: {chapter, collectionName},
              severity: "error",
              bucket: "generic",
            });
          }
          chaptersByStatus[status] = [...(chaptersByStatus[status] || []), chapter];
        }

        for (const [status, chapters] of Object.entries(chaptersByStatus)) {
          console.log(`Import ${collectionName} ${status}: chapters ${chapters.join(", ")}`);
        }
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

        // Activity stats: keep lightweight, based on total count only
        const activityStats = {
          totalBatches: activityLogsTotal,
          totalEvents: activityLogsTotal,
          questionEvents: 0,
          flashcardEvents: 0,
          uniqueVisitors: 0,
          uniqueUsers: 0,
        };

        // Rate limit stats
        const rateLimitStats = {
          totalLogs: rateLimitLogsTotal,
          questionLogs: rateLimitLogs.filter((log) => log.type === "questions").length,
          flashcardLogs: rateLimitLogs.filter((log) => log.type === "flashcards").length,
          uniqueIPs: [...new Set(rateLimitLogs.map((log) => log.ip).filter(Boolean))].length,
          uniqueUsers: [...new Set(rateLimitLogs.map((log) => log.uid).filter(Boolean))].length,
        };

        try {
          const rateLimitStatsSnapshot = await db.collection("rate_limit_logs")
              .select("type", "ip", "uid")
              .get();

          let questionLogs = 0;
          let flashcardLogs = 0;
          const uniqueIPs = new Set();
          const uniqueUsers = new Set();

          rateLimitStatsSnapshot.forEach((doc) => {
            const data = doc.data() || {};
            if (data.type === "questions") questionLogs += 1;
            if (data.type === "flashcards") flashcardLogs += 1;
            if (data.ip) uniqueIPs.add(data.ip);
            if (data.uid) uniqueUsers.add(data.uid);
          });

          rateLimitStats.totalLogs = rateLimitLogsTotal;
          rateLimitStats.questionLogs = questionLogs;
          rateLimitStats.flashcardLogs = flashcardLogs;
          rateLimitStats.uniqueIPs = uniqueIPs.size;
          rateLimitStats.uniqueUsers = uniqueUsers.size;
        } catch (e) {
          console.error("Failed to aggregate full rate limit stats, using page slice only", e);
          rateLimitStats.totalLogs = rateLimitLogsTotal;
        }

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
              uniqueVisitors: activityStats.uniqueVisitors,
              uniqueUsers: activityStats.uniqueUsers,
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

export const getAiPendingQuestions = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (request) => {
      const adminUid = requireAdmin(request);

      try {
        const [pendingQuestionsSnapshot, generationRunsSnapshot, settings] = await Promise.all([
          aiDb.collection("questionsAiPending").where("status", "==", "pending").get(),
          aiDb.collection("generationRuns").orderBy("startedAt", "desc").limit(AI_GENERATION_RUNS_PAGE_SIZE).get(),
          readAiSettings(),
        ]);

        // Newest first. Sorted here rather than in the query, so no composite index is needed.
        const pendingQuestions = pendingQuestionsSnapshot.docs
            .map(normalizePendingQuestionDoc)
            .sort((first, second) => (Date.parse(second.generatedAt) || 0) - (Date.parse(first.generatedAt) || 0));
        const generationRuns = generationRunsSnapshot.docs.map(normalizeGenerationRunDoc);

        const pendingChapters = [...new Set(pendingQuestions.map((pendingQuestion) => pendingQuestion.chapter))]
            .filter((chapter) => Number.isInteger(chapter));
        const pendingChapterSplits = await Promise.all(pendingChapters.map((chapter) => countChapterSplit(chapter)));
        const chapterSplits = Object.fromEntries(
            pendingChapters.map((chapter, chapterIndex) => [chapter, pendingChapterSplits[chapterIndex]]),
        );

        return {pendingQuestions, generationRuns, settings, chapterSplits};
      } catch (error) {
        console.error("Error loading AI questions:", error);
        await logFunctionError(error, {
          functionName: "getAiPendingQuestions",
          uid: adminUid,
          ip: request.rawRequest?.ip || null,
          severity: "error",
          bucket: "generic",
        });
        throw new HttpsError("internal", "Failed to load AI questions");
      }
    },
);

export const approveAiQuestion = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
      secrets: [aiQuestionsGithubToken, aiQuestionsGithubRepo, githubUsername],
    },
    async (request) => {
      const adminUid = requireAdmin(request);
      const pendingQuestionId = readPendingQuestionId(request.data?.pendingQuestionId);
      const editedQuestion = request.data?.editedQuestion ?? {};
      if (typeof editedQuestion !== "object" || Array.isArray(editedQuestion)) {
        throw new HttpsError("invalid-argument", "editedQuestion must be an object");
      }
      const premium = typeof request.data?.premium === "boolean" ? request.data.premium : true;

      try {
        const repoOwner = githubUsername.value();
        const repoName = aiQuestionsGithubRepo.value();
        const repoToken = aiQuestionsGithubToken.value();
        if (!repoOwner || !repoName || !repoToken) {
          throw new HttpsError("failed-precondition", "The AI questions repo is not configured");
        }

        const pendingQuestionRef = aiDb.collection("questionsAiPending").doc(pendingQuestionId);
        const pendingQuestionDoc = await pendingQuestionRef.get();
        if (!pendingQuestionDoc.exists) {
          throw new HttpsError("not-found", "Pending question not found");
        }
        const pendingQuestion = pendingQuestionDoc.data();
        if (pendingQuestion.status === "approved") {
          return {
            success: true,
            chapter: pendingQuestion.chapter,
            questionNumber: pendingQuestion.questionNumber,
            alreadyInRepo: true,
          };
        }
        if (pendingQuestion.status === "rejected") {
          throw new HttpsError("failed-precondition", "This question was rejected, so it can't be approved");
        }

        // The chapter always comes from the pending doc, never from the client.
        const chapter = pendingQuestion.chapter;
        if (!QUESTION_CHAPTERS.includes(chapter)) {
          throw new HttpsError("failed-precondition", `The pending question has an invalid chapter: ${chapter}`);
        }

        const candidateQuestion = {};
        for (const fieldName of ["question", "choices", "correctChoice", "explanation"]) {
          candidateQuestion[fieldName] = editedQuestion[fieldName] !== undefined ?
            editedQuestion[fieldName] :
            pendingQuestion[fieldName];
        }
        const validation = validateAiQuestion(candidateQuestion);
        if (!validation.valid) {
          throw new HttpsError("invalid-argument", validation.errors.join("; "));
        }
        const approvedQuestion = validation.question;

        const lockId = `questionsAi_chapter_${chapter}`;
        const lockToken = await acquireLock(lockId, `approve:${pendingQuestionId}`, CHAPTER_LOCK_TTL_MS);
        if (!lockToken) {
          throw new HttpsError("aborted", `Chapter ${chapter} is being updated right now. Try again in a minute.`);
        }

        let repoCommit;
        try {
          repoCommit = await commitAiQuestionToRepo({
            repoOwner,
            repoName,
            repoToken,
            approvedQuestion: {chapter, ...approvedQuestion, premium, aiQuestionId: pendingQuestionId},
          });
          // Written from the committed file while still holding the lock, so a nightly import can't
          // write an older copy over it, and students see the question without waiting for that import.
          await replaceChapterDocuments({
            collectionName: "questionsAi",
            chapter,
            questionDocs: repoCommit.questionDocs,
            fileHash: computeContentHash(repoCommit.committedContent),
          });
        } finally {
          await releaseLock(lockId, lockToken);
        }

        // When an earlier attempt already committed the question, record the entry in the repo, not this retry's edits.
        const {entryAlreadyInRepo} = repoCommit;
        const committedQuestion = repoCommit.alreadyInRepo ? {
          question: entryAlreadyInRepo.question,
          choices: entryAlreadyInRepo.choices,
          correctChoice: entryAlreadyInRepo.correctChoice,
          explanation: entryAlreadyInRepo.explanation,
          premium: entryAlreadyInRepo.premium !== false, // the same default the import applies
        } : {...approvedQuestion, premium};

        // Last, as its own write (a batch can't span two databases). If it fails, the question is
        // already live and approving again finishes the job.
        await pendingQuestionRef.update({
          status: "approved",
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          approvedBy: adminUid,
          questionNumber: repoCommit.questionNumber,
          ...committedQuestion,
        });

        console.log(`AI question ${pendingQuestionId} approved by ${adminUid} as question ${repoCommit.questionNumber} ` +
          `of chapter ${chapter} (premium: ${committedQuestion.premium}, already in repo: ${repoCommit.alreadyInRepo})`);
        return {
          success: true,
          chapter,
          questionNumber: repoCommit.questionNumber,
          alreadyInRepo: repoCommit.alreadyInRepo,
        };
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error("Error approving AI question:", error);
        await logFunctionError(error, {
          functionName: "approveAiQuestion",
          uid: adminUid,
          ip: request.rawRequest?.ip || null,
          requestData: {pendingQuestionId},
          severity: "error",
          bucket: "generic",
        });
        throw new HttpsError("internal", "Failed to approve the AI question");
      }
    },
);

export const rejectAiQuestion = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (request) => {
      const adminUid = requireAdmin(request);
      const pendingQuestionId = readPendingQuestionId(request.data?.pendingQuestionId);
      const rejectionReason = typeof request.data?.rejectionReason === "string" ?
        request.data.rejectionReason.trim().slice(0, REJECTION_REASON_MAX_LENGTH) || null :
        null;

      try {
        const pendingQuestionRef = aiDb.collection("questionsAiPending").doc(pendingQuestionId);
        await aiDb.runTransaction(async (transaction) => {
          const pendingQuestionDoc = await transaction.get(pendingQuestionRef);
          if (!pendingQuestionDoc.exists) {
            throw new HttpsError("not-found", "Pending question not found");
          }
          if (pendingQuestionDoc.get("status") !== "pending") {
            throw new HttpsError("failed-precondition", "Only pending questions can be rejected");
          }
          // Rejected questions stay in the queue so the generator avoids their topics.
          transaction.update(pendingQuestionRef, {
            status: "rejected",
            rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            rejectedBy: adminUid,
            rejectionReason,
          });
        });

        console.log(`AI question ${pendingQuestionId} rejected by ${adminUid}`);
        return {success: true};
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error("Error rejecting AI question:", error);
        await logFunctionError(error, {
          functionName: "rejectAiQuestion",
          uid: adminUid,
          ip: request.rawRequest?.ip || null,
          requestData: {pendingQuestionId},
          severity: "error",
          bucket: "generic",
        });
        throw new HttpsError("internal", "Failed to reject the AI question");
      }
    },
);

export const updateAiSettings = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (request) => {
      const adminUid = requireAdmin(request);
      const requestData = request.data || {};

      const settingsUpdates = {};
      for (const switchName of ["generationEnabled", "servingEnabled"]) {
        if (requestData[switchName] !== undefined) {
          if (typeof requestData[switchName] !== "boolean") {
            throw new HttpsError("invalid-argument", `${switchName} must be a boolean`);
          }
          settingsUpdates[switchName] = requestData[switchName];
        }
      }
      if (requestData.questionsPerRun !== undefined) {
        const questionsPerRun = requestData.questionsPerRun;
        if (!Number.isInteger(questionsPerRun) ||
            questionsPerRun < MIN_AI_QUESTIONS_PER_RUN || questionsPerRun > MAX_AI_QUESTIONS_PER_RUN) {
          throw new HttpsError("invalid-argument",
              `questionsPerRun must be an integer from ${MIN_AI_QUESTIONS_PER_RUN} to ${MAX_AI_QUESTIONS_PER_RUN}`);
        }
        settingsUpdates.questionsPerRun = questionsPerRun;
      }
      if (Object.keys(settingsUpdates).length === 0) {
        throw new HttpsError("invalid-argument",
            "Send at least one of generationEnabled, servingEnabled or questionsPerRun");
      }

      try {
        const aiSettingsRef = db.collection("metadata").doc("aiQuestions");
        const nextSettings = await db.runTransaction(async (transaction) => {
          const aiSettingsDoc = await transaction.get(aiSettingsRef);
          const currentSettings = normalizeAiSettings(aiSettingsDoc.data());
          const updatedSettings = normalizeAiSettings({...currentSettings, ...settingsUpdates});
          transaction.set(aiSettingsRef, updatedSettings, {merge: true});
          // Clients drop their cached questions when contentVersion changes, so a serving change
          // reaches every user on their next page load instead of after the 24 hour cache.
          if (updatedSettings.servingEnabled !== currentSettings.servingEnabled) {
            transaction.set(db.collection("metadata").doc("content"), buildContentVersionBump(), {merge: true});
          }
          return updatedSettings;
        });

        console.log(`AI settings updated by ${adminUid}:`, nextSettings);
        return {settings: nextSettings};
      } catch (error) {
        console.error("Error updating AI settings:", error);
        await logFunctionError(error, {
          functionName: "updateAiSettings",
          uid: adminUid,
          ip: request.rawRequest?.ip || null,
          requestData: settingsUpdates,
          severity: "error",
          bucket: "generic",
        });
        throw new HttpsError("internal", "Failed to update AI settings");
      }
    },
);
