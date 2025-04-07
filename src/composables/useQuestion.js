import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";
import { CACHE_KEY, STALE_TIME } from "../config/constants"
 
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

  const preservedOptions = cache.options || {};
  localStorage.setItem(CACHE_KEY, encodeCache({ options: preservedOptions }));
}

export async function fetchQuestionsByChapter(chapter = 1) {
  // Retrieve the entire cache from localStorage and decode it
  let cache = {};
  const cachedEncoded = localStorage.getItem(CACHE_KEY);
  if (cachedEncoded) {
    cache = decodeCache(cachedEncoded);
  }

  // Check if the cache for this chapter exists and is still fresh
  if (cache[chapter] && (Date.now() - cache[chapter].timestamp < STALE_TIME)) {
    return cache[chapter].questions;
  }

  // Otherwise, fetch from the function
  const functions = getFunctions(firebaseApp, "us-west1");
  const getQuestionsByChapterCallable = httpsCallable(functions, "getQuestionsByChapter");
  try {
    const result = await getQuestionsByChapterCallable({ chapter });
    // Update the cache object with the new data
    cache[chapter] = {
      timestamp: Date.now(),
      questions: result.data.questions,
    };
    // Encode and save the updated cache
    localStorage.setItem(CACHE_KEY, encodeCache(cache));
    return result.data.questions;
  } catch (error) {
    console.error("Error fetching questions:", error);
    return error;
  }
}
