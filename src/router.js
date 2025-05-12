import { createRouter, createWebHistory } from 'vue-router';
import LandingPage from './components/landing.vue';
import ProfilePage from './components/profile.vue';
import QuestionsPage from './components/questions.vue';
import FlashCardPage from './components/flashcards.vue';
import PrivacyPolicy from './components/privacyPolicy.vue';
import TermsOfService from './components/ToS.vue';

const routes = [
  { path: '/', component: LandingPage },
  { path: '/pro', component: ProfilePage },
  { path: '/questions', component: QuestionsPage },
  { path: '/flashcards', component: FlashCardPage },
  { path: '/privacy-policy', component: PrivacyPolicy },
  { path: '/terms-of-service', component: TermsOfService },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;