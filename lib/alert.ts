import { Alert as RNAlert, Platform } from 'react-native';

export type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

/**
 * react-native-web ships `Alert.alert` as an empty function, so on web every
 * confirmation and error message in the app silently did nothing. This is a
 * drop-in replacement with the same signature: native keeps the real dialog,
 * web falls back to the browser's own alert/confirm.
 *
 * Import this instead of `Alert` from react-native.
 */
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    if (Platform.OS !== 'web') {
      RNAlert.alert(title, message, buttons);
      return;
    }

    const body = message ? `${title}\n\n${message}` : title;

    // No buttons, or a single acknowledge button: a plain notice.
    const actionable = (buttons ?? []).filter((b) => b.style !== 'cancel');
    if (!buttons || buttons.length === 0 || actionable.length === 0) {
      window.alert(body);
      buttons?.[0]?.onPress?.();
      return;
    }

    if (buttons.length === 1) {
      window.alert(body);
      buttons[0].onPress?.();
      return;
    }

    // Confirm-style: run the first non-cancel action on OK, else the cancel one.
    const confirmButton = actionable[0];
    const cancelButton = buttons.find((b) => b.style === 'cancel');
    const label = confirmButton.text ? `${body}\n\n[OK = ${confirmButton.text}]` : body;

    if (window.confirm(label)) confirmButton.onPress?.();
    else cancelButton?.onPress?.();
  },
};
