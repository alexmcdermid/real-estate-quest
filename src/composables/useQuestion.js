import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";
import { CACHE_KEY, STALE_TIME } from "../config/constants"
import { showRateLimitBanner } from './useRateLimitBanner';
import { showNotification } from './useNotifier';
 
/**
 * Encodes a Unicode string to Base64.
 * Uses encodeURIComponent to handle characters outside the Latin1 range.
 *
 * @param {any} cacheObject - The object to encode.
 * @returns {string} - The Base64 encoded string.
 */
export function encodeCache(cacheObject) {
  const jsonStr = JSON.stringify(cacheObject);
  return btoa(unescape(encodeURIComponent(jsonStr)));
}

export function decodeCache(encodedString) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encodedString))));
  } catch (error) {
    console.error("Error decoding cache:", error);
    return {};
  }
}

export function clearCache() {
  const cachedEncoded = localStorage.getItem(CACHE_KEY);
  let cache = {};

  if (cachedEncoded) {
    cache = decodeCache(cachedEncoded);
  }

  // Keep the saved options and the content version the cache was checked against (see useContentStatus.js)
  const preservedOptions = cache.options || {};
  localStorage.setItem(CACHE_KEY, encodeCache({ options: preservedOptions, contentVersion: cache.contentVersion }));
}

/**
 * Cache key for one chapter's questions from one content source.
 *
 * @param {string} contentSource - "mixed", "human" or "ai".
 * @param {number|string} chapter - The chapter number.
 * @returns {string} - e.g. "questions_mixed_3".
 */
export function questionsCacheKey(contentSource, chapter) {
  return `questions_${contentSource}_${chapter}`;
}

export async function fetchQuestionsByChapter(chapter = 1, contentSource = "mixed") {
  // Retrieve the entire cache from localStorage and decode it
  let cache = {};
  const cachedEncoded = localStorage.getItem(CACHE_KEY);
  if (cachedEncoded) {
    cache = decodeCache(cachedEncoded);
  }

  // Check if the cache for this chapter and source exists and is still fresh
  const cacheKey = questionsCacheKey(contentSource, chapter);
  if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp < STALE_TIME)) {
    return cache[cacheKey].questions;
  }

  // Otherwise, fetch from the function
  const functions = getFunctions(firebaseApp, "us-west1");
  const getQuestionsByChapterCallable = httpsCallable(functions, "getQuestionsByChapter");
  try {
    const result = await getQuestionsByChapterCallable({ chapter, contentSource });
    // Update the cache object with the new data
    cache[cacheKey] = {
      timestamp: Date.now(),
      questions: result.data.questions,
    };
    // Encode and save the updated cache
    localStorage.setItem(CACHE_KEY, encodeCache(cache));
    return result.data.questions;
  } catch (error) {
    if (
      error?.code === 'resource-exhausted' ||
      error?.message?.includes('Too many requests') ||
      error?.status === 'RESOURCE_EXHAUSTED'
    ) {
      showRateLimitBanner();
      return [];
    }
    console.error("Error fetching questions:", error);
    showNotification('An unexpected error occurred while fetching questions.', 'error', 5000);
    return error;
  }
}
