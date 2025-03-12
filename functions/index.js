import {onCall, HttpsError} from "firebase-functions/v2/https";
import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

export const getQuestionsByChapter = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (data, context) => {
      if (!context.auth) {
        console.log("Unauthenticated call; proceeding without user context.");
        // when users are setup uncomment below
        // throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const chapter = parseInt(data.chapter) || 1;

      const questionsQuery = db
          .collection("questions")
          .where("chapter", "==", chapter)
          .orderBy("questionNumber");

      const snapshot = await questionsQuery.get();
      if (snapshot.empty) {
        throw new HttpsError("not-found", "No question found");
      }

      const questions = await Promise.all(
          snapshot.docs.map(async (doc) => {
            const questionData = doc.data();
            const plainQuestion = JSON.parse(JSON.stringify(questionData));
            plainQuestion.id = doc.id;

            // If sharedQuestionText is provided, fetch its document data.
            if (
              questionData.sharedQuestionText &&
            questionData.sharedQuestionText._path &&
            Array.isArray(questionData.sharedQuestionText._path.segments) &&
            questionData.sharedQuestionText._path.segments.length >= 2
            ) {
              const sharedDocId = questionData.sharedQuestionText._path.segments[1];
              const sharedDocSnap = await db
                  .collection("sharedQuestionText")
                  .doc(sharedDocId)
                  .get();
              if (sharedDocSnap.exists) {
                plainQuestion.sharedQuestionText = sharedDocSnap.data().text;
              }
            }

            return plainQuestion;
          }),
      );

      return {questions: questions};
    },
);
