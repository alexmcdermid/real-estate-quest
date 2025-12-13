<template>
  <v-container>
    <v-row>
      <v-col cols="12" class="d-flex flex-column flex-md-row align-items-center justify-space-around justify-md-space-between">
        <h2 class="mb-2 mb-md-0 text-center text-md-start mx-auto mx-md-0">Flashcards - Chapter {{ selectedChapter }}</h2>
        <div v-if="hasViewedFlashcards" class="d-flex align-items-center align-self-center w-100 w-md-auto justify-center justify-md-start">
          <span class="flashcard-counter">Completed: {{ viewedFlashcards.size }} / {{ flashcards.length }}</span>
          <v-btn color="error" outlined @click="resetAllFlashcards">Reset All</v-btn>
        </div>
      </v-col>
      <v-col cols="12">
        <v-select
          :items="chapters"
          label="Select Chapter"
          v-model="selectedChapter"
          outlined
          dense
          class="mb-4"
          :item-title="item => `${item.id} - ${item.name}`"
          :item-value="item => item.id"
          :return-object="false"
          :value="1"
        />
      </v-col>
      <v-col cols="12">
        <v-row>
          <template v-if="isLoading">
            <v-col v-for="n in 8" :key="n" cols="12" md="6">
              <v-skeleton-loader type="card" elevation="11" />
            </v-col>
          </template>
          <template v-else>
            <v-col v-for="(item, index) in flashcardsWithProCard" :key="index" cols="12" md="6">
              <component
                :is="item.component"
                v-bind="item.props"
                proType="flashcards"
                @flashcardViewed="markFlashcardViewed"
                @flashcardDifficulty="markFlashcardDifficulty"
              />
            </v-col>
            <template v-if="!isPro && flashcards.length > 0">
              <v-col
                v-for="n in (flashcards.length % 2 === 0 ? 1 : 2)"
                :key="'blurred-cta-' + n"
                cols="12"
                md="6"
              >
                <BlurredCtaCard proType="flashcards" :overallNumber="flashcards.length" :blurIndex="n - 1" />
              </v-col>
            </template>
            <v-col v-if="flashcards.length == 0" cols="12" md="6">
              <v-card>
                <v-card-title class="preformatted text-center">
                  No flashcards available for this chapter.
                </v-card-title>
                <v-card-text class="text-center">
                  Content coming soon, please check back later.
                </v-card-text>
              </v-card>
            </v-col>
          </template>
        </v-row>
      </v-col>
      <v-col cols="12" class="d-flex align-items-center justify-space-around justify-md-end">
        <div v-if="hasViewedFlashcards" class="d-flex align-items-center">
          <span class="flashcard-counter">Completed: {{ viewedFlashcards.size }} / {{ flashcards.length }}</span>
          <v-btn color="error" outlined @click="resetAllFlashcards">Reset All</v-btn>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, watch, onMounted, computed } from "vue";
import { useAuthStore } from "../composables/useAuth";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import { fetchFlashcardsByChapter } from "../composables/useFlashcard";
import FlashCard from "./flashCard.vue";
import ProCard from "./proCard.vue";
import BlurredCtaCard from "./BlurredCtaCard.vue";
import useOptions from "../composables/useOption";
import { chapters } from "@/constants/chapters";
import { useActivityTracker } from "../composables/useActivityTracker";

const authStore = useAuthStore();
const { authInitialized, isPro } = storeToRefs(authStore);
const { options } = useOptions();
const { recordFlashcardView, flushPendingEvents } = useActivityTracker();

const isLoading = ref(true);
const selectedChapter = ref(1);
const flashcards = ref([]);
const viewedFlashcards = ref(new Set());
const shuffled = computed(() => options.shuffled);
const resetAll = ref(false);
const flashcardDifficulties = ref({});

const route = useRoute();
const router = useRouter();

const flashcardsWithProCard = computed(() => {
  const cardItems = flashcards.value.map((f, index) => ({
    component: FlashCard,
    props: {
      flashcard: f,
      shuffled: !!shuffled.value,
      flashcardIndex: index,
      resetAll: resetAll.value,
    },
  }));
  if (!isPro.value && cardItems.length > 0) {
    const middleIndex = Math.floor(cardItems.length / 2);
    cardItems.splice(middleIndex, 0, {
      component: ProCard,
      props: {},
    });
  }
  return cardItems;
});

const hasViewedFlashcards = computed(() => viewedFlashcards.value.size > 0);

function markFlashcardViewed(payload) {
  const index = typeof payload === "object" ? payload.index : payload;
  const viewed = typeof payload === "object" ? payload.viewed : true;

  if (typeof index !== "number" || !viewed) return;
  if (viewedFlashcards.value.has(index)) return;

  viewedFlashcards.value.add(index);

  const flashcard = flashcards.value[index];
  if (flashcard) {
    recordFlashcardView({
      flashcard,
      chapter: selectedChapter.value,
      isProUser: isPro.value,
    });
  }
}

function markFlashcardDifficulty({ index, difficulty }) {
  flashcardDifficulties.value[index] = difficulty;
}

function resetAllFlashcards() {
  resetAll.value = true;
  setTimeout(() => {
    resetAll.value = false;
    viewedFlashcards.value.clear();
    flashcardDifficulties.value = {};
  }, 0);
}

async function loadFlashcards() {
  try {
    const result = await fetchFlashcardsByChapter(selectedChapter.value);
    flashcards.value = shuffled.value ? shuffleArray([...result]) : result;
    isLoading.value = false;
  } catch (error) {
    isLoading.value = false;
    console.error("Error loading flashcards:", error);
  }
}

watch(selectedChapter, () => {
  isLoading.value = true;
  viewedFlashcards.value = new Set();
  flashcardDifficulties.value = {};
  loadFlashcards();
});

watch(shuffled, () => {
  isLoading.value = true;
  loadFlashcards();
});

onMounted(() => {
  // Check for ch query param on mount
  const chParam = parseInt(route.query.ch);
  if (!isNaN(chParam) && chapters.some(c => c.id === chParam)) {
    selectedChapter.value = chParam;
    // Remove ch param from URL after using it
    const { ch, ...rest } = route.query;
    router.replace({ query: { ...rest } });
  }
  if (authInitialized.value) {
    loadFlashcards();
  } else {
    const stopWatch = watch(authInitialized, (newVal) => {
      if (newVal === true) {
        loadFlashcards();
        stopWatch();
      }
    });
  }
});

function shuffleArray(array) {
  let currentIndex = array.length,
    randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}
</script>

<style scoped>
.flashcard-counter {
  font-weight: 500;
  margin-right: 16px;
}

.v-select {
  min-width: 300px;
}

@media (max-width: 600px) {
  .v-select {
    min-width: 100%;
  }
}
</style>
