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
        <div v-if="!questions.length">
          Loading...
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, watch } from "vue";
import { fetchQuestionsByChapter } from "../composables/useQuestion";

const chapters = [1, 2, 3, 4];
const selectedChapter = ref(1);
const questions = ref([]);

async function loadQuestions() {
  try {
    const result = await fetchQuestionsByChapter(selectedChapter.value);
    questions.value = result;
    console.log("Loaded questions:", questions.value);
  } catch (error) {
    console.error("Error loading questions:", error);
  }
}

watch(selectedChapter, () => {
  loadQuestions();
});

loadQuestions();
</script>
