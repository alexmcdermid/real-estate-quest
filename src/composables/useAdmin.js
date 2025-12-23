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
    // Activity logs
    activityLogs: [],
    activityLogsTotal: 0,
    activityLogsLoading: false,
    // Rate limit logs
    rateLimitLogs: [],
    rateLimitLogsTotal: 0,
    rateLimitLogsLoading: false,
    // Error logs
    errorLogs: [],
    errorLogsTotal: 0,
    errorLogsLoading: false,
    // Members
    members: [],
    membersTotal: 0,
    membersLoading: false,
    // Users
    users: [],
    usersTotal: 0,
    usersLoading: false,
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
        
        const data = result.data || {};
        this.adminData = data;
        this.lastUpdated = data.timestamp;
        this.hasLoadedOnce = true;

        // Prime first-page data for all tables from the bulk response
        this.activityLogs = data.activityLogs || [];
        this.activityLogsTotal = data.activityLogsPageInfo?.total ??
          (data.activityLogs ? data.activityLogs.length : 0);
        this.activityLogsLoading = false;

        this.rateLimitLogs = data.rateLimitLogs || [];
        this.rateLimitLogsTotal = data.rateLimitLogsPageInfo?.total ??
          (data.rateLimitLogs ? data.rateLimitLogs.length : 0);
        this.rateLimitLogsLoading = false;

        this.errorLogs = data.errorLogs || [];
        this.errorLogsTotal = data.errorLogsPageInfo?.total ??
          (data.errorLogs ? data.errorLogs.length : 0);
        this.errorLogsLoading = false;

        this.members = data.members || [];
        this.membersTotal = data.membersPageInfo?.total ??
          (data.members ? data.members.length : 0);
        this.membersLoading = false;

        this.users = data.users || [];
        this.usersTotal = data.usersPageInfo?.total ??
          (data.users ? data.users.length : 0);
        this.usersLoading = false;
        
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

    async fetchActivityLogsPage(page = 1, pageSize = 20) {
      if (this.activityLogsLoading) return;

      this.activityLogsLoading = true;
      try {
        const functions = getFunctions(firebaseApp, 'us-west1');
        const getStudyActivityLogsPage = httpsCallable(functions, 'getStudyActivityLogsPage');
        const result = await getStudyActivityLogsPage({
          page,
          pageSize,
        });

        this.activityLogs = result.data?.activityLogs || [];
        this.activityLogsTotal = result.data?.pageInfo?.total || 0;
      } catch (error) {
        console.error('Error fetching activity logs page:', error);
        showNotification('Error loading activity logs: ' + error.message, 'error');
      } finally {
        this.activityLogsLoading = false;
      }
    },

    async fetchRateLimitLogsPage(page = 1, pageSize = 20) {
      if (this.rateLimitLogsLoading) return;

      this.rateLimitLogsLoading = true;
      try {
        const functions = getFunctions(firebaseApp, 'us-west1');
        const getRateLimitLogsPage = httpsCallable(functions, 'getRateLimitLogsPage');
        const result = await getRateLimitLogsPage({
          page,
          pageSize,
        });

        this.rateLimitLogs = result.data?.rateLimitLogs || [];
        this.rateLimitLogsTotal = result.data?.pageInfo?.total || 0;
      } catch (error) {
        console.error('Error fetching rate limit logs page:', error);
        showNotification('Error loading rate limit logs: ' + error.message, 'error');
      } finally {
        this.rateLimitLogsLoading = false;
      }
    },

    async fetchErrorLogsPage(page = 1, pageSize = 20) {
      if (this.errorLogsLoading) return;

      this.errorLogsLoading = true;
      try {
        const functions = getFunctions(firebaseApp, 'us-west1');
        const getFunctionErrorLogsPage = httpsCallable(functions, 'getFunctionErrorLogsPage');
        const result = await getFunctionErrorLogsPage({
          page,
          pageSize,
        });

        this.errorLogs = result.data?.errorLogs || [];
        this.errorLogsTotal = result.data?.pageInfo?.total || 0;
      } catch (error) {
        console.error('Error fetching error logs page:', error);
        showNotification('Error loading error logs: ' + error.message, 'error');
      } finally {
        this.errorLogsLoading = false;
      }
    },

    async fetchMembersPage(page = 1, pageSize = 20) {
      if (this.membersLoading) return;

      this.membersLoading = true;
      try {
        const functions = getFunctions(firebaseApp, 'us-west1');
        const getMembersPage = httpsCallable(functions, 'getMembersPage');
        const result = await getMembersPage({
          page,
          pageSize,
        });

        this.members = result.data?.members || [];
        this.membersTotal = result.data?.pageInfo?.total || 0;
      } catch (error) {
        console.error('Error fetching members page:', error);
        showNotification('Error loading members: ' + error.message, 'error');
      } finally {
        this.membersLoading = false;
      }
    },

    async fetchUsersPage(page = 1, pageSize = 20) {
      if (this.usersLoading) return;

      this.usersLoading = true;
      try {
        const functions = getFunctions(firebaseApp, 'us-west1');
        const getUsersPage = httpsCallable(functions, 'getUsersPage');
        const result = await getUsersPage({
          page,
          pageSize,
        });

        this.users = result.data?.users || [];
        this.usersTotal = result.data?.pageInfo?.total || 0;
      } catch (error) {
        console.error('Error fetching users page:', error);
        showNotification('Error loading users: ' + error.message, 'error');
      } finally {
        this.usersLoading = false;
      }
    },

    clearData() {
      this.adminData = null;
      this.lastUpdated = null;
      this.hasLoadedOnce = false;
      this.activityLogs = [];
      this.activityLogsTotal = 0;
      this.activityLogsLoading = false;
      this.rateLimitLogs = [];
      this.rateLimitLogsTotal = 0;
      this.rateLimitLogsLoading = false;
      this.errorLogs = [];
      this.errorLogsTotal = 0;
      this.errorLogsLoading = false;
      this.members = [];
      this.membersTotal = 0;
      this.membersLoading = false;
      this.users = [];
      this.usersTotal = 0;
      this.usersLoading = false;
    },
  },
});
