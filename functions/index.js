import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import admin from "firebase-admin";
import crypto from "crypto";

admin.initializeApp();
const db = admin.firestore();

/**
 * Safely stringifies an object by omitting circular references.
 *
 * @param {any} obj - The object to stringify.
 * @param {number} [indent=2] - The number of spaces to use for indentation.
 * @return {string} The JSON string representation of the object.
 */
function safeStringify(obj, indent = 2) {
  const cache = new Set();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (cache.has(value)) {
        // Duplicate reference found, discard key
        return;
      }
      cache.add(value);
    }
    return value;
  }, indent);
}

export const getQuestionsByChapter = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },
    async (data, context) => {
      let isPremium = false;
      console.log("Received context:", safeStringify(context));
      console.log("Received data:", safeStringify(data));

      // If context.auth is not set, try manually verifying idToken passed in data.data
      if (!context.auth && data.data && data.data.idToken) {
        try {
          const decodedToken = await admin.auth().verifyIdToken(data.data.idToken);
          context.auth = decodedToken;
          console.log("Manually verified token, updated context.auth:", safeStringify(context.auth));
        } catch (error) {
          console.error("Error verifying manual token:", error);
        }
      }

      if (context.auth && context.auth.uid) {
        // Check if the authenticated user is a premium member.
        const memberSnap = await db.collection("members").doc(context.auth.uid).get();
        console.log("Member snapshot:", memberSnap);
        console.log("Is premium:", memberSnap.exists && memberSnap.data().member === true);
        if (memberSnap.exists && memberSnap.data().member === true) {
          isPremium = true;
        }
      } else {
        console.log("No authenticated user detected.");
      }

      const chapter = parseInt(data.data?.chapter) || 1;
      console.log("chapter" + chapter);

      let questionsQuery = db.collection("questions")
          .where("chapter", "==", chapter);

      if (!isPremium) {
        questionsQuery = questionsQuery.where("premium", "==", false).orderBy("questionNumber");
      } else {
        questionsQuery = questionsQuery.orderBy("questionNumber");
      }

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

        const chapters = [1, 2];
        const metadataRef = db.collection("metadata").doc("questions");

        // Get existing metadata document for hashes
        const metadataDoc = await metadataRef.get();
        const metadata = metadataDoc.exists ? metadataDoc.data() : {};

        for (const chapter of chapters) {
          const repoUrl = `https://api.github.com/repos/${username}/${repo}/contents/${chapter}.js`;

          const response = await fetch(repoUrl, {
            headers: {Authorization: `token ${token}`},
          });
          const data = await response.json();
          if (!data.content) {
            console.error(`No content found in the file for chapter ${chapter} from GitHub`);
            continue;
          }

          // Decode the file content (GitHub returns the content in base64)
          const jsonStr = Buffer.from(data.content, "base64").toString("utf8");

          // Compute a SHA-256 hash of the JSON string
          const newHash = crypto.createHash("sha256").update(jsonStr).digest("hex");
          const storedHash = metadata[`hash_${chapter}`] || null;
          if (storedHash === newHash) {
            console.log(`No changes detected for chapter ${chapter}; skipping update.`);
            continue;
          }

          // Parse the questions (assume the file is valid JSON array)
          const questions = JSON.parse(jsonStr);
          console.log(`Fetched questions for chapter ${chapter} from repo:`, questions);

          // Delete all existing questions for this chapter
          const chapterQuerySnapshot = await db
              .collection("questions")
              .where("chapter", "==", chapter)
              .get();
          const deleteBatch = db.batch();
          chapterQuerySnapshot.docs.forEach((doc) => {
            deleteBatch.delete(doc.ref);
          });
          await deleteBatch.commit();
          console.log(`Cleared the questions for chapter ${chapter}`);

          // Add new questions in a batch write (ensure each question has the correct chapter field)
          const addBatch = db.batch();
          questions.forEach((question) => {
            question.chapter = chapter;
            const docRef = db.collection("questions").doc();
            addBatch.set(docRef, question);
          });
          await addBatch.commit();
          console.log(`Questions for chapter ${chapter} imported to Firestore successfully`);

          // Update the stored hash for this chapter in metadata
          metadata[`hash_${chapter}`] = newHash;
        }

        // Save updated metadata (all chapter hashes)
        await metadataRef.set(metadata);
        console.log("Updated metadata hashes for chapters:", chapters);
      } catch (error) {
        console.error("Error importing questions:", error);
      }
    },
);
