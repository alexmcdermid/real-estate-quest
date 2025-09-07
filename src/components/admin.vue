<template>
  <v-container fluid class="admin-container">
    <v-row>
      <v-col cols="12">
        <v-card class="mb-4">
          <v-card-title class="text-h4 font-weight-bold text-center">
            Admin Dashboard
          </v-card-title>
          <v-card-subtitle class="text-center">
            Administrative tools and system management
            <br>
            <small v-if="lastUpdated">Last updated: {{ formatDate(lastUpdated) }}</small>
          </v-card-subtitle>
        </v-card>
      </v-col>
    </v-row>

    <!-- Loading State -->
    <v-row v-if="loading">
      <v-col cols="12" class="text-center">
        <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
        <p class="mt-4">Loading admin data...</p>
      </v-col>
    </v-row>

    <!-- Stats Cards -->
    <v-row v-if="!loading && adminData">
      <!-- User Stats Card -->
      <v-col cols="12" md="3">
        <v-card class="mb-4" elevation="2">
          <v-card-title class="text-h6">
            <v-icon left color="primary">mdi-account-group</v-icon>
            User Stats
          </v-card-title>
          <v-card-text>
            <v-list density="compact">
              <v-list-item>
                <v-list-item-title>Total Auth Users</v-list-item-title>
                <v-list-item-subtitle>{{ adminData.stats.totalAuthUsers }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <v-list-item-title>Total Members</v-list-item-title>
                <v-list-item-subtitle>{{ adminData.stats.totalMembers }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <v-list-item-title>Monthly Subs</v-list-item-title>
                <v-list-item-subtitle>{{ adminData.stats.monthlyMembers }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <v-list-item-title>Lifetime Subs</v-list-item-title>
                <v-list-item-subtitle>{{ adminData.stats.lifetimeMembers }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <v-list-item-title>Admin Users</v-list-item-title>
                <v-list-item-subtitle>{{ adminData.stats.adminUsers }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Rate Limit Stats Card -->
      <v-col cols="12" md="3">
        <v-card class="mb-4" elevation="2">
          <v-card-title class="text-h6">
            <v-icon left color="warning">mdi-speedometer</v-icon>
            Rate Limit Stats
          </v-card-title>
          <v-card-text>
            <v-list density="compact">
              <v-list-item>
                <v-list-item-title>Total Logs</v-list-item-title>
                <v-list-item-subtitle>{{ adminData.stats.rateLimitStats.totalLogs }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <v-list-item-title>Question Blocks</v-list-item-title>
                <v-list-item-subtitle>{{ adminData.stats.rateLimitStats.questionLogs }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <v-list-item-title>Flashcard Blocks</v-list-item-title>
                <v-list-item-subtitle>{{ adminData.stats.rateLimitStats.flashcardLogs }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <v-list-item-title>Unique IPs</v-list-item-title>
                <v-list-item-subtitle>{{ adminData.stats.rateLimitStats.uniqueIPs }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <v-list-item-title>Unique Users</v-list-item-title>
                <v-list-item-subtitle>{{ adminData.stats.rateLimitStats.uniqueUsers }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Content Stats Card -->
      <v-col cols="12" md="3">
        <v-card class="mb-4" elevation="2">
          <v-card-title class="text-h6">
            <v-icon left color="info">mdi-file-document-multiple</v-icon>
            Content Stats
          </v-card-title>
          <v-card-text>
            <v-list density="compact">
              <v-list-item>
                <v-list-item-title>Total Questions</v-list-item-title>
                <v-list-item-subtitle>{{ adminData.stats.contentStats.totalQuestions }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <v-list-item-title>Total Flashcards</v-list-item-title>
                <v-list-item-subtitle>{{ adminData.stats.contentStats.totalFlashcards }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Quick Actions Card -->
      <v-col cols="12" md="6">
        <v-card class="mb-4" elevation="2">
          <v-card-title class="text-h6">
            <v-icon left color="success">mdi-lightning-bolt</v-icon>
            Quick Actions
          </v-card-title>
          <v-card-text>
            <v-row>
              <v-col cols="6">
                <v-btn 
                  color="primary" 
                  variant="outlined" 
                  block 
                  class="mb-2"
                  @click="refreshData"
                  :loading="loading"
                >
                  <v-icon left>mdi-refresh</v-icon>
                  Refresh Data
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn 
                  color="secondary" 
                  variant="outlined" 
                  block 
                  class="mb-2"
                  @click="exportData"
                >
                  <v-icon left>mdi-download</v-icon>
                  Export Data
                </v-btn>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Data Tables -->
    <v-row v-if="!loading && adminData">
  <!-- Members Table -->
      <v-col cols="12">
        <v-card elevation="2">
          <v-card-title class="text-h6">
            <v-icon left color="primary">mdi-account-group</v-icon>
            Members ({{ filteredMembers.length }})
            <v-spacer></v-spacer>
            <v-text-field
              v-model="memberSearch"
              append-icon="mdi-magnify"
              label="Search members..."
              single-line
              hide-details
              density="compact"
              style="max-width: 300px;"
            ></v-text-field>
          </v-card-title>
          <v-data-table
            :headers="memberHeaders"
            :items="filteredMembers"
            :search="memberSearch"
            :items-per-page="10"
            class="elevation-1"
          >
            <template v-slot:item.member="{ item }">
              <v-chip :color="item.member ? 'success' : 'default'" size="small">
                {{ item.member ? 'Active' : 'Inactive' }}
              </v-chip>
            </template>
            <template v-slot:item.admin="{ item }">
              <v-chip :color="item.admin ? 'error' : 'default'" size="small">
                {{ item.admin ? 'Admin' : 'User' }}
              </v-chip>
            </template>
            <template v-slot:item.subscriptionType="{ item }">
              <v-chip 
                :color="getSubscriptionColor(item.subscriptionType)" 
                size="small"
                v-if="item.subscriptionType"
              >
                {{ item.subscriptionType }}
              </v-chip>
              <span v-else>-</span>
            </template>
            <template v-slot:item.customerId="{ item }">
              <code v-if="item.customerId">{{ item.customerId }}</code>
              <span v-else class="text-grey">-</span>
            </template>
            <template v-slot:item.subscriptionId="{ item }">
              <code v-if="item.subscriptionId">{{ item.subscriptionId }}</code>
              <span v-else class="text-grey">-</span>
            </template>
            <template v-slot:item.cancelAt="{ item }">
              <span v-if="item.cancelAt">{{ formatDate(item.cancelAt) }}</span>
              <span v-else>-</span>
            </template>
            <template v-slot:item.cancelTime="{ item }">
              <span v-if="item.cancelTime">{{ formatDate(item.cancelTime) }}</span>
              <span v-else>-</span>
            </template>
            <template v-slot:item.resumeTime="{ item }">
              <span v-if="item.resumeTime">{{ formatDate(item.resumeTime) }}</span>
              <span v-else>-</span>
            </template>
          </v-data-table>
        </v-card>
      </v-col>

      <!-- All Users Table -->
      <v-col cols="12" class="mt-4">
        <v-card elevation="2">
          <v-card-title class="text-h6">
            <v-icon left color="primary">mdi-account-multiple</v-icon>
            All Users ({{ adminData.users ? adminData.users.length : 0 }})
            <v-spacer></v-spacer>
            <v-text-field
              v-model="usersSearch"
              append-icon="mdi-magnify"
              label="Search users..."
              single-line
              hide-details
              density="compact"
              style="max-width: 300px;"
            ></v-text-field>
          </v-card-title>
          <v-data-table
            :headers="usersHeaders"
            :items="filteredUsers"
            :search="usersSearch"
            :items-per-page="10"
            class="elevation-1"
          >
            <template v-slot:item.emailVerified="{ item }">
              <v-chip :color="item.emailVerified ? 'success' : 'default'" size="small">
                {{ item.emailVerified ? 'Yes' : 'No' }}
              </v-chip>
            </template>
            <template v-slot:item.customClaims="{ item }">
              <span>{{ item.customClaims && item.customClaims.isAdmin ? 'Admin' : '' }}</span>
            </template>
          </v-data-table>
        </v-card>
      </v-col>

      <!-- Rate Limit Logs Table -->
      <v-col cols="12" class="mt-4">
        <v-card elevation="2">
          <v-card-title class="text-h6">
            <v-icon left color="warning">mdi-shield-alert</v-icon>
            Rate Limit Logs ({{ filteredRateLimitLogs.length }})
            <v-spacer></v-spacer>
            <v-text-field
              v-model="rateLimitSearch"
              append-icon="mdi-magnify"
              label="Search logs..."
              single-line
              hide-details
              density="compact"
              style="max-width: 300px;"
            ></v-text-field>
          </v-card-title>
          <v-data-table
            :headers="rateLimitHeaders"
            :items="filteredRateLimitLogs"
            :search="rateLimitSearch"
            :items-per-page="15"
            class="elevation-1"
          >
            <template v-slot:item.type="{ item }">
              <v-chip 
                :color="item.type === 'questions' ? 'primary' : 'secondary'" 
                size="small"
              >
                {{ item.type }}
              </v-chip>
            </template>
            <template v-slot:item.timestamp="{ item }">
              {{ formatDate(item.timestamp) }}
            </template>
            <template v-slot:item.uid="{ item }">
              <code v-if="(item.userId || item.uid)">{{ item.userId || item.uid }}</code>
              <span v-else class="text-grey">Anonymous</span>
            </template>
            <template v-slot:item.ip="{ item }">
              <code>{{ item.ip || 'Unknown' }}</code>
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>

    <!-- Snackbar for notifications -->
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
      <template #actions>
        <v-btn color="white" variant="text" @click="snackbar.show = false">
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuthStore } from '@/composables/useAuth';
import { storeToRefs } from 'pinia';
import { firebaseApp } from '@/config/firebaseConfig';

const authStore = useAuthStore();
const { isAdmin } = storeToRefs(authStore);
const functions = getFunctions(firebaseApp, 'us-west1');

// Reactive data
const adminData = ref(null);
const loading = ref(false);
const lastUpdated = ref(null);
const memberSearch = ref('');
const rateLimitSearch = ref('');

const snackbar = ref({
  show: false,
  message: '',
  color: 'success'
});

// Table headers
const memberHeaders = [
  { title: 'User ID', key: 'id', sortable: true },
  { title: 'Status', key: 'member', sortable: true },
  { title: 'Role', key: 'admin', sortable: true },
  { title: 'Customer ID', key: 'customerId', sortable: true },
  { title: 'Subscription', key: 'subscriptionType', sortable: true },
  { title: 'Subscription ID', key: 'subscriptionId', sortable: true },
  { title: 'Cancel Date', key: 'cancelTime', sortable: true },
  { title: 'Cancel At Date', key: 'cancelAt', sortable: true },
  { title: 'Resume Date', key: 'resumeTime', sortable: true }
];

const rateLimitHeaders = [
  { title: 'Timestamp', key: 'timestamp', sortable: true },
  { title: 'Type', key: 'type', sortable: true },
  { title: 'User ID', key: 'uid', sortable: true },
  { title: 'IP Address', key: 'ip', sortable: true },
  { title: 'Qualifier', key: 'qualifier', sortable: true }
];

const usersHeaders = [
  { title: 'User ID', key: 'uid', sortable: true },
  { title: 'Email', key: 'email', sortable: true },
  { title: 'Display Name', key: 'displayName', sortable: true },
  { title: 'Email Verified', key: 'emailVerified', sortable: true },
  { title: 'Custom Claims', key: 'customClaims', sortable: false },
];

// Computed properties
const filteredMembers = computed(() => {
  if (!adminData.value) return [];
  return adminData.value.members;
});

const filteredRateLimitLogs = computed(() => {
  if (!adminData.value) return [];
  return adminData.value.rateLimitLogs;
});

const usersSearch = ref('');
const filteredUsers = computed(() => {
  if (!adminData.value) return [];
  return adminData.value.users || [];
});

// Methods
function showNotification(message, color = 'success') {
  snackbar.value = {
    show: true,
    message,
    color
  };
}

function formatDate(val) {
  if (!val) return '-';

  // Firestore Timestamp (client SDK)
  if (typeof val === 'object' && typeof val.toDate === 'function') {
    return val.toDate().toLocaleString();
  }

  // Admin SDK / serialized Timestamp object
  if (typeof val === 'object' && (('seconds' in val) || ('_seconds' in val))) {
    const secs = ('seconds' in val) ? val.seconds : val._seconds;
    const nanos = ('nanoseconds' in val) ? val.nanoseconds : (val._nanoseconds ?? 0);
    const ms = secs * 1000 + Math.floor(nanos / 1e6);
    return new Date(ms).toLocaleString();
  }

  // Numeric epoch (seconds or ms)
  if (typeof val === 'number') {
    const ms = val < 1e12 ? val * 1000 : val;
    return new Date(ms).toLocaleString();
  }

  // String/Date-compatible
  const d = new Date(val);
  return isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function getSubscriptionColor(subscriptionType) {
  switch (subscriptionType) {
    case 'Monthly': return 'primary';
    case 'Lifetime': return 'success';
    default: return 'default';
  }
}

async function fetchAdminData() {
  loading.value = true;
  try {
    const getAdminData = httpsCallable(functions, 'getAdminData');
    const result = await getAdminData();
    
    adminData.value = result.data;
    lastUpdated.value = result.data.timestamp;
    
    showNotification('Admin data loaded successfully');
  } catch (error) {
    console.error('Error fetching admin data:', error);
    showNotification('Error loading admin data: ' + error.message, 'error');
  } finally {
    loading.value = false;
  }
}

async function refreshData() {
  await fetchAdminData();
}

function exportData() {
  if (!adminData.value) return;
  
  const dataStr = JSON.stringify(adminData.value, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `admin-data-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  
  URL.revokeObjectURL(url);
  showNotification('Data exported successfully');
}

// Initialize component
onMounted(async () => {
  // Check if user is actually admin
  if (!isAdmin.value) {
    showNotification('Access denied: Admin privileges required', 'error');
    return;
  }

  // Load initial data
  await fetchAdminData();
});
</script>

<style scoped>
.admin-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.v-card {
  border-radius: 12px;
}

.v-card-title {
  background: linear-gradient(45deg, #1976d2, #42a5f5);
  color: white;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

code {
  background-color: rgba(0, 0, 0, 0.05);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.85em;
}

.text-grey {
  color: #666;
}
</style>
