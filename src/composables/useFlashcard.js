import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";
import { CACHE_KEY, STALE_TIME } from "../config/constants";
import { encodeCache, decodeCache } from "./useQuestion";
import { showRateLimitBanner } from './useRateLimitBanner';
import { showNotification } from './useNotifier';

/**
 * Fetches flashcards for a specific chapter
 * 
 * @param {number} chapter - The chapter number to fetch flashcards for
 * @returns {Array} - Array of flashcards for the specified chapter
 */
export async function fetchFlashcardsByChapter(chapter = 1) {
  // Retrieve the entire cache from localStorage and decode it
  let cache = {};
  const cachedEncoded = localStorage.getItem(CACHE_KEY);
  if (cachedEncoded) {
    cache = decodeCache(cachedEncoded);
  }

  // Check if the cache for this chapter's flashcards exists and is still fresh
  const flashcardsCacheKey = `flashcards_${chapter}`;
  if (cache[flashcardsCacheKey] && (Date.now() - cache[flashcardsCacheKey].timestamp < STALE_TIME)) {
    return cache[flashcardsCacheKey].flashcards;
  }

  // Otherwise, fetch from the function
  const functions = getFunctions(firebaseApp, "us-west1");
  const getFlashcardsByChapterCallable = httpsCallable(functions, "getFlashCardsByChapter");
  try {
    const result = await getFlashcardsByChapterCallable({ chapter });
    // Update the cache object with the new data
    cache[flashcardsCacheKey] = {
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