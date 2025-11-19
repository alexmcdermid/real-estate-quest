import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './composables/useAuth';
import LandingPage from './components/landing.vue';
import ProfilePage from './components/profile.vue';
import QuestionsPage from './components/questions.vue';
import FlashCardPage from './components/flashcards.vue';
import PrivacyPolicy from './components/privacyPolicy.vue';
import TermsOfService from './components/ToS.vue';
import AdminPage from './components/admin.vue';

const routes = [
  { 
    path: '/', 
    component: LandingPage,
    meta: { 
      title: 'Real Estate Quest - BC Licensing Exam Preparation',
      description: 'BC Real Estate Quest: Your guide for BC real estate exam prep. Access 1000+ practice questions and flashcards to help you pass the British Columbia real estate licensing course exam on your first try.'
    }
  },
  { 
    path: '/admin', 
    component: AdminPage,
    meta: { 
      title: 'Admin Dashboard - Real Estate Quest',
      description: 'Administrative dashboard for system management.',
      noindex: true,
      requiresAdmin: true
    }
  },
  { 
    path: '/pro', 
    component: ProfilePage,
    meta: { 
      title: 'Membership - Real Estate Quest',
      description: 'Upgrade to Pro for unlimited access to BC real estate exam questions and flashcards.',
      noindex: true // Prevent indexing of payment/subscription pages
    }
  },
  { 
    path: '/questions', 
    component: QuestionsPage,
    meta: { 
      title: 'Questions - Real Estate Quest',
      description: 'Test your knowledge with 1000+ BC real estate licensing exam practice questions.'
    }
  },
  { 
    path: '/flashcards', 
    component: FlashCardPage,
    meta: { 
      title: 'Flashcards - Real Estate Quest',
      description: 'Study with interactive flashcards for the BC real estate licensing exam.'
    }
  },
  { 
    path: '/privacy-policy', 
    component: PrivacyPolicy,
    meta: { 
      title: 'Privacy Policy - Real Estate Quest',
      description: 'Privacy policy for Real Estate Quest BC exam prep platform.'
    }
  },
  { 
    path: '/terms-of-service', 
    component: TermsOfService,
    meta: { 
      title: 'Terms of Service - Real Estate Quest',
      description: 'Terms of service for Real Estate Quest BC exam prep platform.'
    }
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Handle meta tags and route protection
router.beforeEach((to, from, next) => {
  // Check admin route protection
  if (to.meta.requiresAdmin) {
    const authStore = useAuthStore();
    
    // Wait for auth to initialize if not already done
    if (!authStore.authInitialized) {
      // Watch for auth initialization
      const unwatch = authStore.$subscribe(() => {
        if (authStore.authInitialized) {
          unwatch();
          if (authStore.isAdmin) {
            next();
          } else {
            console.warn('Access denied: Admin privileges required');
            next('/'); // Redirect to home
          }
        }
      });
      return;
    }
    
    // Auth is initialized, check admin status
    if (!authStore.isAdmin) {
      console.warn('Access denied: Admin privileges required');
      next('/'); // Redirect to home
      return;
    }
  }

  // Update document title
  if (to.meta.title) {
    document.title = to.meta.title;
  }
  
  // Update meta description
  if (to.meta.description) {
    let metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', to.meta.description);
    }
  }

  let canonicalLink = document.querySelector('link[rel="canonical"]');
  if (canonicalLink) {
    canonicalLink.setAttribute('href', `https://bcrealestatequest.ca${to.path}`);
  } else {
    canonicalLink = document.createElement('link');
    canonicalLink.setAttribute('rel', 'canonical');
    canonicalLink.setAttribute('href', `https://bcrealestatequest.ca${to.path}`);
    document.head.appendChild(canonicalLink);
  }
  
  // Handle noindex meta tag
  let metaRobots = document.querySelector('meta[name="robots"]');
  if (to.meta.noindex) {
    if (!metaRobots) {
      metaRobots = document.createElement('meta');
      metaRobots.setAttribute('name', 'robots');
      document.head.appendChild(metaRobots);
    }
    metaRobots.setAttribute('content', 'noindex, nofollow');
  } else {
    if (metaRobots) {
      metaRobots.setAttribute('content', 'index, follow');
    }
  }
  
  next();
});

export default router;