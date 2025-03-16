<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <v-select
          :items="chapters"
          label="Select Chapter"
          v-model="selectedChapter"
          outlined
          dense
          class="mb-6"
        />
      </v-col>
      <v-col cols="12">
        <h2 class="mb-4">Quiz Questions (Chapter {{ selectedChapter }})</h2>
        <v-row>
          <v-col
            v-for="q in questions"
            :key="q.id"
            cols="12"
            md="6"
          >
            <v-card outlined class="mb-4">
              <v-card-title>
                Q{{ q.questionNumber }}: {{ q.question }}
              </v-card-title>
              <v-card-text>
                <v-list dense>
                  <v-list-item
                    v-for="(choice, index) in q.choices"
                    :key="index"
                  >
                    <v-list-item-content>{{ choice }}</v-list-item-content>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <div v-if="isLoading">
          Loading...
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";
import { useAuth } from "../composables/useAuth";
import { fetchQuestionsByChapter } from "../composables/useQuestion";
const { authInitialized } = useAuth();

let isLoading = true;
const chapters = [1, 2];
const selectedChapter = ref(1);
const questions = ref([]);

async function loadQuestions() {
  try {
    const result = await fetchQuestionsByChapter(selectedChapter.value);
    questions.value = result;
    isLoading = false;
    console.log("Loaded questions:", questions.value);
  } catch (error) {
    isLoading = false;
    console.error("Error loading questions:", error);
  }
}

watch(selectedChapter, () => {
  loadQuestions();
});

onMounted(() => {
  if (authInitialized.value) {
    loadQuestions();
  } else {
    const stopWatch = watch(authInitialized, (newVal) => {
      if (newVal === true) {
        loadQuestions();
        stopWatch();
      }
    });
  }
});
</script>
