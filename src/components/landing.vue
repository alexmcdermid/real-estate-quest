<template>
  <v-container class="landing-page">
    <!-- Hero Section -->
    <v-row class="hero-section" align="center" justify="center">
      <v-col cols="12" md="9" class="text-center">
        <h1 class="hero-title">Pass Your BC Real Estate Licensing Exam on the First Try!</h1>
        <p class="hero-subtitle">
          Boost your exam readiness with 1000+ curated practice questions and flashcards for the British Columbia real estate licensing course exam. Stay sharp, study smarter, and give yourself the best shot at success.
        </p>
        <v-btn color="primary" large class="cta-btn" @click="navigateToQuestions">
          Try Questions for Free
        </v-btn>
        <v-btn color="secondary" large class="cta-btn" @click="navigateToPro">
          Upgrade to Pro
        </v-btn>
      </v-col>
    </v-row>

    <!-- Features Section -->
    <v-row class="features-section mt-12" align="center" justify="space-around">
      <v-col cols="12" md="4" class="text-center">
        <v-icon color="primary" size="48">mdi-school</v-icon>
        <h3>Practice That Matters</h3>
        <p>
          Sharpen your knowledge with 800+ BC real estate exam practice questions that mirror the structure and topics of the real licensing exam.
        </p>
      </v-col>
      <v-col cols="12" md="4" class="text-center">
        <v-icon color="primary" size="48">mdi-lightbulb-on-outline</v-icon>
        <h3>Focused Learning</h3>
        <p>
          Each question includes helpful explanations that serve as a complete BC real estate exam study guide to reinforce what you've learned.
        </p>
      </v-col>
      <v-col cols="12" md="4" class="text-center">
        <v-icon color="primary" size="48">mdi-trophy-outline</v-icon>
        <h3>Confident Exam Prep</h3>
        <p>
          Our BC real estate licensing resources help you prepare with confidence. Whether you're just starting or reviewing, we've got your back.
        </p>
      </v-col>
    </v-row>

    <!-- Why Choose Us Section -->
    <v-row class="why-choose-us-section mt-12" align="center" justify="center">
      <v-col cols="12" md="8" class="text-center">
        <h2>Why Choose BC Real Estate Quest?</h2>
        <p>
          BC Real Estate Quest is a focused, intuitive platform built specifically for BC Real Estate Licensing Exam preparation. Our exam guide and practice questions help you master the material that matters:
        </p>
      </v-col>
    </v-row>

    <v-row class="why-choose-us-section mt-12" align="center" justify="center">
      <v-col cols="12" md="4" class="text-center">
        <v-card outlined class="why-card">
          <v-card-title>Expert Exam Content</v-card-title>
          <v-card-text>
            Our BC real estate practice questions are written and reviewed by professionals who understand exactly what you need to know to pass the licensing exam.
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4" class="text-center">
        <v-card outlined class="why-card">
          <v-card-title>Complete Study Resources</v-card-title>
          <v-card-text>
            Start with our comprehensive BC real estate exam prep questions and flashcards. More study tools are coming soon to support deeper learning.
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4" class="text-center">
        <v-card outlined class="why-card">
          <v-card-title>Simple & Affordable</v-card-title>
          <v-card-text>
            Access BC real estate exam practice questions for free, upgrade when you're ready for the complete set of licensing course questions.
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Call-to-Action Section -->
    <v-row class="cta-section mt-12" align="center" justify="center">
      <v-col cols="12" md="9" class="text-center">
        <h2>Start Your BC Real Estate Exam Prep Today</h2>
        <p>
          Ready to get serious about passing your British Columbia real estate licensing exam? Try our practice questions for free, or unlock full access to our complete set of questions.
        </p>
        <v-btn color="primary" large class="cta-btn" @click="navigateToQuestions">
          Try Questions for Free
        </v-btn>
        <v-btn color="secondary" large class="cta-btn" @click="navigateToPro">
          Upgrade to Pro
        </v-btn>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { useRouter } from 'vue-router';
const router = useRouter();

function navigateToQuestions() {
  router.push('/questions');
}

function navigateToPro() {
  router.push('/pro');
}
</script>

<style scoped>
.landing-page {
  padding: 32px;
}

.hero-section {
  background: linear-gradient(135deg, #1976D2, #0D47A1);
  color: white;
  padding: 64px 16px;
  border-radius: 8px;
}

.hero-title {
  font-size: 2.5rem;
  font-weight: bold;
  margin-bottom: 16px;
}

.hero-subtitle {
  font-size: 1.25rem;
  margin-bottom: 32px;
}

.cta-btn {
  margin: 8px;
}

.features-section h3 {
  margin-top: 16px;
  font-size: 1.5rem;
  font-weight: bold;
}

.features-section p {
  font-size: 1rem;
  margin-top: 8px;
}

.why-choose-us-section h2 {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 16px;
}

.why-card {
  padding: 16px;
  transition: box-shadow 0.3s ease, transform 0.3s ease;
}

.why-card:hover {
  transform: translateY(-2px);
  box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.2);
}

.why-card .v-card-title {
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: unset !important;
  word-break: break-word;
}

.cta-section h2 {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 16px;
}

.cta-section p {
  font-size: 1.25rem;
  margin-bottom: 32px;
}
</style>