import { reactive } from 'vue';

export const notifier = reactive({
  show: false,
  message: '',
  color: 'error',
});

export function showNotification(message, color = 'error', timeout = 5000) {
  notifier.message = message || '';
  notifier.color = color || 'error';
  notifier.show = true;

  if (timeout && timeout > 0) {
    setTimeout(() => {
      notifier.show = false;
    }, timeout);
  }
}

export function useNotifier() {
  return { notifier, showNotification };
}
