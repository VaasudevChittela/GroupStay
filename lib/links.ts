import { Platform } from 'react-native';

// Where the app lives. Set EXPO_PUBLIC_APP_URL once it's published (e.g. https://app.groupstay.com);
// until then the web app's own address is used.
function appUrl() {
  if (process.env.EXPO_PUBLIC_APP_URL) return process.env.EXPO_PUBLIC_APP_URL.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:8081';
}

export const joinLink = (code: string) => `${appUrl()}/?join=${encodeURIComponent(code)}`;

// On web, a join link opens the app with ?join=CODE. Reads it once and tidies the address bar.
export function takeJoinCodeFromUrl(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('join');
  if (!code) return null;
  params.delete('join');
  const rest = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
  return code.trim().toUpperCase();
}
