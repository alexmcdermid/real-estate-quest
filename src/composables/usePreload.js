import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";
import { CACHE_KEY, STALE_TIME } from '../config/constants';
import { encodeCache, decodeCache } from './useQuestion';
import { showRateLimitBanner } from './useRateLimitBanner';
import { showNotification } from './useNotifier';

/**
 * Checks if any content in the cache is stale or missing
 * Backend will determine which chapters to send
 * @returns {Object} - Cache status with timestamp of newest cache entry
 */
function getCacheStatus() {
  try {
    const cachedEncoded = localStorage.getItem(CACHE_KEY);
    if (!cachedEncoded) {
      return { hasCache: false, newestTimestamp: null };
    }

    const cache = decodeCache(cachedEncoded);
    
    // Find the newest timestamp across all cached content
    let newestTimestamp = 0;
    for (const key in cache) {
      if (cache[key]?.timestamp && cache[key].timestamp > newestTimestamp) {
        newestTimestamp = cache[key].timestamp;
      }
    }
    
    return { 
      hasCache: newestTimestamp > 0, 
      newestTimestamp 
    };
  } catch (error) {
    console.error('Error checking cache status:', error);
    return { hasCache: false, newestTimestamp: null };
  }
}

/**
 * Preloads content using a single API call
 * Backend determines which chapters to preload based on business logic
 * This runs in the background without blocking the UI
 */
export async function preloadContent() {
  try {
    const cacheStatus = getCacheStatus();
    
    // Check if cache is fresh (less than 24 hours old)
    if (cacheStatus.hasCache && cacheStatus.newestTimestamp) {
      const cacheAge = Date.now() - cacheStatus.newestTimestamp;
      if (cacheAge < STALE_TIME) {
        return;
      }
    }

    const functions = getFunctions(firebaseApp, "us-west1");
    const preloadContentCallable = httpsCallable(functions, "preloadContent");
    
    const result = await preloadContentCallable();
    
    let cache = {};
    const cachedEncoded = localStorage.getItem(CACHE_KEY);
    if (cachedEncoded) {
      cache = decodeCache(cachedEncoded);
    }

    const timestamp = Date.now();

    // Update cache with questions for each chapter
    for (const [chapter, questions] of Object.entries(result.data.questions)) {
      cache[chapter] = {
        timestamp,
        questions,
      };
    }

    // Update cache with flashcards for each chapter
    for (const [chapter, flashcards] of Object.entries(result.data.flashcards)) {
      cache[`flashcards_${chapter}`] = {
        timestamp,
        flashcards,
      };
    }

    // Save updated cache
    localStorage.setItem(CACHE_KEY, encodeCache(cache));
  } catch (error) {
    if (
      error?.code === 'resource-exhausted' ||
      error?.message?.includes('Too many requests') ||
      error?.status === 'RESOURCE_EXHAUSTED'
    ) {
      showRateLimitBanner();
      return;
    }
    // Silently fail - preloading is a nice-to-have, not critical
    console.warn('Error during content preload:', error);
  }
}

/**
 * Initiates content preload when the browser is idle
 * This ensures we don't impact initial page load performance
 * Backend determines which chapters to preload based on business logic
 */
export function initPreload() {
  // Use requestIdleCallback if available, otherwise setTimeout as fallback
  if ('requestIdleCallback' in window) {
    requestIdleCallback(
      () => {
        preloadContent();
      },
      { timeout: 3000 } // Ensure it runs within 3 seconds even if browser is busy
    );
  } else {
    // Fallback for browsers that don't support requestIdleCallback
    setTimeout(() => {
      preloadContent();
    }, 1000);
  }
}
