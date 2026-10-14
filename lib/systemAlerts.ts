// Phone / browser pop-up alerts for new in-app notifications.
//
// While the app is open, new notifications pop up as system alerts (browser Notification API on
// web, a local notification on phones). Alerts while the app is closed need real push, which runs
// on the server: see supabase/functions/send-notification. This file also registers the phone's
// push token so that function can reach it.

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { notificationQuery, NotificationScope } from './notify';

const PREF_KEY = 'groupstay-alerts-enabled';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export function alertsSupported() {
  if (Platform.OS !== 'web') return true;
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function alertsEnabled() {
  if (Platform.OS === 'web') {
    if (!alertsSupported()) return false;
    try {
      return Notification.permission === 'granted' && localStorage.getItem(PREF_KEY) !== 'off';
    } catch {
      return false;
    }
  }
  return true; // Phones: the OS permission prompt is the switch.
}

export async function enableAlerts(userId: string) {
  if (Platform.OS === 'web') {
    if (!alertsSupported()) return false;
    const permission = await Notification.requestPermission();
    try {
      localStorage.setItem(PREF_KEY, permission === 'granted' ? 'on' : 'off');
    } catch {}
    return permission === 'granted';
  }
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;
  await registerPushToken(userId);
  return true;
}

// Saves this phone's Expo push token so the server can send alerts when the app is closed.
// Needs an EAS project id (run `eas init`); without one this quietly does nothing.
async function registerPushToken(userId: string) {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').upsert([{ user_id: userId, token, platform: Platform.OS }], { onConflict: 'token' });
  } catch {
    // Expo Go on Android can't get push tokens; local alerts still work.
  }
}

function popUp(title: string, body: string) {
  if (Platform.OS === 'web') {
    if (alertsEnabled()) new Notification(title, { body });
    return;
  }
  Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null }).catch(() => {});
}

// Watches for new notifications in `scope` and pops each new one up once.
export function useSystemAlerts(scope: NotificationScope | null) {
  const seen = useRef<Set<number> | null>(null);
  const key = scope ? JSON.stringify(scope) : '';

  useEffect(() => {
    if (!scope) return;
    seen.current = null;
    const check = async () => {
      const { data } = await notificationQuery(scope).is('read_at', null);
      const rows = data ?? [];
      if (seen.current === null) {
        // First load: remember what's already there instead of popping it all up.
        seen.current = new Set(rows.map((row) => row.id));
        return;
      }
      for (const row of rows) {
        if (!seen.current.has(row.id)) {
          seen.current.add(row.id);
          popUp(row.title, row.body);
        }
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [key]);
}
