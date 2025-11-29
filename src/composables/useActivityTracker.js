import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";
import { ref } from "vue";

const BUFFER_THRESHOLD = 3;
const FLUSH_INTERVAL_MS = 20000;
const MAX_BUFFER_SIZE = 50;
const VISITOR_ID_STORAGE_KEY = "req:visitor-id";

const pendingEvents = ref([]);
let flushTimerId = null;
let isFlushing = false;

const functions = getFunctions(firebaseApp, "us-west1");
const logStudyActivity = httpsCallable(functions, "logStudyActivity");

function getVisitorId() {
  if (typeof localStorage === "undefined") return null;

  const existing = localStorage.getItem(VISITOR_ID_STORAGE_KEY);
  if (existing) return existing;

  const newId = typeof crypto !== "undefined" && crypto.randomUUID ?
    crypto.randomUUID() :
    `vid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, newId);
  } catch (err) {
    console.error("Failed to persist visitor id:", err);
  }

  return newId;
}

function scheduleFlush() {
  if (flushTimerId !== null) return;
  flushTimerId = setTimeout(() => flushPendingEvents(true), FLUSH_INTERVAL_MS);
}

async function flushPendingEvents(force = false) {
  if (isFlushing) return;
  if (pendingEvents.value.length === 0) {
    clearTimeout(flushTimerId);
    flushTimerId = null;
    return;
  }

  if (!force && pendingEvents.value.length < BUFFER_THRESHOLD) {
    scheduleFlush();
    return;
  }

  const eventsToSend = pendingEvents.value.splice(0, pendingEvents.value.length);
  clearTimeout(flushTimerId);
  flushTimerId = null;
  isFlushing = true;

  try {
    await logStudyActivity({
      visitorId: getVisitorId(),
      events: eventsToSend,
    });
  } catch (error) {
    console.error("Failed to send study activity events:", error);
    pendingEvents.value.unshift(...eventsToSend);
    if (pendingEvents.value.length > MAX_BUFFER_SIZE) {
      pendingEvents.value.splice(MAX_BUFFER_SIZE);
    }
    scheduleFlush();
  } finally {
    isFlushing = false;
  }
}

function enqueueEvent(event) {
  pendingEvents.value.push({
    ...event,
    clientTs: Date.now(),
  });

  if (pendingEvents.value.length >= BUFFER_THRESHOLD) {
    flushPendingEvents(true);
  } else {
    scheduleFlush();
  }
}

function recordQuestionAnswer({ question, chapter, isCorrect, selectedChoice, isProUser }) {
  if (!question) return;
  enqueueEvent({
    type: "question",
    action: "answer",
    chapter: Number.isFinite(chapter) ? chapter : question.chapter,
    itemNumber: question.questionNumber ?? null,
    isCorrect: typeof isCorrect === "boolean" ? isCorrect : null,
    selectedChoice: typeof selectedChoice === "number" ? selectedChoice : null,
    isPremiumContent: question.premium === true,
    isProUser: isProUser === true,
  });
}

function recordFlashcardView({ flashcard, chapter, isProUser }) {
  if (!flashcard) return;
  enqueueEvent({
    type: "flashcard",
    action: "flip",
    chapter: Number.isFinite(chapter) ? chapter : flashcard.chapter,
    itemNumber: flashcard.cardNumber ?? null,
    isPremiumContent: flashcard.premium === true,
    isProUser: isProUser === true,
  });
}

export function useActivityTracker() {
  return {
    recordQuestionAnswer,
    recordFlashcardView,
    flushPendingEvents,
  };
}
