import {onCall, HttpsError} from "firebase-functions/v2/https";
import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

export const getSingleQuestion = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (data, context) => {
      if (!context.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const chapter = parseInt(data.chapter) || 1;

      const questionsQuery = db
          .collection("questions")
          .where("chapter", "==", chapter)
          .orderBy("questionNumber")
          .limit(1);

      const snapshot = await questionsQuery.get();
      if (snapshot.empty) {
        throw new HttpsError("not-found", "No question found");
      }

      const doc = snapshot.docs[0];
      const question = doc.data();
      const plainQuestion = JSON.parse(JSON.stringify(question));
      plainQuestion.id = doc.id;
      return {question: plainQuestion};
    },
);
