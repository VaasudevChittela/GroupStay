import { Platform } from 'react-native';
import { supabase } from './supabase';
import { isDemoMode } from './demo';
import { formatDate } from './dates';

/**
 * The eleven things GroupStay tells people about.
 *
 * Two delivery paths, chosen per event:
 *  - Scheduled locally on the device when the moment is known in advance and
 *    needs no server (reminders, key expiry). These fire even offline.
 *  - Queued in the `notifications` table and pushed by the send-push edge
 *    function when the trigger is somebody else's action.
 */
export type NotificationType =
  | 'room_assigned'
  | 'room_changed'
  | 'check_in_reminder'
  | 'check_in_complete'
  | 'room_ready'
  | 'key_issued'
  | 'key_expiring'
  | 'room_request'
  | 'maintenance_update'
  | 'announcement'
  | 'checkout_reminder';

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  room_id: string | null;
};

export const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  room_assigned: 'Room assigned',
  room_changed: 'Room changed',
  check_in_reminder: 'Check-in reminder',
  check_in_complete: 'Checked in',
  room_ready: 'Room ready',
  key_issued: 'Digital key issued',
  key_expiring: 'Key expiring',
  room_request: 'New room request',
  maintenance_update: 'Maintenance update',
  announcement: 'Announcement',
  checkout_reminder: 'Checkout reminder',
};

/** Who each event is aimed at — used to pick recipients when queueing. */
export const NOTIFICATION_AUDIENCE: Record<NotificationType, 'guest' | 'staff'> = {
  room_assigned: 'guest',
  room_changed: 'guest',
  check_in_reminder: 'guest',
  check_in_complete: 'guest',
  room_ready: 'guest',
  key_issued: 'guest',
  key_expiring: 'guest',
  room_request: 'staff',
  maintenance_update: 'staff',
  announcement: 'guest',
  checkout_reminder: 'guest',
};

const err = (e: unknown): string =>
  typeof e === 'string' ? e : e instanceof Error ? e.message : JSON.stringify(e);

// ---------------------------------------------------------------------------
// expo-notifications is loaded lazily. It is unavailable on web and inside
// Expo Go on Android (SDK 53+ dropped remote push there), so every call site
// has to tolerate it being absent rather than crashing the screen.
// ---------------------------------------------------------------------------
type ExpoNotifications = typeof import('expo-notifications');

let cached: ExpoNotifications | null | undefined;

function notifications(): ExpoNotifications | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web') {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-notifications') as ExpoNotifications;
    cached.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch {
    cached = null;
  }
  return cached;
}

export const pushSupported = (): boolean => notifications() != null;

/**
 * Ask for permission and register this device. Safe to call on every launch —
 * the token row is keyed on the token itself.
 */
export async function registerForPush(): Promise<{ token: string | null; error: string | null }> {
  const N = notifications();
  if (!N) return { token: null, error: 'Push notifications are not available on this platform.' };

  const existing = await N.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    granted = (await N.requestPermissionsAsync()).granted;
  }
  if (!granted) return { token: null, error: 'Notifications are turned off for GroupStay.' };

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('default', {
      name: 'GroupStay',
      importance: N.AndroidImportance.DEFAULT,
    });
  }

  let token: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId ?? undefined;
    token = (await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  } catch (e) {
    return { token: null, error: err(e) };
  }

  if (isDemoMode()) return { token, error: null };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return { token, error: null };

  await supabase
    .from('device_tokens')
    .upsert([{ user_id: userId, token, platform: Platform.OS, last_seen_at: new Date().toISOString() }], {
      onConflict: 'token',
    });

  return { token, error: null };
}

// ---------------------------------------------------------------------------
// Locally scheduled reminders — no server needed, and they still fire offline.
// ---------------------------------------------------------------------------

const at = (iso: string, hour: number, minute = 0): Date | null => {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hour, minute, 0, 0);
};

async function scheduleAt(
  id: string,
  when: Date | null,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const N = notifications();
  if (!N || !when || when.getTime() <= Date.now()) return;

  await N.scheduleNotificationAsync({
    identifier: id,
    content: { title, body, data },
    trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: when },
  });
}

/**
 * (Re)schedule the whole set of reminders for a stay. Cancels the previous set
 * first, so a room move or an extended checkout doesn't leave stale alerts.
 */
export async function scheduleStayReminders(params: {
  guestId: string;
  hotelName: string;
  roomNumber: string | null;
  checkIn: string | null;
  checkOut: string | null;
  keyValidUntil?: string | null;
}): Promise<void> {
  const N = notifications();
  if (!N) return;

  const ids = [
    `checkin-${params.guestId}`,
    `checkout-${params.guestId}`,
    `keyexp-${params.guestId}`,
  ];
  await Promise.all(ids.map((id) => N.cancelScheduledNotificationAsync(id).catch(() => undefined)));

  if (params.checkIn) {
    await scheduleAt(
      ids[0],
      at(params.checkIn, 9),
      'Check in today',
      `${params.hotelName} is expecting you today. Your digital key activates at the front desk.`,
      { type: 'check_in_reminder' },
    );
  }

  if (params.checkOut) {
    await scheduleAt(
      ids[1],
      at(params.checkOut, 9),
      'Checkout today',
      params.roomNumber
        ? `Room ${params.roomNumber} checks out today. Your key stops working at noon.`
        : 'You check out today.',
      { type: 'checkout_reminder' },
    );

    const expiry = params.keyValidUntil ? new Date(params.keyValidUntil) : at(params.checkOut, 12);
    if (expiry) {
      const warn = new Date(expiry.getTime() - 60 * 60 * 1000); // one hour before
      await scheduleAt(
        ids[2],
        warn,
        'Room key expiring',
        `Your key for ${params.roomNumber ? `Room ${params.roomNumber}` : 'your room'} expires at ${expiry.toLocaleTimeString(
          [],
          { hour: 'numeric', minute: '2-digit' },
        )}.`,
        { type: 'key_expiring' },
      );
    }
  }
}

export async function cancelStayReminders(guestId: string): Promise<void> {
  const N = notifications();
  if (!N) return;
  await Promise.all(
    [`checkin-${guestId}`, `checkout-${guestId}`, `keyexp-${guestId}`].map((id) =>
      N.cancelScheduledNotificationAsync(id).catch(() => undefined),
    ),
  );
}

// ---------------------------------------------------------------------------
// Server-delivered events — queued here, pushed by the send-push function.
// ---------------------------------------------------------------------------

type NotifyInput = {
  type: NotificationType;
  tripId: string;
  guestId?: string | null;
  roomId?: string | null;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
};

/** Default wording per event, so call sites only pass what's specific. */
function compose(type: NotificationType, ctx: Record<string, string | null | undefined>) {
  const room = ctx.roomNumber ? `Room ${ctx.roomNumber}` : 'your room';
  switch (type) {
    case 'room_assigned':
      return { title: 'Room assigned', body: `You're in ${room} at ${ctx.hotelName ?? 'the hotel'}.` };
    case 'room_changed':
      return { title: 'Room changed', body: `You've been moved to ${room}. Your digital key moved with you.` };
    case 'check_in_complete':
      return { title: 'Checked in', body: `Welcome. ${room} is yours until ${formatDate(ctx.checkOut)}.` };
    case 'room_ready':
      return { title: 'Room ready', body: `${room} is clean and ready for you.` };
    case 'key_issued':
      return { title: 'Digital key ready', body: `Your key for ${room} is active. Open GroupStay to use it.` };
    case 'room_request':
      return { title: 'New room request', body: `${ctx.guestName ?? 'A guest'} requested ${ctx.detail ?? 'assistance'} in ${room}.` };
    case 'maintenance_update':
      return { title: 'Maintenance update', body: `${room}: ${ctx.detail ?? 'status updated'}.` };
    case 'announcement':
      return { title: ctx.title ?? 'Announcement', body: ctx.detail ?? '' };
    case 'check_in_reminder':
      return { title: 'Check in today', body: `${ctx.hotelName ?? 'Your hotel'} is expecting you today.` };
    case 'key_expiring':
      return { title: 'Room key expiring', body: `Your key for ${room} expires soon.` };
    case 'checkout_reminder':
      return { title: 'Checkout today', body: `${room} checks out today.` };
    default:
      return { title: NOTIFICATION_LABEL[type], body: '' };
  }
}

/**
 * Queue a notification. Delivery is the send-push function's job; writing the
 * row is what makes it appear in the in-app list either way, so a failed push
 * never means a silently lost message.
 */
export async function notify(
  input: NotifyInput & { context?: Record<string, string | null | undefined> },
): Promise<string | null> {
  if (isDemoMode()) return null;

  const composed = compose(input.type, input.context ?? {});
  const title = input.title ?? composed.title;
  const body = input.body ?? composed.body;

  // Aim it at the account behind the guest, when there is one.
  let userId: string | null = null;
  if (input.guestId) {
    const { data } = await supabase.from('guests').select('user_id').eq('id', input.guestId).maybeSingle();
    userId = (data?.user_id as string) ?? null;
  }

  const { error } = await supabase.from('notifications').insert([
    {
      user_id: userId,
      guest_id: input.guestId ?? null,
      trip_id: input.tripId,
      room_id: input.roomId ?? null,
      type: input.type,
      title,
      body,
      data: input.data ?? {},
    },
  ]);
  if (error) return err(error);

  // Best effort: ask the edge function to flush the queue now rather than
  // waiting for its schedule. A failure here is not a failure to notify.
  supabase.functions.invoke('send-push', { body: { trip_id: input.tripId } }).catch(() => undefined);
  return null;
}

/**
 * Send an announcement to everyone on a trip. One row per guest rather than a
 * broadcast row, so each person's read state is their own and the inbox stays
 * per-guest.
 */
export async function announce(params: {
  tripId: string;
  title: string;
  message: string;
}): Promise<{ sent: number; error: string | null }> {
  if (isDemoMode()) return { sent: 0, error: null };

  const { data: guests, error } = await supabase
    .from('guests')
    .select('id, user_id')
    .eq('trip_id', params.tripId);
  if (error) return { sent: 0, error: err(error) };

  const rows = (guests ?? []).map((g: any) => ({
    user_id: g.user_id ?? null,
    guest_id: g.id,
    trip_id: params.tripId,
    type: 'announcement' as const,
    title: params.title.trim(),
    body: params.message.trim(),
    data: {},
  }));
  if (!rows.length) return { sent: 0, error: null };

  const { error: insertError } = await supabase.from('notifications').insert(rows);
  if (insertError) return { sent: 0, error: err(insertError) };

  supabase.functions.invoke('send-push', { body: { trip_id: params.tripId } }).catch(() => undefined);
  return { sent: rows.length, error: null };
}

export async function loadNotifications(limit = 50): Promise<NotificationRow[]> {
  if (isDemoMode()) return [];
  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, body, data, read_at, created_at, room_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as NotificationRow[];
}

export async function markNotificationRead(id: string): Promise<void> {
  if (isDemoMode()) return;
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
}
