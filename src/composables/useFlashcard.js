import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";
import { CACHE_KEY, STALE_TIME } from "../config/constants";
import { encodeCache, decodeCache } from "./useQuestion";
import { showRateLimitBanner } from './useRateLimitBanner';
import { showNotification } from './useNotifier';

/**
 * Cache key for one chapter's flashcards from one content source.
 *
 * @param {string} contentSource - "mixed", "human" or "ai".
 * @param {number|string} chapter - The chapter number.
 * @returns {string} - e.g. "flashcards_mixed_3".
 */
export function flashcardsCacheKey(contentSource, chapter) {
  return `flashcards_${contentSource}_${chapter}`;
}

/**
 * Fetches flashcards for a specific chapter
 *
 * @param {number} chapter - The chapter number to fetch flashcards for
 * @param {string} contentSource - "mixed", "human" or "ai", already resolved by resolveContentSource
 * @returns {Array} - Array of flashcards for the specified chapter
 */
export async function fetchFlashcardsByChapter(chapter = 1, contentSource = "mixed") {
  // Retrieve the entire cache from localStorage and decode it
  let cache = {};
  const cachedEncoded = localStorage.getItem(CACHE_KEY);
  if (cachedEncoded) {
    cache = decodeCache(cachedEncoded);
  }

  // Check if the cache for this chapter and source exists and is still fresh
  const cacheKey = flashcardsCacheKey(contentSource, chapter);
  if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp < STALE_TIME)) {
    return cache[cacheKey].flashcards;
  }

  // Otherwise, fetch from the function
  const functions = getFunctions(firebaseApp, "us-west1");
  const getFlashcardsByChapterCallable = httpsCallable(functions, "getFlashCardsByChapter");
  try {
    const result = await getFlashcardsByChapterCallable({ chapter, contentSource });
    // Re-read the cache: the content version check (useContentStatus.js) may have cleared it while this
    // request was in flight, and writing the old copy back would undo that
    const latestCachedEncoded = localStorage.getItem(CACHE_KEY);
    cache = latestCachedEncoded ? decodeCache(latestCachedEncoded) : {};
    // Update the cache object with the new data
    cache[cacheKey] = {
      timestamp: Date.now(),
      flashcards: result.data.flashcards,
    };
    // Encode and save the updated cache
    localStorage.setItem(CACHE_KEY, encodeCache(cache));
    return result.data.flashcards;
  } catch (error) {
    if (
      error?.code === 'resource-exhausted' ||
      error?.message?.includes('Too many requests') ||
      error?.status === 'RESOURCE_EXHAUSTED'
    ) {
      showRateLimitBanner();
      return [];
    }
    console.error("Error fetching flashcards:", error);
    showNotification('An unexpected error occurred while fetching flashcards.', 'error', 5000);
    throw error;
  }
}
