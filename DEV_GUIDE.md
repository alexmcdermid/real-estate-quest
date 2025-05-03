# Developer Guide

This document contains setup, deployment, and testing instructions for working on the Real Estate Quest project.

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run dev
```

### Compiles and minifies for production - uses .env.production by default
```
npm run build
firebase deploy --only hosting
```

### Lints and fixes files
```
npm run lint
```

### firebase functions deploy
```
firebase deploy --only functions
npm run lint:fix
```

### firebase deploy fe
```
firebase deploy --only functions -P dev
firebase deploy --only functions -P prod

```

### Stripe testing
See the [Stripe Testing Documentation](https://docs.stripe.com/testing) for test card numbers and scenarios.

To set Stripe secrets for local development and deployment, use the Firebase CLI with defineSecret:
```
firebase functions:secrets:set STRIPE_SECRET_KEY_DEV
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET_DEV
```

You can view and manage secrets in the Firebase Console under Functions > Secrets.

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
