# Security Notice

This repository contains a Firebase/Vue.js application. To run this project:

1. Copy `.env.example` to `.env` and fill in your Firebase configuration values
2. Set up Firebase Functions secrets using the Firebase CLI (see DEV_GUIDE.md)
3. Configure your own Stripe account and update the price IDs directly in the functions code

## Environment Variables Required

See `.env.example` for all required environment variables.

## Google Cloud Secret Manager Secrets Required

The following secrets must be configured in Google Cloud Secret Manager via Firebase Functions:
- `STRIPE_SECRET_KEY_DEV` / `STRIPE_SECRET_KEY_PROD`
- `STRIPE_WEBHOOK_SECRET_DEV` / `STRIPE_WEBHOOK_SECRET_PROD`
- `GITHUB_TOKEN`, `GITHUB_USERNAME`, `GITHUB_REPO`

These are accessed in Firebase Functions using `defineSecret()` and are automatically stored in Google Cloud Secret Manager.

## Privacy Considerations

This application logs user activity for rate limiting and debugging purposes. If you fork this project, ensure you comply with applicable privacy laws and obtain necessary user consents.
