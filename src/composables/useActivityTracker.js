import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";
import { ref } from "vue";

const BUFFER_THRESHOLD = 10;
const FLUSH_INTERVAL_MS = 30000;
const MAX_BUFFER_SIZE = 50;
const VISITOR_ID_STORAGE_KEY = "req:visitor-id";

const pendingEvents = ref([]);
let firstBufferedAt = null;
let flushTimerId = null;
let isFlushing = false;
let lifecycleHandlersAttached = false;

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
  flushTimerId = setTimeout(() => flushPendingEvents(false), FLUSH_INTERVAL_MS);
}

async function flushPendingEvents(force = false) {
  if (isFlushing) return;
  if (pendingEvents.value.length === 0) {
    clearTimeout(flushTimerId);
    flushTimerId = null;
    return;
  }

  const bufferAge = firstBufferedAt ? Date.now() - firstBufferedAt : 0;
  const thresholdReached = pendingEvents.value.length >= BUFFER_THRESHOLD;
  const ageExceeded = bufferAge >= FLUSH_INTERVAL_MS;

  if (!force && !thresholdReached && !ageExceeded) {
    scheduleFlush();
    return;
  }

  const eventsToSend = pendingEvents.value.splice(0, pendingEvents.value.length);
  clearTimeout(flushTimerId);
  flushTimerId = null;
  isFlushing = true;
  firstBufferedAt = null;

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
  if (!firstBufferedAt) firstBufferedAt = Date.now();

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
    selectedChoice: Number.isFinite(selectedChoice) ? selectedChoice : null,
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

function attachLifecycleFlushHandlers() {
  if (lifecycleHandlersAttached) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const flush = () => {
    // Best-effort flush; we intentionally don't await in unload/pagehide.
    flushPendingEvents(true);
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") flush();
  };

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onVisibilityChange);

  lifecycleHandlersAttached = true;
}

export function useActivityTracker() {
  attachLifecycleFlushHandlers();

  return {
    recordQuestionAnswer,
    recordFlashcardView,
    flushPendingEvents,
  };
}
