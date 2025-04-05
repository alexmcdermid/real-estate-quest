import { createRouter, createWebHistory } from 'vue-router';
import LandingPage from './components/landing.vue';
import ProfilePage from './components/profile.vue';
import QuestionsPage from './components/questions.vue';

const routes = [
  { path: '/', component: LandingPage },
  { path: '/profile', component: ProfilePage },
  { path: '/questions', component: QuestionsPage },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;