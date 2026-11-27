<template>
  <v-card elevation="2">
    <v-card-title class="text-h6 text-wrap">
      Chapter {{ pendingItem.chapter }}: {{ chapterName }}
    </v-card-title>
    <v-card-subtitle class="text-wrap">
      Generated {{ generatedAtText }} ({{ pendingItem.trigger }} run) · <code>{{ pendingItem.id }}</code>
    </v-card-subtitle>
    <v-card-text>
      <!-- The editable fields of the question or flashcard -->
      <slot></slot>
      <v-switch
        v-model="isPremium"
        :label="isPremium ? 'Premium (Pro members only)' : 'Free for everyone'"
        color="primary"
        hide-details
      ></v-switch>
      <p v-if="chapterSplitText" class="text-caption">{{ chapterSplitText }}</p>
    </v-card-text>
    <v-card-actions>
      <v-spacer></v-spacer>
      <v-btn
        color="error"
        variant="outlined"
        :loading="isRejecting"
        :disabled="isApproving || isRejecting"
        @click="isRejectDialogOpen = true"
      >
        Reject
      </v-btn>
      <v-btn
        color="success"
        variant="flat"
        :loading="isApproving"
        :disabled="isApproving || isRejecting"
        @click="approve"
      >
        Approve
      </v-btn>
    </v-card-actions>

    <v-dialog v-model="isRejectDialogOpen" max-width="500">
      <v-card>
        <v-card-title>Reject this {{ itemLabel }}?</v-card-title>
        <v-card-text>
          <p class="mb-4">Rejected {{ itemLabel }}s are kept so the generator does not repeat them.</p>
          <v-textarea
            v-model="rejectionReason"
            label="Reason (optional)"
            rows="2"
            auto-grow
            counter="500"
            maxlength="500"
          ></v-textarea>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="isRejectDialogOpen = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="reject">Reject</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import { chapters } from '@/constants/chapters';

// The parts of reviewing a pending AI question or flashcard that don't depend on its fields
const props = defineProps({
  // A pending question or flashcard from the review queue: { id, chapter, generatedAt, trigger, ... }
  pendingItem: {
    type: Object,
    required: true,
  },
  // { humanTotal, humanFree, aiTotal, aiFree } for the item's chapter
  chapterSplit: {
    type: Object,
    default: null,
  },
  // "question" or "flashcard"
  itemLabel: {
    type: String,
    required: true,
  },
  // ({ premium }) => Promise that approves the edited item; the store drops it from the queue, which removes this card
  approvePendingItem: {
    type: Function,
    required: true,
  },
  // ({ rejectionReason }) => Promise that rejects the item
  rejectPendingItem: {
    type: Function,
    required: true,
  },
});

// Premium is the default, like most human content
const isPremium = ref(true);
const isApproving = ref(false);
const isRejecting = ref(false);
const isRejectDialogOpen = ref(false);
const rejectionReason = ref('');

const chapterName = computed(() => chapters.find((chapter) => chapter.id === props.pendingItem.chapter)?.name || '');

const generatedAtText = computed(() => (
  props.pendingItem.generatedAt ? new Date(props.pendingItem.generatedAt).toLocaleString() : '-'
));

const chapterSplitText = computed(() => {
  if (!props.chapterSplit) return '';
  const { humanTotal, humanFree, aiTotal, aiFree } = props.chapterSplit;
  return `Chapter ${props.pendingItem.chapter} today: ${humanFree} of ${humanTotal} human ${props.itemLabel}s free`
    + ` · ${aiFree} of ${aiTotal} AI ${props.itemLabel}s free`;
});

async function approve() {
  isApproving.value = true;
  try {
    await props.approvePendingItem({ premium: isPremium.value });
  } catch {
    // The store already showed the error; the draft stays for another try
  } finally {
    isApproving.value = false;
  }
}

async function reject() {
  isRejectDialogOpen.value = false;
  isRejecting.value = true;
  try {
    await props.rejectPendingItem({ rejectionReason: rejectionReason.value });
  } catch {
    // The store already showed the error
  } finally {
    isRejecting.value = false;
  }
}
</script>
