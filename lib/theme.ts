// Design tokens and display settings (light/dark theme, text size).
//
// `colors` is updated in place when the theme changes, and styles built with `themed()` (or the
// shared `styles` in styles.ts) are rebuilt, so components pick up the new look on re-render.

import { Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LIGHT = {
  primary: '#2F5BEA',
  primaryDark: '#1E3FB8',
  primarySoft: '#EAF0FF',
  ink: '#0B1220',
  text: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',
  bg: '#F3F5FA',
  card: '#FFFFFF',
  cardAlt: '#EEF1F6',
  border: '#E3E8F2',
  success: '#0F9D6E',
  successSoft: '#DCF7EC',
  warning: '#B45309',
  warningSoft: '#FEF3DC',
  danger: '#C2410C',
  dangerSoft: '#FDE8DF',
  overlay: 'rgba(15, 23, 42, 0.5)',
  white: '#FFFFFF',
};

const DARK: typeof LIGHT = {
  primary: '#5B7FFF',
  primaryDark: '#A9BCFF',
  primarySoft: '#1C2A52',
  ink: '#F1F5F9',
  text: '#CBD5E1',
  muted: '#94A3B8',
  faint: '#64748B',
  bg: '#0B1220',
  card: '#151D30',
  cardAlt: '#1E2840',
  border: '#26324D',
  success: '#34D399',
  successSoft: '#0F3A2E',
  warning: '#FBBF24',
  warningSoft: '#3A2D0E',
  danger: '#FB923C',
  dangerSoft: '#3D2014',
  overlay: 'rgba(0, 0, 0, 0.65)',
  white: '#FFFFFF',
};

export const colors = { ...LIGHT };

export type ThemeMode = 'system' | 'light' | 'dark';
export type TextSize = 'normal' | 'large' | 'xlarge';

const SCALE: Record<TextSize, number> = { normal: 1, large: 1.15, xlarge: 1.3 };
const PREF_KEY = 'groupstay-appearance';

export const appearance = { mode: 'system' as ThemeMode, textSize: 'normal' as TextSize, dark: false, version: 0 };

// Font size scaled by the user's text-size setting.
export const fs = (size: number) => Math.round(size * SCALE[appearance.textSize]);

const listeners = new Set<() => void>();
export function onAppearanceChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function apply() {
  appearance.dark = appearance.mode === 'dark' || (appearance.mode === 'system' && Appearance.getColorScheme() === 'dark');
  Object.assign(colors, appearance.dark ? DARK : LIGHT);
  appearance.version++;
  listeners.forEach((listener) => listener());
}

export async function setAppearance(mode: ThemeMode, textSize: TextSize) {
  appearance.mode = mode;
  appearance.textSize = textSize;
  apply();
  const value = JSON.stringify({ mode, textSize });
  try {
    if (Platform.OS === 'web') localStorage.setItem(PREF_KEY, value);
    else await AsyncStorage.setItem(PREF_KEY, value);
  } catch {}
}

// Loads the saved setting once at startup and follows the phone/computer theme in "system" mode.
export async function loadAppearance() {
  try {
    const raw = Platform.OS === 'web' ? localStorage.getItem(PREF_KEY) : await AsyncStorage.getItem(PREF_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (['system', 'light', 'dark'].includes(saved.mode)) appearance.mode = saved.mode;
      if (saved.textSize in SCALE) appearance.textSize = saved.textSize;
    }
  } catch {}
  apply();
  Appearance.addChangeListener(() => {
    if (appearance.mode === 'system') apply();
  });
}

// Wraps a StyleSheet factory so it's rebuilt whenever the theme or text size changes.
export function themed<T>(factory: () => T): () => T {
  let cached: T | null = null;
  let builtFor = -1;
  return () => {
    if (builtFor !== appearance.version || cached === null) {
      cached = factory();
      builtFor = appearance.version;
    }
    return cached;
  };
}

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };

export const shadow = {
  shadowColor: '#0B1220',
  shadowOpacity: 0.07,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

export const shadowSoft = {
  shadowColor: '#0B1220',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

// Free-to-use Unsplash photos (unsplash.com/license), served straight from Unsplash's CDN.
const unsplash = (id: string, width = 1400) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;

export const photos = {
  lobby: unsplash('photo-1742844552193-2fd3425cd26d'), // sunlit grand hotel lobby
  grandLobby: unsplash('photo-1723516908282-b3c795e9416a'), // luxury lobby with stairs
  friends: unsplash('photo-1529156069898-49953e39b3ac'), // friends sitting together
  room: unsplash('photo-1618773928121-c32242e63f39'), // made hotel bed
  reception: unsplash('photo-1759038085950-1234ca8f5fed'), // hotel reception desk
  conference: unsplash('photo-1606836591695-4d58a73eba1e', 800), // people at an event
};
