<template>
  <div>
    <v-row>
      <v-col cols="12" class="d-flex align-center">
        <span class="text-body-2">
          Generated questions and flashcards wait here for review. Approving one commits it to the AI repo; students see it
          while serving is on.
        </span>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="outlined" class="ml-4" :loading="aiLoading" @click="adminStore.fetchAiReviewQueue()">
          <v-icon left>mdi-refresh</v-icon>
          Refresh
        </v-btn>
      </v-col>
    </v-row>

    <!-- First load -->
    <v-row v-if="aiLoading && !aiHasLoaded">
      <v-col cols="12" class="text-center">
        <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
        <p class="mt-4">Loading AI content...</p>
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
                label="Serve AI questions and flashcards to students"
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
              <v-number-input
                v-model="settingsDraft.flashcardsPerRun"
                label="Flashcards per weekly run"
                :min="1"
                :max="10"
                density="compact"
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
                v-model="generateRequest.contentType"
                :items="contentTypeOptions"
                label="Content type"
                hint="Required"
                persistent-hint
                density="compact"
                class="mb-2"
              ></v-select>
              <v-select
                v-model="generateRequest.chapter"
                :items="chapterOptions"
                label="Chapter"
                density="compact"
              ></v-select>
              <v-number-input
                v-model="generateRequest.itemCount"
                :label="`Number of ${generateRequest.contentType || 'items'}`"
                :min="1"
                :max="10"
                :hint="itemCountHint"
                persistent-hint
                clearable
                density="compact"
              ></v-number-input>
              <v-checkbox
                v-model="generateRequest.dryRun"
                label="Dry run (shows the results without saving them)"
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
                :disabled="isGenerating || !generateRequest.contentType"
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
                  <th>Content type</th>
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
                  <td>{{ generationRun.contentType }}</td>
                  <td>{{ generationRun.chapter }}</td>
                  <td>{{ generationRun.requestedItemCount }}</td>
                  <td>{{ generationRun.generatedItemCount }}</td>
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
                  <td colspan="10" class="text-center text-grey">No generation runs yet</td>
                </tr>
              </tbody>
            </v-table>
          </v-card>
        </v-col>
      </v-row>

      <!-- Pending review -->
      <v-row>
        <v-col cols="12" class="d-flex align-center flex-wrap">
          <h3 class="text-h6 mr-4">Pending review</h3>
          <v-btn-toggle
            v-model="shownPendingContentType"
            mandatory
            color="primary"
            variant="outlined"
            density="compact"
          >
            <v-btn value="questions">Questions ({{ aiPendingQuestions.length }})</v-btn>
            <v-btn value="flashcards">Flashcards ({{ aiPendingFlashcards.length }})</v-btn>
          </v-btn-toggle>
        </v-col>
      </v-row>

      <!-- v-show keeps both lists mounted, so switching between them keeps unsaved edits -->
      <v-row v-show="shownPendingContentType === 'questions'">
        <v-col v-if="aiPendingQuestions.length === 0" cols="12">
          <v-card elevation="2">
            <v-card-text class="text-center">No questions are waiting for review.</v-card-text>
          </v-card>
        </v-col>
        <!-- Keyed by id, so a refresh keeps the drafts of questions still in the queue -->
        <v-col v-for="pendingQuestion in aiPendingQuestions" :key="pendingQuestion.id" cols="12">
          <AdminAiPendingQuestionCard
            :pendingQuestion="pendingQuestion"
            :chapterSplit="aiQuestionChapterSplits[pendingQuestion.chapter] || null"
          />
        </v-col>
      </v-row>

      <v-row v-show="shownPendingContentType === 'flashcards'">
        <v-col v-if="aiPendingFlashcards.length === 0" cols="12">
          <v-card elevation="2">
            <v-card-text class="text-center">No flashcards are waiting for review.</v-card-text>
          </v-card>
        </v-col>
        <!-- Keyed by id, so a refresh keeps the drafts of flashcards still in the queue -->
        <v-col v-for="pendingFlashcard in aiPendingFlashcards" :key="pendingFlashcard.id" cols="12">
          <AdminAiPendingFlashcardCard
            :pendingFlashcard="pendingFlashcard"
            :chapterSplit="aiFlashcardChapterSplits[pendingFlashcard.chapter] || null"
          />
        </v-col>
      </v-row>
    </template>

    <!-- Dry run results -->
    <v-dialog v-model="isDryRunDialogOpen" max-width="900" scrollable>
      <v-card v-if="dryRunResult">
        <v-card-title class="text-wrap">Dry run for chapter {{ dryRunResult.chapter }}</v-card-title>
        <v-card-subtitle class="text-wrap">
          {{ dryRunResult.generatedItemCount }} of {{ dryRunResult.requestedItemCount }} {{ dryRunResult.contentType }}
          generated ({{ dryRunResult.status }}). Nothing was saved.
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
          <template v-if="dryRunResult.contentType === 'flashcards'">
            <div v-for="(flashcard, flashcardIndex) in dryRunResult.items" :key="flashcardIndex" class="mb-6">
              <p class="font-weight-bold preformatted">{{ flashcardIndex + 1 }}. {{ flashcard.front }}</p>
              <p class="text-body-2 preformatted my-2">{{ flashcard.back }}</p>
              <p class="text-caption">Tags: {{ flashcard.tags.join(', ') }} · Difficulty {{ flashcard.difficulty }}</p>
            </div>
          </template>
          <template v-else>
            <div v-for="(question, questionIndex) in dryRunResult.items" :key="questionIndex" class="mb-6">
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
          </template>
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
import AdminAiPendingFlashcardCard from './adminAiPendingFlashcardCard.vue';

const adminStore = useAdminStore();
const {
  aiPendingQuestions,
  aiPendingFlashcards,
  aiGenerationRuns,
  aiSettings,
  aiQuestionChapterSplits,
  aiFlashcardChapterSplits,
  aiLoading,
  aiHasLoaded,
} = storeToRefs(adminStore);

const generationRunStatusColors = {
  running: 'info',
  succeeded: 'success',
  partial: 'warning',
  failed: 'error',
};

const contentTypeOptions = [
  { title: 'Questions', value: 'questions' },
  { title: 'Flashcards', value: 'flashcards' },
];

// The setting an empty Generate now count falls back to
const perRunSettingNameByContentType = { questions: 'questionsPerRun', flashcards: 'flashcardsPerRun' };

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
  const perRunCountsAreIntegers = Number.isInteger(settingsDraft.questionsPerRun)
    && Number.isInteger(settingsDraft.flashcardsPerRun);
  return hasChanges && perRunCountsAreIntegers && !isSavingSettings.value;
});

// contentType must be picked; chapter null = this week's chapter from the rotation, itemCount null = the per-run setting
const generateRequest = reactive({ contentType: null, chapter: null, itemCount: null, dryRun: false });
const isGenerating = ref(false);
const isDryRunDialogOpen = ref(false);
const dryRunResult = ref(null);

const itemCountHint = computed(() => {
  const perRunSettingName = perRunSettingNameByContentType[generateRequest.contentType];
  return perRunSettingName
    ? `Leave empty to use the per-run setting (${aiSettings.value[perRunSettingName]})`
    : 'Leave empty to use the per-run setting';
});

const shownPendingContentType = ref('questions');

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
    const generationResult = await adminStore.generateAiContentNow({ ...generateRequest });
    if (generationResult.dryRun) {
      dryRunResult.value = generationResult;
      isDryRunDialogOpen.value = true;
      return;
    }

    // The store already refreshed the queue and the runs table; show the list the new items landed in
    const { generatedItemCount, requestedItemCount, contentType, chapter, status, errors } = generationResult;
    shownPendingContentType.value = contentType;
    const firstErrorText = errors?.length ? ` First error: ${errors[0]}` : '';
    showNotification(
      `Generated ${generatedItemCount} of ${requestedItemCount} ${contentType} for chapter ${chapter} (${status}).${firstErrorText}`,
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
  adminStore.fetchAiReviewQueue();
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
