import {onCall, onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineSecret} from "firebase-functions/params";
import admin from "firebase-admin";
import crypto from "crypto";
import Stripe from "stripe"; // Import Stripe

admin.initializeApp();
const db = admin.firestore();

// Define secrets for Stripe keys
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY"); // Use defineSecret for secure key management
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET"); // Define secret for Stripe webhook secret

// Initialize Stripe (lazy initialization in functions)
let stripe;

/**
 * Safely stringifies an object by omitting circular references.
 *
 * @param {any} obj - The object to stringify.
 * @param {number} [indent=2] - The number of spaces to use for indentation.
 * @return {string} The JSON string representation of the object.
 */
// function safeStringify(obj, indent = 2) {
//   const cache = new Set();
//   return JSON.stringify(obj, (key, value) => {
//     if (typeof value === "object" && value !== null) {
//       if (cache.has(value)) {
//         // Duplicate reference found, discard key
//         return;
//       }
//       cache.add(value);
//     }
//     return value;
//   }, indent);
// }

export const getQuestionsByChapter = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },

    async (request) => {
      let isPremium = false;
      const authContext = request.auth;

      if (authContext && authContext.uid) {
        const proStatus = authContext.token?.proStatus;
        console.log(`User ${authContext.uid} - checking proStatus claim: '${proStatus}'`);

        if (proStatus === "Monthly" || proStatus === "Lifetime") {
          isPremium = true;
          console.log(`User ${authContext.uid} IS premium.`);
        } else {
          isPremium = false;
          console.log(`User ${authContext.uid} is NOT premium.`);
        }
      } else {
        console.log("No authenticated user detected in context.");
        isPremium = false;
      }

      const chapter = parseInt(request.data?.chapter) || 1;
      console.log(`Workspaceing questions for chapter: ${chapter} (Premium: ${isPremium})`);

      let questionsQuery = db.collection("questions")
          .where("chapter", "==", chapter);

      if (!isPremium) {
        console.log("Querying non-premium questions only.");
        questionsQuery = questionsQuery.where("premium", "==", false).orderBy("questionNumber");
      } else {
        console.log("Querying all questions for premium user.");
        questionsQuery = questionsQuery.orderBy("questionNumber");
      }

      const snapshot = await questionsQuery.get();

      if (snapshot.empty) {
        console.log(`No questions found for chapter ${chapter} matching criteria.`);
        return {questions: []};
      }

      console.log(`Found ${snapshot.docs.length} questions.`);
      const questions = snapshot.docs.map((doc) => {
        const questionData = doc.data();
        questionData.id = doc.id;
        return questionData;
      });

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

        const chapters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
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

export const createCheckoutSession = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
      secrets: [stripeSecretKey],
    },
    async (request) => {
      let userId;
      const authContext = request.auth;

      if (authContext && authContext.uid) {
        userId = authContext.uid;
      } else {
        console.log("No authenticated user detected.");
        throw new Error("Authentication required");
      }

      const {priceId, successUrl, cancelUrl} = request.data;

      // Initialize Stripe with the secret key
      stripe = stripe || new Stripe(stripeSecretKey.value());

      console.log("Creating Stripe Checkout session with:", {
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${successUrl}&sessionId={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        metadata: {
          userId,
        },
      });

      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "subscription",
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          success_url: `${successUrl}&sessionId={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl,
          metadata: {
            userId,
          },
        });

        // Return the session URL instead of the session ID
        return {url: session.url};
      } catch (error) {
        console.error("Error creating Stripe Checkout session:", error);
        throw new Error("Failed to create Stripe Checkout session");
      }
    },
);

export const handleStripeWebhook = onRequest(
    {
      region: "us-west1",
      enforceAppCheck: true,
      secrets: [stripeSecretKey, stripeWebhookSecret],
    },
    async (req, res) => {
      // Initialize Stripe with the secret key
      stripe = stripe || new Stripe(stripeSecretKey.value());

      const sig = req.headers["stripe-signature"];

      console.log("Stripe Webhook Details:", {
        rawBody: req.rawBody.toString(),
        signature: sig,
        stripeSecretKey: stripeSecretKey.value(),
        stripeWebhookSecret: stripeWebhookSecret.value(),
        eventType: req.body.type,
        eventData: req.body.data,
      });
      let event;

      // Use rawBody instead of req.body
      try {
        if (!req.rawBody) {
          throw new Error("Raw body is not available. Ensure Firebase Functions is configured correctly.");
        }

        event = stripe.webhooks.constructEvent(req.rawBody, sig, stripeWebhookSecret.value());
      } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      // Handle the event
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const userId = session.metadata.userId;

          if (!userId) {
            console.error("Missing userId in session metadata.");
            return res.status(400).send("Invalid session metadata.");
          }

          try {
            const subscriptionType = session.metadata.subscriptionType || "Monthly";
            console.log(`Subscription type for user ${userId}: ${subscriptionType}`);

            await db.collection("members").doc(userId).set(
                {
                  member: true,
                  subscriptionId: session.subscription,
                  status: "active",
                  subscriptionType,
                },
                {merge: true},
            );

            await admin.auth().setCustomUserClaims(userId, {member: true, proStatus: subscriptionType});
            console.log(`Subscription activated for user: ${userId} with proStatus: ${subscriptionType}`);
          } catch (error) {
            console.error("Error handling checkout.session.completed:", error);
            return res.status(500).send("Internal Server Error");
          }

          break;
        }
        case "customer.subscription.deleted":
          case "invoice.payment_failed": {
            const subscription = event.data.object;
            const userId = subscription.metadata.userId;
  
            if (!userId) {
              console.error("Missing userId in subscription metadata.");
              return res.status(400).send("Invalid subscription metadata.");
            }
  
            try {
              await db.collection("members").doc(userId).set(
                  {
                    member: false,
                    status: "inactive",
                    subscriptionType: null,
                  },
                  {merge: true},
              );
  
              await admin.auth().setCustomUserClaims(userId, {member: false, proStatus: null});
              console.log(`Subscription marked inactive for user: ${userId}`);
            } catch (error) {
              console.error("Error handling subscription deletion or payment failure:", error);
              return res.status(500).send("Internal Server Error");
            }
  
            break;
          }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.status(200).send("Webhook received");
    },
);
