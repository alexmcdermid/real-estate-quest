import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../config/firebaseConfig";

export async function fetchNextQuestion(chapter = 1) {
  const functions = getFunctions(firebaseApp, "us-west1");
  const getSingleQuestionCallable = httpsCallable(functions, "getSingleQuestion");
  try {
    const result = await getSingleQuestionCallable({ chapter });
    return result.data.question;
  } catch (error) {
    console.error("Error fetching question:", error);
    throw error;
  }
}
