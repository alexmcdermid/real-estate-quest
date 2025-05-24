import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onCall, onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineSecret} from "firebase-functions/params";
import admin from "firebase-admin";
import crypto from "crypto";
import Stripe from "stripe"; // Import Stripe

admin.initializeApp();
const db = admin.firestore();

const stripeSecretKeyDev = defineSecret("STRIPE_SECRET_KEY_DEV");
const stripeWebhookSecretDev = defineSecret("STRIPE_WEBHOOK_SECRET_DEV");
const stripeSecretKeyProd = defineSecret("STRIPE_SECRET_KEY_PROD");
const stripeWebhookSecretProd = defineSecret("STRIPE_WEBHOOK_SECRET_PROD");

const githubToken = defineSecret("GITHUB_TOKEN");
const githubUsername = defineSecret("GITHUB_USERNAME");
const githubRepo = defineSecret("GITHUB_REPO");

const isProduction = process.env.NODE_ENV === "production";

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
      console.log("is prod", isProduction);
      let isPremium = false;
      const authContext = request.auth;

      if (authContext && authContext.uid) {
        const proStatus = authContext.token?.proStatus;
        const member = authContext.token?.member;
        console.log(`User ${authContext.uid} - checking member claim: '${member}' - checking proStatus claim: '${proStatus}'`);

        if (member === true && (proStatus === "Monthly" || proStatus === "Lifetime")) {
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

export const getFlashCardsByChapter = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
    },

    async (request) => {
      console.log("is prod", isProduction);
      let isPremium = false;
      const authContext = request.auth;

      if (authContext && authContext.uid) {
        const proStatus = authContext.token?.proStatus;
        const member = authContext.token?.member;
        console.log(`User ${authContext.uid} - checking member claim: '${member}' - checking proStatus claim: '${proStatus}'`);

        if (member === true && (proStatus === "Monthly" || proStatus === "Lifetime")) {
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
      console.log(`Fetching flashcards for chapter: ${chapter} (Premium: ${isPremium})`);

      let flashcardsQuery = db.collection("flashcards")
          .where("chapter", "==", chapter);

      if (!isPremium) {
        console.log("Querying non-premium flashcards only.");
        flashcardsQuery = flashcardsQuery.where("premium", "==", false).orderBy("cardNumber");
      } else {
        console.log("Querying all flashcards for premium user.");
        flashcardsQuery = flashcardsQuery.orderBy("cardNumber");
      }

      const snapshot = await flashcardsQuery.get();

      if (snapshot.empty) {
        console.log(`No flashcards found for chapter ${chapter} matching criteria.`);
        return {flashcards: []};
      }

      console.log(`Found ${snapshot.docs.length} flashcards.`);
      const flashcards = snapshot.docs.map((doc) => {
        const flashcardData = doc.data();
        flashcardData.id = doc.id;
        return flashcardData;
      });

      return {flashcards: flashcards};
    },
);

export const importFlashCardsFromRepo = onSchedule(
    {
      schedule: "0 1 * * *", // Run at 1:00 AM daily (1 hour after questions import)
      timeZone: "America/Los_Angeles",
      region: "us-west1",
      secrets: [githubToken, githubUsername, githubRepo],
    },
    async () => {
      try {
        const token = githubToken.value();
        const username = githubUsername.value();
        const repo = githubRepo.value();

        if (!token || !username || !repo) {
          console.error("Missing GitHub credentials");
          return;
        }

        const metadataRef = db.collection("metadata").doc("flashcards");

        // Get existing metadata document for hash
        const metadataDoc = await metadataRef.get();
        const metadata = metadataDoc.exists ? metadataDoc.data() : {};

        // The file path for flashcards in the repo
        const repoUrl = `https://api.github.com/repos/${username}/${repo}/contents/flashcards.js`;

        const response = await fetch(repoUrl, {
          headers: {Authorization: `token ${token}`},
        });
        const data = await response.json();

        if (!data.content) {
          console.error("No content found in the flashcards.js file from GitHub");
          return;
        }

        // Decode the file content (GitHub returns the content in base64)
        const jsonStr = Buffer.from(data.content, "base64").toString("utf8");

        // Compute a SHA-256 hash of the JSON string
        const newHash = crypto.createHash("sha256").update(jsonStr).digest("hex");
        const storedHash = metadata.hash || null;

        if (storedHash === newHash) {
          console.log("No changes detected for flashcards; skipping update.");
          return;
        }

        // Parse the flashcards (json)
        const flashcards = JSON.parse(jsonStr);
        console.log(`Fetched ${flashcards.length} flashcards from repo`);

        // Delete all existing flashcards
        const flashcardsQuerySnapshot = await db.collection("flashcards").get();
        const deleteBatch = db.batch();
        flashcardsQuerySnapshot.docs.forEach((doc) => {
          deleteBatch.delete(doc.ref);
        });
        await deleteBatch.commit();
        console.log("Cleared all existing flashcards");

        // Add new flashcards in batches (max 500 batch size)
        const batchSize = 400;
        let batchCount = 0;

        for (let i = 0; i < flashcards.length; i += batchSize) {
          const batch = db.batch();
          const batchItems = flashcards.slice(i, i + batchSize);

          batchItems.forEach((flashcard) => {
            const docRef = db.collection("flashcards").doc();
            batch.set(docRef, flashcard);
          });

          await batch.commit();
          batchCount++;
          console.log(`Imported batch ${batchCount} (${batchItems.length} flashcards)`);
        }

        // Update the stored hash in metadata
        await metadataRef.set({hash: newHash});
        console.log(`Flashcards imported successfully. Updated metadata hash.`);
      } catch (error) {
        console.error("Error importing flashcards:", error);
      }
    },
);

export const importQuestionsFromRepo = onSchedule(
    {
      schedule: "0 0 * * *",
      timeZone: "America/Los_Angeles",
      region: "us-west1",
      secrets: [githubToken, githubUsername, githubRepo],
    },
    async () => {
      try {
        const token = githubToken.value();
        const username = githubUsername.value();
        const repo = githubRepo.value();

        if (!token || !username || !repo) {
          console.error("Missing GitHub credentials");
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

          // Parse the questions (json)
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

export const expireCanceledMemberships = onSchedule(
    {
      schedule: "0 0 * * *",
      timeZone: "America/Los_Angeles",
      region: "us-west1",
    },
    async () => {
      const now = admin.firestore.Timestamp.now();

      const snapshot = await db.collection("members")
          .where("cancelAt", "<=", now)
          .where("subscriptionType", "==", "Monthly")
          .get();

      if (snapshot.empty) {
        console.log("No memberships to expire.");
        return;
      }

      const batch = db.batch();

      for (const doc of snapshot.docs) {
        const userId = doc.id;

        batch.set(doc.ref, {
          member: false,
          subscriptionType: null,
          cancelAt: admin.firestore.FieldValue.delete(),
        }, {merge: true});

        await admin.auth().setCustomUserClaims(userId, {member: false, proStatus: null});
        console.log(`Expired membership for user: ${userId}`);
      }

      await batch.commit();
    },
);

export const createCheckoutSession = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
      secrets: [stripeSecretKeyDev, stripeSecretKeyProd],
    },
    async (request) => {
      console.log("is prod", isProduction);
      const stripeSecretKey = isProduction ? stripeSecretKeyProd : stripeSecretKeyDev;
      const authContext = request.auth;

      if (!authContext || !authContext.uid) {
        console.error("No authenticated user detected.");
        throw new Error("Authentication required");
      }

      const userId = authContext.uid;
      const {type, successUrl, cancelUrl} = request.data;

      // Initialize Stripe with the secret key
      stripe = stripe || new Stripe(stripeSecretKey.value());

      try {
      // Determine the mode based on the priceId
        const mode = type === "lifetime" ? "payment" : "subscription";
        const subType = type === "lifetime" ? "Lifetime" : "Monthly";

        let priceId;

        if (isProduction) {
          if (type === "lifetime") {
            priceId = "price_1RCnE0D0qfc5FtYvebtSnn2E"; // prod lifetime
          } else {
            priceId = "price_1RCq08D0qfc5FtYvyVaSkEO2"; // prod monthly
          }
        } else {
          if (type === "lifetime") {
            priceId = "price_1RAZgSDHHGtkTOPhyhqr29ai"; // dev lifetime
          } else {
            priceId = "price_1RCq0dDHHGtkTOPht9gQjVxa"; // dev monthly
          }
        }

        console.log("Creating Stripe Checkout session with:", {
          payment_method_types: ["card"],
          mode,
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
            subType,
          },
        });

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode,
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
            subType,
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
      secrets: [stripeSecretKeyDev, stripeSecretKeyProd, stripeWebhookSecretDev, stripeWebhookSecretProd],
    },
    async (req, res) => {
      console.log("is prod", isProduction);
      const stripeSecretKey = isProduction ? stripeSecretKeyProd : stripeSecretKeyDev;
      const stripeWebhookSecret = isProduction ? stripeWebhookSecretProd : stripeWebhookSecretDev;
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
          const userId = session.metadata?.userId;
          const subscriptionType = session.metadata?.subType;

          console.log("Processing checkout.session.completed for session:", session.id);
          console.log("Session metadata:", session.metadata);

          if (!userId) {
            console.warn("Missing userId. Cannot process session.");
            break;
          }

          const userDocRef = db.collection("members").doc(userId);
          const customerId = session.customer;
          const subscriptionId = session.subscription;

          if (subscriptionType === "Monthly") {
            try {
              console.log(`Handling recurring subscription setup for user: ${userId}`);

              await userDocRef.set(
                  {
                    member: true,
                    subscriptionId,
                    customerId,
                    subscriptionType,
                  },
                  {merge: true},
              );

              await admin.auth().setCustomUserClaims(userId, {
                member: true,
                proStatus: subscriptionType,
              });

              console.log(`Subscription activated for user: ${userId} with proStatus: ${subscriptionType}`);
            } catch (error) {
              console.error("Error handling subscription activation:", error);
              return res.status(500).send("Internal Server Error");
            }
          } else if (subscriptionType === "Lifetime") {
            console.log(`Handling one-time payment for Lifetime upgrade for user: ${userId}`);

            try {
              const existingDoc = await userDocRef.get();
              const userData = existingDoc.exists ? existingDoc.data() : null;

              if (userData?.subscriptionId) {
                try {
                  await stripe.subscriptions.cancel(userData.subscriptionId);
                  console.log(`Cancelled existing subscription for user: ${userId}`);
                } catch (cancelErr) {
                  console.warn(`Failed to cancel sub ${userData.subscriptionId} for user ${userId}:`, cancelErr);
                }
              }

              await userDocRef.set(
                  {
                    customerId,
                    subscriptionId: admin.firestore.FieldValue.delete(),
                    subscriptionType: "Lifetime",
                    cancelAt: admin.firestore.FieldValue.delete(),
                    member: true,
                  },
                  {merge: true},
              );

              try {
                const user = await admin.auth().getUser(userId);
                const existingClaims = user.customClaims || {};
                delete existingClaims.expires;

                await admin.auth().setCustomUserClaims(userId, {
                  ...existingClaims,
                  member: true,
                  proStatus: "Lifetime",
                });

                console.log(`User ${userId} upgraded to Lifetime successfully.`);
              } catch (authErr) {
                console.error(`Failed to update custom claims for user ${userId}:`, authErr);
              }
            } catch (err) {
              console.error("Failed to handle lifetime upgrade:", err);
              return res.status(500).send("Internal Server Error");
            }
          } else {
            console.warn(`Unknown subscriptionType '${subscriptionType}' for user: ${userId}`);
          }

          break;
        }
        case "customer.subscription.updated": {
          const subscription = event.data.object;
          const customerId = subscription.customer;
          const cancelAt = subscription.cancel_at_period_end ? subscription.cancel_at : null;

          const memberSnap = await db.collection("members")
              .where("customerId", "==", customerId)
              .limit(1)
              .get();

          if (memberSnap.empty) {
            console.warn(`No user found in Firestore for customerId: ${customerId}`);
            break;
          }

          const userId = memberSnap.docs[0].id;

          try {
            if (cancelAt) {
              // user scheduled a cancellation
              const cancelDate = new Date(cancelAt * 1000);
              console.log(`User ${userId} scheduled cancel at: ${cancelDate.toISOString()}`);

              await db.collection("members").doc(userId).set(
                  {
                    cancelAt: admin.firestore.Timestamp.fromDate(cancelDate),
                  },
                  {merge: true},
              );

              const user = await admin.auth().getUser(userId);
              const existingClaims = user.customClaims || {};

              await admin.auth().setCustomUserClaims(userId, {
                ...existingClaims,
                member: true,
                proStatus: "Monthly",
                expires: cancelAt,
              });
            } else {
              // user resumed subscription — remove scheduled cancel
              console.log(`User ${userId} resumed subscription. Clearing cancelAt.`);

              await db.collection("members").doc(userId).set(
                  {
                    cancelAt: admin.firestore.FieldValue.delete(),
                  },
                  {merge: true},
              );

              const user = await admin.auth().getUser(userId);
              const existingClaims = user.customClaims || {};
              delete existingClaims.expires;

              await admin.auth().setCustomUserClaims(userId, {
                ...existingClaims,
                member: true,
                proStatus: "Monthly",
              });
            }
          } catch (error) {
            console.error("Failed to update subscription state:", error);
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

export const manageSubscription = onCall(
    {
      region: "us-west1",
      enforceAppCheck: true,
      secrets: [stripeSecretKeyDev, stripeSecretKeyProd],
    },
    async (request) => {
      const authContext = request.auth;

      if (!authContext || !authContext.uid) {
        console.error("No authenticated user detected.");
        throw new Error("Authentication required");
      }

      console.log("is prod", isProduction);

      const stripeSecretKey = isProduction ? stripeSecretKeyProd : stripeSecretKeyDev;

      stripe = stripe || new Stripe(stripeSecretKey.value());

      const userId = authContext.uid;

      try {
      // Fetch the customer ID from Firestore
        const userDoc = await db.collection("members").doc(userId).get();
        if (!userDoc.exists || !userDoc.data().customerId) {
          console.error(`No customer ID found for user: ${userId}`);
          throw new Error("Customer not found");
        }

        const customerId = userDoc.data().customerId;

        // Create a billing portal session
        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: request.data.returnUrl,
        });

        return {url: session.url};
      } catch (error) {
        console.error("Error creating billing portal session:", error);
        throw new Error("Failed to create billing portal session");
      }
    },
);

export const syncClaimsOnManualUpdate = onDocumentUpdated(
    {
      document: "members/{userId}",
      region: "us-west1",
    },
    async (event) => {
      const userId = event.params.userId;

      const beforeSnap = event.data?.before;
      const afterSnap = event.data?.after;

      if (!beforeSnap || !afterSnap) {
        console.log(`Snapshot data missing for event on user: ${userId}. Skipping.`);
        return null;
      }

      const beforeData = beforeSnap.data();
      const afterData = afterSnap.data();

      if (beforeData?.manualClaimSyncRequired !== true && afterData?.manualClaimSyncRequired === true) {
        console.log(`Manual claim sync triggered for user: ${userId}`);

        const desiredClaims = {
          member: afterData.member === true,
          proStatus: afterData.subscriptionType || null,
          expires: afterData.cancelAt ? afterData.cancelAt.seconds : null,
        };

        try {
          const user = await admin.auth().getUser(userId);
          const currentClaims = user.customClaims || {};

          const currentClaimsToCompare = {
            member: currentClaims.member === true,
            proStatus: currentClaims.proStatus || null,
            expires: currentClaims.expires || null,
          };

          const needsUpdate = JSON.stringify(desiredClaims) !== JSON.stringify(currentClaimsToCompare);

          if (needsUpdate) {
            console.log(`Updating claims for user ${userId}:`, desiredClaims);
            await admin.auth().setCustomUserClaims(userId, desiredClaims);
          } else {
            console.log(`Claims for user ${userId} are already up-to-date.`);
          }

          await afterSnap.ref.update({
            manualClaimSyncRequired: false,
          });

          console.log(`Successfully processed manual claim sync and reset flag for user: ${userId}`);
        } catch (error) {
          console.error(`Error updating claims or resetting flag for user ${userId}:`, error);
        }
      }
      return null;
    });
