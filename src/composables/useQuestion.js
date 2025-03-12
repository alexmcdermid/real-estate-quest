import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";

const CACHE_KEY_PREFIX = "questions_chapter_";

export async function fetchQuestionsByChapter(chapter = 1) {
  const cacheKey = `${CACHE_KEY_PREFIX}${chapter}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      console.error("Error parsing cached data:", error);
    }
  }

  const functions = getFunctions(firebaseApp, "us-west1");
  const getQuestionsByChapterCallable = httpsCallable(functions, "getQuestionsByChapter");
  try {
    const result = await getQuestionsByChapterCallable({ chapter });
    localStorage.setItem(cacheKey, JSON.stringify(result.data.questions));
    return result.data.questions;
  } catch (error) {
    console.error("Error fetching question:", error);
    throw error;
  }
}
