# real-estate-quest

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run dev
```

### Compiles and minifies for production
```
npm run build
firebase deploy --only hosting
```

### Lints and fixes files
```
npm run lint
```

### env
```
firebase use dev
firebase use prod
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

### stripe testing
```
https://docs.stripe.com/testing
firebase functions:config:set stripe.secret="your_stripe_secret_key"
firebase functions:config:set stripe.webhook_secret="your_stripe_webhook_secret"

```

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
