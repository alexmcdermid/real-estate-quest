import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import admin from "firebase-admin";
import crypto from "crypto";

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
      // Uncomment below when user authentication is enabled:
      // throw new HttpsError("unauthenticated", "User must be authenticated.");
      }

      const chapter = parseInt(data.data?.chapter) || 1;

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
              const sharedDocId =
            questionData.sharedQuestionText._path.segments[1];
              const sharedDocSnap = await db
                  .collection("sharedQuestionText")
                  .doc(sharedDocId)
                  .get();
              if (sharedDocSnap.exists) {
                plainQuestion.sharedQuestionText =
              sharedDocSnap.data().text;
              }
            }

            return plainQuestion;
          }),
      );

      return {questions: questions};
    },
);

export const importQuestionsFromRepo = onSchedule(
    {
      schedule: "0 0 * * *",
      timeZone: "America/Los_Angeles",
      region: "us-west1",
    },
    async (context) => {
      try {
        const token = process.env.GITHUB_TOKEN;
        const username = process.env.GITHUB_USERNAME;
        const repo = process.env.GITHUB_REPO;

        if (!token || !username || !repo) {
          console.error("Missing repo credentials");
          return;
        }

        const repoUrl = `https://api.github.com/repos/${username}/${repo}/contents/questions.js`;

        const response = await fetch(repoUrl, {
          headers: {Authorization: `token ${token}`},
        });

        const data = await response.json();
        if (!data.content) {
          console.error("No content found in the file from GitHub");
          return;
        }

        // Decode the file (GitHub returns the content in base64)
        const jsonStr = Buffer.from(data.content, "base64").toString("utf8");

        // Compute a SHA-256 hash of the JSON string
        const newHash = crypto
            .createHash("sha256")
            .update(jsonStr)
            .digest("hex");

        // Reference to a document where we store the hash of the last updated questions
        const metadataRef = db.collection("metadata").doc("questions");

        const metadataDoc = await metadataRef.get();
        const storedHash = metadataDoc.exists ? metadataDoc.data().hash : null;

        if (storedHash === newHash) {
          console.log("No changes detected; skipping update.");
          return;
        }

        const questions = JSON.parse(jsonStr);
        console.log("Fetched questions from repo:", questions);

        // Clear the entire "questions" collection
        const questionsSnapshot = await db.collection("questions").get();
        const deleteBatch = db.batch();
        questionsSnapshot.docs.forEach((doc) => {
          deleteBatch.delete(doc.ref);
        });
        await deleteBatch.commit();
        console.log("Cleared the questions collection");

        // Add new questions in a batch write
        const addBatch = db.batch();
        questions.forEach((question) => {
          const docRef = db.collection("questions").doc();
          addBatch.set(docRef, question);
        });
        await addBatch.commit();
        console.log("Questions imported to Firestore successfully");

        // Update the stored hash with the new hash
        await metadataRef.set({hash: newHash});
        console.log("Updated metadata with new hash");
      } catch (error) {
        console.error("Error importing questions:", error);
      }
    },
);
