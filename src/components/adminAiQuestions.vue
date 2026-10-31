<template>
  <div>
    <v-row>
      <v-col cols="12" class="d-flex align-center">
        <span class="text-body-2">
          Generated questions wait here for review. Approving one commits it to the AI questions repo; students see it while
          serving is on.
        </span>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="outlined" class="ml-4" :loading="aiLoading" @click="adminStore.fetchAiPendingQuestions()">
          <v-icon left>mdi-refresh</v-icon>
          Refresh
        </v-btn>
      </v-col>
    </v-row>

    <!-- First load -->
    <v-row v-if="aiLoading && !aiHasLoaded">
      <v-col cols="12" class="text-center">
        <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
        <p class="mt-4">Loading AI questions...</p>
      </v-col>
    </v-row>

    <template v-if="aiHasLoaded">
      <v-row>
        <!-- Settings -->
        <v-col cols="12" md="6">
          <v-card class="mb-4" elevation="2">
            <v-card-title class="text-h6">
              <v-icon left color="primary">mdi-cog</v-icon>
              Settings
            </v-card-title>
            <v-card-text>
              <v-switch
                v-model="settingsDraft.generationEnabled"
                label="Weekly generation"
                color="primary"
                hide-details
              ></v-switch>
              <v-switch
                v-model="settingsDraft.servingEnabled"
                label="Serve AI questions to students"
                color="primary"
                hint="Students get the change on their next page load."
                persistent-hint
              ></v-switch>
              <v-number-input
                v-model="settingsDraft.questionsPerRun"
                label="Questions per weekly run"
                :min="1"
                :max="10"
                density="compact"
                class="mt-4"
              ></v-number-input>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn
                color="primary"
                variant="flat"
                :loading="isSavingSettings"
                :disabled="!canSaveSettings"
                @click="saveSettings"
              >
                Save
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>

        <!-- Generate now -->
        <v-col cols="12" md="6">
          <v-card class="mb-4" elevation="2">
            <v-card-title class="text-h6">
              <v-icon left color="success">mdi-robot</v-icon>
              Generate now
            </v-card-title>
            <v-card-text>
              <v-select
                v-model="generateRequest.chapter"
                :items="chapterOptions"
                label="Chapter"
                density="compact"
              ></v-select>
              <v-number-input
                v-model="generateRequest.questionCount"
                label="Number of questions"
                :min="1"
                :max="10"
                :hint="`Leave empty to use the per-run setting (${aiSettings.questionsPerRun})`"
                persistent-hint
                clearable
                density="compact"
              ></v-number-input>
              <v-checkbox
                v-model="generateRequest.dryRun"
                label="Dry run (shows the questions without saving them)"
                color="primary"
                hide-details
              ></v-checkbox>
              <p class="text-caption">A run can take a few minutes.</p>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn
                color="primary"
                variant="flat"
                :loading="isGenerating"
                :disabled="isGenerating"
                @click="generateNow"
              >
                Generate
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>

      <!-- Recent generation runs -->
      <v-row>
        <v-col cols="12">
          <v-card class="mb-4" elevation="2">
            <v-card-title class="text-h6">
              <v-icon left color="info">mdi-history</v-icon>
              Recent generation runs
            </v-card-title>
            <v-table density="compact">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Trigger</th>
                  <th>Chapter</th>
                  <th>Requested</th>
                  <th>Generated</th>
                  <th>Status</th>
                  <th>Dry run</th>
                  <th>Requested by</th>
                  <th>First error</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="generationRun in aiGenerationRuns" :key="generationRun.id">
                  <td>{{ formatIsoDate(generationRun.startedAt) }}</td>
                  <td>{{ generationRun.trigger }}</td>
                  <td>{{ generationRun.chapter }}</td>
                  <td>{{ generationRun.requestedQuestionCount }}</td>
                  <td>{{ generationRun.generatedQuestionCount }}</td>
                  <td>
                    <v-chip size="small" :color="generationRunStatusColors[generationRun.status] || 'default'">
                      {{ generationRun.status }}
                    </v-chip>
                  </td>
                  <td>{{ generationRun.dryRun ? 'Yes' : 'No' }}</td>
                  <td>
                    <code v-if="generationRun.requestedBy">{{ generationRun.requestedBy }}</code>
                    <span v-else class="text-grey">-</span>
                  </td>
                  <td>{{ generationRun.errors?.[0] || '-' }}</td>
                </tr>
                <tr v-if="aiGenerationRuns.length === 0">
                  <td colspan="9" class="text-center text-grey">No generation runs yet</td>
                </tr>
              </tbody>
            </v-table>
          </v-card>
        </v-col>
      </v-row>

      <!-- Pending questions -->
      <v-row>
        <v-col cols="12">
          <h3 class="text-h6">Pending questions ({{ aiPendingQuestions.length }})</h3>
        </v-col>
        <v-col v-if="aiPendingQuestions.length === 0" cols="12">
          <v-card elevation="2">
            <v-card-text class="text-center">No questions are waiting for review.</v-card-text>
          </v-card>
        </v-col>
        <!-- Keyed by id, so a refresh keeps the drafts of questions still in the queue -->
        <v-col v-for="pendingQuestion in aiPendingQuestions" :key="pendingQuestion.id" cols="12">
          <AdminAiPendingQuestionCard
            :pendingQuestion="pendingQuestion"
            :chapterSplit="aiChapterSplits[pendingQuestion.chapter] || null"
          />
        </v-col>
      </v-row>
    </template>

    <!-- Dry run results -->
    <v-dialog v-model="isDryRunDialogOpen" max-width="900" scrollable>
      <v-card v-if="dryRunResult">
        <v-card-title class="text-wrap">Dry run for chapter {{ dryRunResult.chapter }}</v-card-title>
        <v-card-subtitle class="text-wrap">
          {{ dryRunResult.generatedQuestionCount }} of {{ dryRunResult.requestedQuestionCount }} questions generated
          ({{ dryRunResult.status }}). Nothing was saved.
        </v-card-subtitle>
        <v-card-text>
          <v-alert
            v-for="(errorMessage, errorIndex) in dryRunResult.errors"
            :key="`error-${errorIndex}`"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-2"
          >
            {{ errorMessage }}
          </v-alert>
          <div v-for="(question, questionIndex) in dryRunResult.questions" :key="questionIndex" class="mb-6">
            <p class="font-weight-bold preformatted">{{ questionIndex + 1 }}. {{ question.question }}</p>
            <ol class="pl-6 my-2">
              <li
                v-for="(choice, choiceIndex) in question.choices"
                :key="choiceIndex"
                :class="{ 'font-weight-bold text-success': choiceIndex === question.correctChoice }"
              >
                {{ choice }}
              </li>
            </ol>
            <p class="text-body-2 preformatted">{{ question.explanation }}</p>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" @click="isDryRunDialogOpen = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useAdminStore } from '@/composables/useAdmin';
import { showNotification } from '@/composables/useNotifier';
import { chapters } from '@/constants/chapters';
import AdminAiPendingQuestionCard from './adminAiPendingQuestionCard.vue';

const adminStore = useAdminStore();
const {
  aiPendingQuestions,
  aiGenerationRuns,
  aiSettings,
  aiChapterSplits,
  aiLoading,
  aiHasLoaded,
} = storeToRefs(adminStore);

const generationRunStatusColors = {
  running: 'info',
  succeeded: 'success',
  partial: 'warning',
  failed: 'error',
};

const chapterOptions = [
  { title: "This week's chapter", value: null },
  ...chapters.map((chapter) => ({ title: `${chapter.id} - ${chapter.name}`, value: chapter.id })),
];

// Settings are edited on a copy and saved together
const settingsDraft = reactive({ ...aiSettings.value });
watch(aiSettings, (savedSettings) => Object.assign(settingsDraft, savedSettings));
const isSavingSettings = ref(false);
const canSaveSettings = computed(() => {
  const hasChanges = Object.keys(settingsDraft).some((key) => settingsDraft[key] !== aiSettings.value[key]);
  return hasChanges && Number.isInteger(settingsDraft.questionsPerRun) && !isSavingSettings.value;
});

// chapter null = this week's chapter from the rotation, questionCount null = the per-run setting
const generateRequest = reactive({ chapter: null, questionCount: null, dryRun: false });
const isGenerating = ref(false);
const isDryRunDialogOpen = ref(false);
const dryRunResult = ref(null);

function formatIsoDate(isoDate) {
  return isoDate ? new Date(isoDate).toLocaleString() : '-';
}

async function saveSettings() {
  isSavingSettings.value = true;
  try {
    await adminStore.updateAiSettings({ ...settingsDraft });
  } catch {
    // The store already showed the error
  } finally {
    isSavingSettings.value = false;
  }
}

async function generateNow() {
  isGenerating.value = true;
  try {
    const generationResult = await adminStore.generateAiQuestionsNow({ ...generateRequest });
    if (generationResult.dryRun) {
      dryRunResult.value = generationResult;
      isDryRunDialogOpen.value = true;
      return;
    }

    // The store already refreshed the queue and the runs table
    const { generatedQuestionCount, requestedQuestionCount, chapter, status, errors } = generationResult;
    const firstErrorText = errors?.length ? ` First error: ${errors[0]}` : '';
    showNotification(
      `Generated ${generatedQuestionCount} of ${requestedQuestionCount} questions for chapter ${chapter} (${status}).${firstErrorText}`,
      generationRunStatusColors[status] || 'info',
      10000,
    );
  } catch {
    // The store already showed the error
  } finally {
    isGenerating.value = false;
  }
}

onMounted(() => {
  adminStore.fetchAiPendingQuestions();
});
</script>

<style scoped>
/* Same look as the dashboard cards in admin.vue */
.v-card,
:deep(.v-card) {
  border-radius: 12px;
}

:deep(.v-card-title) {
  background: linear-gradient(45deg, #1976d2, #42a5f5);
  color: white;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

:deep(code) {
  background-color: rgba(0, 0, 0, 0.05);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.85em;
}

.preformatted {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
