<template>
  <v-card
    outlined
    class="mb-4 blurred-cta-card clickable-card"
    :class="proType === 'questions' ? 'question-card-mimic' : ''"
    @click="$router.push('/pro')"
    :data-question-index="proType === 'questions' ? -1 : undefined"
  >
    <template v-if="proType === 'questions'">
      <v-card :style="blurStyle">
        <v-card-title class="preformatted">
          Question {{ overallNumber + blurIndex + 1 }}
        </v-card-title>
        <v-card-text>
          <span class="questionText">
            What is the primary purpose of the Real Estate Services Act?<br><br>
            (This content is available to Pro members only.)
          </span>
        </v-card-text>
        <v-card-text>
          <v-radio-group disabled>
            <template v-if="blurIndex === 1">
              <v-radio label="2. To set property tax rates" value="1" />
              <v-radio label="4. To manage strata corporations" value="3" />
              <v-radio label="1. To regulate real estate licensees" value="0" />
              <v-radio label="3. To provide mortgage insurance" value="2" />
            </template>
            <template v-else>
              <v-radio label="1. To regulate real estate licensees" value="0" />
              <v-radio label="2. To set property tax rates" value="1" />
              <v-radio label="3. To provide mortgage insurance" value="2" />
              <v-radio label="4. To manage strata corporations" value="3" />
            </template>
          </v-radio-group>
          <v-btn
            color="primary"
            :disabled="true"
            class="mt-4"
            block
          >
            Submit Answer
          </v-btn>
        </v-card-text>
      </v-card>
      <div class="blur-overlay">
        <span class="blurred-cta-text">Upgrade to Pro to unlock more questions!</span>
      </div>
    </template>
    <template v-else>
      <div class="flashcard-content" :style="blurStyle">
        <span class="flashcard-text">
          The specific property that is the focus of an appraisal or valuation assignment.
        </span>
      </div>
      <div class="blur-overlay">
        <span class="blurred-cta-text">Upgrade to Pro to unlock more flashcards!</span>
      </div>
    </template>
  </v-card>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from "vue-router";
const router = useRouter();
const props = defineProps({
  proType: {
    type: String,
    default: 'questions',
  },
  blurIndex: {
    type: Number,
    default: 0,
  },
  overallNumber: {
    type: Number,
    default: 0,
  },
});

const blurStyle = computed(() => {
  let blurAmount = 2.5;
  if (props.blurIndex === 1) blurAmount = 3;
  else if (props.blurIndex >= 2) blurAmount = 4;
  return {
    filter: `blur(${blurAmount}px) brightness(1)`,
  };
});
</script>

<style scoped>
.blurred-cta-card {
  position: relative;
  min-height: 210px;
  width: 100%;
  height: 210px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  cursor: pointer;
  overflow: hidden;
  background: #f5f5f5;
  box-sizing: border-box;
}
.question-card-mimic {
  min-height: unset;
  height: unset;
  padding-bottom: 0;
  max-width: 600px;
}
.flashcard-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 180px;
  max-height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  width: 100%;
  padding: 24px 20px 24px 20px;
}
.blur-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  background: rgba(255,255,255,0.5);
  pointer-events: none;
  padding: 24px 20px 24px 20px;
}
.blurred-cta-text {
  font-size: 1.1rem;
  font-weight: bold;
  color: #1976D2;
  text-align: center;
  width: 100%;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.blurred-main-text, .flashcard-text {
  font-size: 18px;
  text-align: center;
  width: 100%;
  word-break: break-word;
}
.questionText {
  font-size: 16px;
}
@media (max-width: 960px) {
  .blurred-main-text, .flashcard-text {
    font-size: 16px;
  }
  .questionText {
    font-size: 15px;
  }
}
@media (max-width: 600px) {
  .blurred-main-text, .flashcard-text {
    font-size: 14px;
  }
  .questionText {
    font-size: 14px;
  }
}
</style>