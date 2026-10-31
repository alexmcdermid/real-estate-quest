import { reactive } from "vue";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";
import { CACHE_KEY } from "../config/constants";
import { encodeCache, decodeCache, clearCache } from "./useQuestion";

export const QUESTION_SOURCES = ["mixed", "human", "ai"];

/**
 * Picks the question source the server applies. Same rule as resolveQuestionSource in functions/aiQuestions.js.
 *
 * @param {Object} params
 * @param {boolean} params.aiQuestionsServed - The admin switch that serves AI questions to students.
 * @param {boolean} params.isPro - Whether the user is a Pro member.
 * @param {string} params.requestedQuestionSource - The user's saved choice.
 * @returns {string} - "mixed", "human" or "ai".
 */
export function resolveQuestionSource({ aiQuestionsServed, isPro, requestedQuestionSource }) {
  if (!aiQuestionsServed) return "human";   // serving off: human questions only
  if (!isPro) return "mixed";               // free users get no choice
  return QUESTION_SOURCES.includes(requestedQuestionSource) ? requestedQuestionSource : "mixed";
}

// Filled once per page load by checkContentStatus()
export const contentStatus = reactive({
  contentVersion: null,
  aiQuestionsServed: false,
  checked: false,
});

function readCache() {
  const cachedEncoded = localStorage.getItem(CACHE_KEY);
  return cachedEncoded ? decodeCache(cachedEncoded) : {};
}

/**
 * Asks the server for the content version and whether AI questions are served.
 * A version that differs from the cached one means questions changed (or AI serving was switched),
 * so the cached content is dropped. On failure the cache is kept and AI questions stay hidden. Never throws.
 */
export async function checkContentStatus() {
  try {
    const functions = getFunctions(firebaseApp, "us-west1");
    // Callers wait on this check before reading even a fresh cached chapter, so a stalled call must fall back to the
    // cache quickly instead of after the SDK's 70 second default
    const getContentStatusCallable = httpsCallable(functions, "getContentStatus", { timeout: 10000 });
    const result = await getContentStatusCallable();
    const { contentVersion, aiQuestionsServed } = result.data || {};
    if (!Number.isFinite(contentVersion)) {
      throw new Error(`getContentStatus returned an invalid contentVersion: ${contentVersion}`);
    }

    contentStatus.contentVersion = contentVersion;
    contentStatus.aiQuestionsServed = aiQuestionsServed === true;

    if (readCache().contentVersion !== contentVersion) {
      clearCache();
      const cache = readCache();
      cache.contentVersion = contentVersion;
      localStorage.setItem(CACHE_KEY, encodeCache(cache));
    }
  } catch (error) {
    console.warn("Could not check the content version, keeping the cached content:", error);
  } finally {
    contentStatus.checked = true;
  }
}

let contentStatusCheckPromise = null;

/**
 * Runs checkContentStatus() once per page load; every caller awaits the same promise.
 */
export function ensureContentStatusChecked() {
  if (!contentStatusCheckPromise) {
    contentStatusCheckPromise = checkContentStatus();
  }
  return contentStatusCheckPromise;
}
