// Cross-platform alerts. React Native's Alert.alert does nothing on web, so every
// pop-up in the app goes through here and is rendered by <AlertHost /> in App.tsx.

export type AlertButton = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
export type AlertRequest = { id: number; title: string; message?: string; buttons: AlertButton[] };

type Listener = (alert: AlertRequest) => void;

let nextId = 1;
const listeners = new Set<Listener>();

export function subscribeToAlerts(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const request: AlertRequest = {
    id: nextId++,
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
  };
  listeners.forEach((listener) => listener(request));
}

export function confirmAction(title: string, message: string, confirmText = 'OK'): Promise<boolean> {
  return new Promise((resolve) => {
    showAlert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, onPress: () => resolve(true) },
    ]);
  });
}

// Supabase errors are objects; show their message instead of raw JSON.
export function errorMessage(error: unknown) {
  if (!error) return 'Something went wrong.';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error && 'message' in error) return String((error as { message: unknown }).message);
  return JSON.stringify(error);
}
