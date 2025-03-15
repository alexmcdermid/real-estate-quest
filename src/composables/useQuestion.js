import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";

const CACHE_KEY = "qc";

function encodeCache(cacheObject) {
  return btoa(JSON.stringify(cacheObject));
}

function decodeCache(encodedString) {
  try {
    return JSON.parse(atob(encodedString));
  } catch (error) {
    console.error("Error decoding cache:", error);
    return {};
  }
}

export async function fetchQuestionsByChapter(chapter = 1) {
  // Retrieve the entire cache from localStorage and decode it
  let cache = {};
  const cachedEncoded = localStorage.getItem(CACHE_KEY);
  if (cachedEncoded) {
    cache = decodeCache(cachedEncoded);
  }

  // Return cached questions for the chapter if available
  if (cache[chapter]) {
    return cache[chapter];
  }

  // Otherwise, fetch from the function
  const functions = getFunctions(firebaseApp, "us-west1");
  const getQuestionsByChapterCallable = httpsCallable(functions, "getQuestionsByChapter");
  try {
    const result = await getQuestionsByChapterCallable({ chapter });
    // Update the cache object with the new data
    cache[chapter] = result.data.questions;
    // Encode and save the updated cache
    localStorage.setItem(CACHE_KEY, encodeCache(cache));
    return result.data.questions;
  } catch (error) {
    console.error("Error fetching questions:", error);
    throw error;
  }
}
