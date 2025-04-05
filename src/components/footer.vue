<template>
  <v-footer class="footer">
    <v-container>
      <v-row justify="space-between">
        <!-- Copyright -->
        <v-col cols="12" md="6" class="text-md-start text-center">
          <span class="copyright">
            Copyright © 2025 Real Estate Quest. All rights reserved.
          </span>
        </v-col>

        <!-- Legal Links -->
        <v-col cols="12" md="6" class="legal-links text-md-end text-center">
          <a href="/privacy-policy" class="footer-link">Privacy Policy</a>
          <span>|</span>
          <a href="/terms-of-service" class="footer-link">Terms of Service</a>
        </v-col>


      </v-row>
    </v-container>
  </v-footer>
</template>

<script setup>
</script>

<style scoped>
.footer {
  background-color: #0D3B66;
  color: white;
  padding: 16px 0;
  font-size: 0.875rem;
}

.footer-link {
  color: white;
  text-decoration: none;
  margin: 0 8px;
}

.footer-link:hover {
  text-decoration: underline;
  color: #FFD700;
}

.copyright {
  font-size: 0.875rem;
}
</style>
