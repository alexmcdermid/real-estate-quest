# Real Estate Quest – Project Overview

Real Estate Quest is a web application designed to help users prepare for the British Columbia real estate licensing exam. The project leverages a modern tech stack to provide a seamless and secure experience for users.

## Tech Stack
- **Vue.js**: Frontend framework for building a responsive and interactive user interface.
- **Firebase Authentication**: Handles user sign-up, login, and authentication flows.
- **Firebase Functions**: Serverless backend for handling business logic, such as user management and payment processing.
- **Stripe**: Integrated for secure payment processing and subscription management.

## Key Features
- **User Authentication**: Users can register and log in using Firebase Auth, supporting passwordless login methods (Google OAuth and email link sign-in).
- **Exam Preparation**: Access to a curated set of practice questions for the BC real estate exam.
- **Membership & Payments**: Paid membership is managed via Stripe Checkout. Users can upgrade to access premium content.
- **Serverless Backend**: Firebase Functions handle sensitive operations, such as verifying payments and managing user data securely.

## Architecture Overview
- The frontend (Vue.js) communicates with Firebase for authentication and calls Firebase Functions for backend operations (such as fetching questions, managing memberships, and starting Stripe checkout sessions).
- Stripe is used for payment processing. After a successful payment, a secure Stripe webhook (handleStripeWebhook) is triggered on the backend to update the user's membership status and custom claims in Firebase Auth and Firestore. This ensures that upgrades and access are only granted after verified payment events from Stripe, not just after a redirect.
- All sensitive keys (Stripe secret, webhook secret, GitHub credentials) are managed using Firebase's defineSecret and the Firebase CLI secrets system, and are never exposed in the frontend code.
- Authentication supports passwordless login via Google OAuth and email link sign-in. User roles and access are managed via custom claims, which are kept in sync with Firestore membership data.

## Key Cloud Functions

The backend logic is implemented using Firebase Cloud Functions. Here are the main functions and their roles:

- **getQuestionsByChapter**: Callable function that returns a list of questions for a given chapter. It checks the user's membership status to determine if premium questions should be included.
- **importQuestionsFromRepo**: Scheduled function that imports and updates question data from a GitHub repository into Firestore, ensuring the latest content is available.
- **expireCanceledMemberships**: Scheduled function that checks for memberships scheduled to expire and updates user status and claims accordingly.
- **createCheckoutSession**: Callable function that creates a Stripe Checkout session for either a monthly subscription or a lifetime membership, returning a secure payment URL.
- **handleStripeWebhook**: HTTP function that processes Stripe webhook events (e.g., payment completed, subscription updated) to update user membership status and custom claims in Firebase Auth and Firestore.
- **manageSubscription**: Callable function that creates a Stripe Billing Portal session, allowing users to manage their subscriptions (e.g., update payment method, cancel subscription).
- **syncClaimsOnManualUpdate**: Firestore trigger that synchronizes Firebase Auth custom claims with Firestore membership data when a manual sync is requested.

These functions work together to provide secure authentication, membership management, payment processing, and content delivery for the application.

## Frontend Structure & Key Components

The frontend is built with Vue.js and organized for clarity and scalability:

- **src/components/**: Contains reusable UI components such as `loginModal.vue`, `profile.vue`, `questionCard.vue`, and more.
- **src/composables/**: Houses composable logic for authentication (`useAuth.js`), membership (`useMembership.js`), questions (`useQuestion.js`), and UI state.
- **src/models/**: Defines data models like `Members.js` and `Question.js` for type safety and consistency.
- **src/config/**: Includes Firebase configuration and app constants.
- **src/constants/**: Stores static data such as chapter lists.
- **src/router.js**: Manages client-side routing.

## Authentication & Authorization Flow

- **Firebase Auth** is used for user registration and login, supporting:
  - Passwordless login via Google OAuth
  - Passwordless login via email link sign-in
- On login, custom claims (`member`, `proStatus`) are set via backend functions to control access to premium content.
- Claims are kept in sync with Firestore membership data primarily via Stripe webhook callbacks, which update user claims and membership status after payment events or schedules canclellation dates.
- Claim updates for canceled subscriptions are managed by a scheduled function (`expireCanceledMemberships`). The `syncClaimsOnManualUpdate` function is used only for manual claim synchronization in rare cases.
- The frontend checks these claims to determine which features or questions a user can access.

## Database Structure

- **questions**: Stores all exam questions, each with fields like `chapter`, `questionNumber`, `premium`, and the question content.
- **members**: Stores user membership data, including `member` status, `subscriptionType`, `customerId`, and `cancelAt`.
- **metadata**: Used for tracking import hashes and other system-level data.

## Deployment & Environment

- **Frontend**: Built with Vite and deployed to Firebase Hosting.
- **Backend**: Firebase Functions are deployed via the Firebase CLI.
- **Secrets**: Stripe and GitHub credentials are managed using Firebase's defineSecret and the Firebase CLI secrets system, which stores secrets in Google Cloud Secret Manager (not function config or legacy function secrets).
- **Environments**: Separate dev and prod environments are supported via `.env` files and Firebase project aliases.