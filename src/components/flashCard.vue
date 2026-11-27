<template>
  <div class="flashcard-container">
    <v-card 
      outlined 
      class="mb-4 flashcard" 
      :data-flashcard-index="flashcardIndex"
      :ripple="false"
      @click="flipCard"
    >
      <div class="flashcard-inner" :class="{ 'flipped': isFlipped }">
        <div class="flashcard-front">
          <v-chip v-if="isAiFlashcard" size="x-small" color="primary" label class="flashcard-ai-label">AI</v-chip>
          <v-card-text>
            <div class="flashcard-content">
              <span class="flashcard-text" v-html="formattedFront"></span>
            </div>
          </v-card-text>
        </div>
        <div class="flashcard-back">
          <v-chip v-if="isAiFlashcard" size="x-small" color="primary" label class="flashcard-ai-label">AI</v-chip>
          <v-card-text>
            <div class="flashcard-content">
              <span class="flashcard-text" v-html="formattedBack"></span>
            </div>
          </v-card-text>
        </div>
      </div>
    </v-card>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { formatContentTextAsHtml } from '../utils/contentTextFormatting';

const props = defineProps({
  flashcard: {
    type: Object,
    required: true,
  },
  shuffled: {
    type: Boolean,
    required: true,
  },
  flashcardIndex: {
    type: Number,
    required: true,
  },
  resetAll: {
    type: Boolean,
    required: true,
  },
});

// Define emits for events
const emit = defineEmits(["flashcardViewed", "flashcardDifficulty"]);

// Local state for flipping and difficulty
const isFlipped = ref(false);
const markedDifficulty = ref(null);

// Watch for resetAll prop to reset the card to front side
watch(() => props.resetAll, (newVal) => {
  if (newVal) {
    if (isFlipped.value) {
      emit('flashcardViewed', { index: props.flashcardIndex, viewed: false });
    }
    isFlipped.value = false;
    markedDifficulty.value = null;
  }
});

// AI flashcards are labeled on both faces, so they never pass for a human card
const isAiFlashcard = computed(() => props.flashcard.aiGenerated === true);

// Format content with line breaks and bold text. AI-written text is HTML-escaped first.
const formattedFront = computed(() => formatContentTextAsHtml(props.flashcard, props.flashcard.front));

const formattedBack = computed(() => formatContentTextAsHtml(props.flashcard, props.flashcard.back));

// Flip the card
function flipCard() {
  isFlipped.value = !isFlipped.value;
  emit('flashcardViewed', { index: props.flashcardIndex, viewed: isFlipped.value });
}

// Mark the difficulty level
function markDifficulty(level) {
  markedDifficulty.value = level;
  emit("flashcardDifficulty", { index: props.flashcardIndex, difficulty: level });
}
</script>

<style scoped>
.flashcard-container {
  perspective: 1000px;
  height: 100%;
}

.flashcard {
  min-height: 220px;
  cursor: pointer;
}

.flashcard-inner {
  transition: transform 0.6s;
  transform-style: preserve-3d;
  position: relative;
  width: 100%;
  height: 100%;
  text-align: center;
}

.flashcard-inner.flipped {
  transform: rotateY(180deg);
}

.flashcard-front, .flashcard-back {
  backface-visibility: hidden;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.flashcard-front {
  z-index: 2;
}

.flashcard-back {
  transform: rotateY(180deg);
  z-index: 1;
}

/* Pinned to the face's corner so it never shifts the centered text */
.flashcard-ai-label {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
}

.flashcard-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 210px;
  max-height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  width: 100%;
}

.flashcard-text {
  font-size: 17px;
  width: 100%;
  word-break: break-word;
  text-align: center;
}

@media (max-width: 960px) {
  .flashcard-text {
    font-size: 15px;
  }
}

@media (max-width: 600px) {
  .flashcard-text {
    font-size: 13px;
  }
}

.preformatted {
  white-space: pre-wrap;
  word-break: break-word;
}

.difficulty-selected {
  opacity: 1;
  transform: scale(1.2);
}

.v-btn.difficulty-selected {
  background-color: rgba(0, 0, 0, 0.1);
}
</style>
