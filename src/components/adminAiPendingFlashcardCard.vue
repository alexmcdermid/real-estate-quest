<template>
  <AdminAiPendingReviewCard
    :pendingItem="pendingFlashcard"
    :chapterSplit="chapterSplit"
    itemLabel="flashcard"
    :approvePendingItem="approve"
    :rejectPendingItem="reject"
  >
    <!-- Counters show the server's limits -->
    <v-textarea v-model="draft.front" label="Front" rows="1" auto-grow counter="100" density="compact"></v-textarea>
    <v-textarea v-model="draft.back" label="Back" rows="3" auto-grow counter="600" density="compact"></v-textarea>
    <v-text-field
      v-model="draft.tagsText"
      label="Tags"
      hint="Comma-separated, 1 to 5 tags"
      persistent-hint
      density="compact"
    ></v-text-field>
    <v-select
      v-model="draft.difficulty"
      :items="difficultyOptions"
      label="Difficulty"
      density="compact"
      class="mt-4"
    ></v-select>
  </AdminAiPendingReviewCard>
</template>

<script setup>
import { reactive } from 'vue';
import { useAdminStore } from '@/composables/useAdmin';
import AdminAiPendingReviewCard from './adminAiPendingReviewCard.vue';

const props = defineProps({
  pendingFlashcard: {
    type: Object,
    required: true,
  },
  // { humanTotal, humanFree, aiTotal, aiFree } for the flashcard's chapter
  chapterSplit: {
    type: Object,
    default: null,
  },
});

const adminStore = useAdminStore();

// Same scale as the human flashcards and the generator's prompt
const difficultyOptions = [
  { title: '1 - Basic term', value: 1 },
  { title: '2 - Standard', value: 2 },
  { title: '3 - Nuanced', value: 3 },
];

// The reviewer edits a copy
const draft = reactive({
  front: props.pendingFlashcard.front,
  back: props.pendingFlashcard.back,
  tagsText: props.pendingFlashcard.tags.join(', '),
  difficulty: props.pendingFlashcard.difficulty,
});

function approve({ premium }) {
  return adminStore.approveAiFlashcard({
    pendingFlashcardId: props.pendingFlashcard.id,
    editedFlashcard: {
      front: draft.front,
      back: draft.back,
      // Empty pieces from stray commas are dropped; the server trims, lowercases and dedupes the rest
      tags: draft.tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
      difficulty: draft.difficulty,
    },
    premium,
  });
}

function reject({ rejectionReason }) {
  return adminStore.rejectAiFlashcard({
    pendingFlashcardId: props.pendingFlashcard.id,
    rejectionReason,
  });
}
</script>
