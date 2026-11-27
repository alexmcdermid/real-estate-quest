import { defineStore } from 'pinia';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '@/config/firebaseConfig';
import { showNotification } from '@/composables/useNotifier';

// Same defaults as the server uses when metadata/aiContent is missing
const DEFAULT_AI_SETTINGS = { generationEnabled: false, servingEnabled: false, questionsPerRun: 1, flashcardsPerRun: 1 };

// What differs between reviewing a pending AI question and a pending AI flashcard
const AI_REVIEW_CONTENT_TYPES = {
  questions: {
    pendingItemsStateKey: 'aiPendingQuestions',
    chapterSplitsStateKey: 'aiQuestionChapterSplits',
    pendingIdField: 'pendingQuestionId',
    itemNumberField: 'questionNumber',
    approveCallableName: 'approveAiQuestion',
    rejectCallableName: 'rejectAiQuestion',
    itemNameInMessages: 'AI question',
  },
  flashcards: {
    pendingItemsStateKey: 'aiPendingFlashcards',
    chapterSplitsStateKey: 'aiFlashcardChapterSplits',
    pendingIdField: 'pendingFlashcardId',
    itemNumberField: 'cardNumber',
    approveCallableName: 'approveAiFlashcard',
    rejectCallableName: 'rejectAiFlashcard',
    itemNameInMessages: 'AI flashcard',
  },
};

function removePendingItem(adminStore, aiReviewContentType, pendingId) {
  const { pendingItemsStateKey } = aiReviewContentType;
  adminStore[pendingItemsStateKey] = adminStore[pendingItemsStateKey].filter((pendingItem) => pendingItem.id !== pendingId);
}

/**
 * Approves a pending AI question or flashcard, drops it from the queue and counts it in its chapter's split.
 * Shows the outcome and rethrows a failure so the card can stop its spinner.
 *
 * @param {Object} adminStore - The admin store.
 * @param {Object} aiReviewContentType - An entry of AI_REVIEW_CONTENT_TYPES.
 * @param {Object} approvalRequest - The approve callable's input, e.g. { pendingQuestionId, editedQuestion, premium }.
 * @returns {Promise<Object>} - The callable's result data.
 */
async function approveAiPendingItem(adminStore, aiReviewContentType, approvalRequest) {
  const { chapterSplitsStateKey, pendingIdField, itemNumberField, approveCallableName, itemNameInMessages } = aiReviewContentType;
  try {
    const functions = getFunctions(firebaseApp, 'us-west1');
    const approveCallable = httpsCallable(functions, approveCallableName);
    const result = await approveCallable(approvalRequest);
    const { chapter, alreadyInRepo } = result.data;

    removePendingItem(adminStore, aiReviewContentType, approvalRequest[pendingIdField]);
    // Keep the split shown on the chapter's other pending items current without a refetch
    const chapterSplit = adminStore[chapterSplitsStateKey][chapter];
    if (chapterSplit && !alreadyInRepo) {
      chapterSplit.aiTotal += 1;
      if (approvalRequest.premium === false) chapterSplit.aiFree += 1;
    }

    showNotification(`Approved as ${itemNameInMessages} ${result.data[itemNumberField]} in chapter ${chapter}`, 'success');
    return result.data;
  } catch (error) {
    console.error(`Error approving ${itemNameInMessages}:`, error);
    showNotification(`Error approving ${itemNameInMessages}: ` + error.message, 'error');
    throw error;
  }
}

/**
 * Rejects a pending AI question or flashcard and drops it from the queue.
 * Shows the outcome and rethrows a failure so the card can stop its spinner.
 *
 * @param {Object} adminStore - The admin store.
 * @param {Object} aiReviewContentType - An entry of AI_REVIEW_CONTENT_TYPES.
 * @param {Object} rejectionRequest - The reject callable's input, e.g. { pendingQuestionId, rejectionReason }.
 */
async function rejectAiPendingItem(adminStore, aiReviewContentType, rejectionRequest) {
  const { pendingIdField, rejectCallableName, itemNameInMessages } = aiReviewContentType;
  try {
    const functions = getFunctions(firebaseApp, 'us-west1');
    const rejectCallable = httpsCallable(functions, rejectCallableName);
    await rejectCallable(rejectionRequest);

    removePendingItem(adminStore, aiReviewContentType, rejectionRequest[pendingIdField]);
    showNotification(`${itemNameInMessages} rejected`, 'success');
  } catch (error) {
    console.error(`Error rejecting ${itemNameInMessages}:`, error);
    showNotification(`Error rejecting ${itemNameInMessages}: ` + error.message, 'error');
    throw error;
  }
}

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
    // AI questions and flashcards
    aiPendingQuestions: [],
    aiPendingFlashcards: [],
    aiGenerationRuns: [],
    aiSettings: { ...DEFAULT_AI_SETTINGS },
    aiQuestionChapterSplits: {},
    aiFlashcardChapterSplits: {},
    aiLoading: false,
    aiHasLoaded: false,
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

    async fetchAiReviewQueue() {
      this.aiLoading = true;
      try {
        const functions = getFunctions(firebaseApp, 'us-west1');
        const getAiReviewQueue = httpsCallable(functions, 'getAiReviewQueue');
        const result = await getAiReviewQueue();

        this.aiPendingQuestions = result.data?.pendingQuestions || [];
        this.aiPendingFlashcards = result.data?.pendingFlashcards || [];
        this.aiGenerationRuns = result.data?.generationRuns || [];
        this.aiSettings = result.data?.settings || { ...DEFAULT_AI_SETTINGS };
        this.aiQuestionChapterSplits = result.data?.questionChapterSplits || {};
        this.aiFlashcardChapterSplits = result.data?.flashcardChapterSplits || {};
        this.aiHasLoaded = true;
      } catch (error) {
        console.error('Error fetching the AI review queue:', error);
        showNotification('Error loading AI content: ' + error.message, 'error');
      } finally {
        this.aiLoading = false;
      }
    },

    async approveAiQuestion({ pendingQuestionId, editedQuestion, premium }) {
      return approveAiPendingItem(this, AI_REVIEW_CONTENT_TYPES.questions, { pendingQuestionId, editedQuestion, premium });
    },

    async approveAiFlashcard({ pendingFlashcardId, editedFlashcard, premium }) {
      return approveAiPendingItem(this, AI_REVIEW_CONTENT_TYPES.flashcards, { pendingFlashcardId, editedFlashcard, premium });
    },

    async rejectAiQuestion({ pendingQuestionId, rejectionReason }) {
      return rejectAiPendingItem(this, AI_REVIEW_CONTENT_TYPES.questions, { pendingQuestionId, rejectionReason });
    },

    async rejectAiFlashcard({ pendingFlashcardId, rejectionReason }) {
      return rejectAiPendingItem(this, AI_REVIEW_CONTENT_TYPES.flashcards, { pendingFlashcardId, rejectionReason });
    },

    async updateAiSettings(settingsUpdate) {
      try {
        const functions = getFunctions(firebaseApp, 'us-west1');
        const updateAiSettingsCallable = httpsCallable(functions, 'updateAiSettings');
        const result = await updateAiSettingsCallable(settingsUpdate);

        this.aiSettings = result.data.settings;
        showNotification('AI settings saved', 'success');
      } catch (error) {
        console.error('Error updating AI settings:', error);
        showNotification('Error saving AI settings: ' + error.message, 'error');
        throw error;
      }
    },

    // contentType "questions" or "flashcards"; chapter null = this week's chapter, itemCount null = the per-run setting
    async generateAiContentNow({ contentType, chapter, itemCount, dryRun }) {
      try {
        const functions = getFunctions(firebaseApp, 'us-west1');
        // Wait as long as the generator function may run (1800 s); the SDK's default timeout is 70 seconds
        const generateAiContentNowCallable = httpsCallable(functions, 'generateAiContentNow', { timeout: 1800000 });
        const result = await generateAiContentNowCallable({ contentType, chapter, itemCount, dryRun });

        if (!dryRun) {
          // A live run adds pending items and a run record
          await this.fetchAiReviewQueue();
        }
        return result.data;
      } catch (error) {
        console.error('Error generating AI content:', error);
        showNotification('Error generating AI content: ' + error.message, 'error');
        throw error;
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
      this.aiPendingQuestions = [];
      this.aiPendingFlashcards = [];
      this.aiGenerationRuns = [];
      this.aiSettings = { ...DEFAULT_AI_SETTINGS };
      this.aiQuestionChapterSplits = {};
      this.aiFlashcardChapterSplits = {};
      this.aiLoading = false;
      this.aiHasLoaded = false;
    },
  },
});
