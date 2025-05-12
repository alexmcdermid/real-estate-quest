<template>
  <div class="flashcard-container">
    <v-card 
      outlined 
      class="mb-4 flashcard" 
      :class="{ 'flipped': isFlipped }"
      @click="flipCard"
      :data-flashcard-index="flashcardIndex"
    >
      <div class="flashcard-inner">
        <div class="flashcard-front">
          <v-card-title v-if="!shuffled" class="text-center preformatted">
            Card {{ flashcard.cardNumber }}
          </v-card-title>
          <v-card-text>
            <div class="flashcard-content">
              <span class="flashcard-text" v-html="formattedFront"></span>
            </div>
          </v-card-text>
          <v-card-actions class="d-flex justify-center">
            <v-btn
              color="primary"
              variant="outlined"
              @click.stop="flipCard"
              class="mt-2"
            >
              Reveal Answer
            </v-btn>
          </v-card-actions>
        </div>
        <div class="flashcard-back">
          <v-card-title v-if="!shuffled" class="text-center preformatted">
            Card {{ flashcard.cardNumber }}
          </v-card-title>
          <v-card-text>
            <div class="flashcard-content">
              <span class="flashcard-text" v-html="formattedBack"></span>
            </div>
          </v-card-text>
          <v-card-actions class="d-flex justify-space-between">
            <v-btn
              color="primary"
              variant="outlined"
              @click.stop="flipCard"
              class="mt-2"
            >
              Show Question
            </v-btn>
            <div class="d-flex">
              <v-btn
                icon
                color="error"
                variant="text"
                @click.stop="markDifficulty(1)"
                :class="{ 'difficulty-selected': markedDifficulty === 1 }"
              >
                <v-icon>mdi-emoticon-sad-outline</v-icon>
              </v-btn>
              <v-btn
                icon
                color="warning"
                variant="text"
                @click.stop="markDifficulty(2)"
                :class="{ 'difficulty-selected': markedDifficulty === 2 }"
              >
                <v-icon>mdi-emoticon-neutral-outline</v-icon>
              </v-btn>
              <v-btn
                icon
                color="success"
                variant="text"
                @click.stop="markDifficulty(3)"
                :class="{ 'difficulty-selected': markedDifficulty === 3 }"
              >
                <v-icon>mdi-emoticon-happy-outline</v-icon>
              </v-btn>
            </div>
          </v-card-actions>
        </div>
      </div>
    </v-card>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

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

// Format content with line breaks and bold text
const formattedFront = computed(() => {
  return props.flashcard.front
    .replace(/\n/g, '<br><br>')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
});

const formattedBack = computed(() => {
  return props.flashcard.back
    .replace(/\n/g, '<br><br>')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
});

// Flip the card
function flipCard() {
  isFlipped.value = !isFlipped.value;
  if (isFlipped.value) {
    emit("flashcardViewed", props.flashcardIndex);
  }
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
  transition: transform 0.6s;
  transform-style: preserve-3d;
  position: relative;
  min-height: 200px;
  cursor: pointer;
}

.flashcard.flipped {
  transform: rotateY(180deg);
}

.flashcard-inner {
  position: relative;
  width: 100%;
  height: 100%;
  text-align: center;
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

.flashcard-back {
  transform: rotateY(180deg);
}

.flashcard-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 16px;
}

.flashcard-text {
  font-size: 18px;
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