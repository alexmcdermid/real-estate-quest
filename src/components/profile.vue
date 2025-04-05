<template>
  <v-container>
    <h1>Profile</h1>
    <p>Manage your subscription and account details here.</p>
    <v-card>
      <v-card-title>Subscription</v-card-title>
      <v-card-text>
        <p>Status: <strong>{{ subscriptionStatus }}</strong></p>
        <v-btn color="primary" @click="manageSubscription">Manage Subscription</v-btn>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup>
import { ref } from 'vue';

const subscriptionStatus = ref('Active'); // Replace with actual subscription status logic

function manageSubscription() {
  console.log('Redirect to subscription management');
}
</script>