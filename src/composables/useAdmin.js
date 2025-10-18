import { defineStore } from 'pinia';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '@/config/firebaseConfig';
import { showNotification } from '@/composables/useNotifier';

export const useAdminStore = defineStore('admin', {
  state: () => ({
    adminData: null,
    loading: false,
    lastUpdated: null,
    hasLoadedOnce: false,
  }),

  getters: {
    // User stats
    totalAuthUsers: (state) => state.adminData?.stats?.totalAuthUsers || 0,
    totalMembers: (state) => state.adminData?.stats?.totalMembers || 0,
    monthlyMembers: (state) => state.adminData?.stats?.monthlyMembers || 0,
    lifetimeMembers: (state) => state.adminData?.stats?.lifetimeMembers || 0,
    adminUsers: (state) => state.adminData?.stats?.adminUsers || 0,

    // Rate limit stats
    totalRateLimitLogs: (state) => state.adminData?.stats?.rateLimitStats?.totalLogs || 0,
    questionRateLimitLogs: (state) => state.adminData?.stats?.rateLimitStats?.questionLogs || 0,
    flashcardRateLimitLogs: (state) => state.adminData?.stats?.rateLimitStats?.flashcardLogs || 0,
    uniqueIPs: (state) => state.adminData?.stats?.rateLimitStats?.uniqueIPs || 0,
    uniqueUsers: (state) => state.adminData?.stats?.rateLimitStats?.uniqueUsers || 0,

    // Content stats
    totalQuestions: (state) => state.adminData?.stats?.contentStats?.totalQuestions || 0,
    totalFlashcards: (state) => state.adminData?.stats?.contentStats?.totalFlashcards || 0,

    // Data arrays
    members: (state) => state.adminData?.members || [],
    users: (state) => state.adminData?.users || [],
    rateLimitLogs: (state) => state.adminData?.rateLimitLogs || [],
    errorLogs: (state) => state.adminData?.errorLogs || [],
  },

  actions: {
    async fetchAdminData(forceRefresh = false) {
      // If we already have data and this isn't a forced refresh, skip
      if (this.hasLoadedOnce && this.adminData && !forceRefresh) {
        return;
      }

      this.loading = true;
      try {
        const functions = getFunctions(firebaseApp, 'us-west1');
        const getAdminData = httpsCallable(functions, 'getAdminData');
        const result = await getAdminData();
        
        this.adminData = result.data;
        this.lastUpdated = result.data.timestamp;
        this.hasLoadedOnce = true;
        
        showNotification('Admin data loaded successfully', 'success');
      } catch (error) {
        console.error('Error fetching admin data:', error);
        showNotification('Error loading admin data: ' + error.message, 'error');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async refreshData() {
      await this.fetchAdminData(true); // Force refresh
    },

    clearData() {
      this.adminData = null;
      this.lastUpdated = null;
      this.hasLoadedOnce = false;
    },
  },
});
