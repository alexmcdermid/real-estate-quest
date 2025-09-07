import { reactive } from 'vue';

export const notifier = reactive({
  show: false,
  message: '',
  color: 'error',
  timeout: 5000,
});

export function showNotification(message, color = 'error', timeout = 5000) {
  notifier.message = message || '';
  notifier.color = color || 'error';
  notifier.show = true;
  notifier.timeout = timeout || 5000;

  if (timeout && timeout > 0) {
    setTimeout(() => {
      notifier.show = false;
    }, timeout);
  }
}

export function useNotifier() {
  return { notifier, showNotification };
}
