import { ref } from 'vue';

export const rateLimitBanner = ref(false);

export function showRateLimitBanner() {
  rateLimitBanner.value = true;
}

export function hideRateLimitBanner() {
  rateLimitBanner.value = false;
}
