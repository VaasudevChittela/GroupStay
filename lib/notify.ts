import { supabase } from './supabase';
import { NotificationLink } from './types';

type Audience = 'guest' | 'advisor' | 'staff';

// In-app notifications. Each one targets a single student (audience 'guest'),
// or everyone in the advisor or hotel-staff role for a trip.
// `link` says which screen opens when the notification is tapped.
export async function notify(
  tripId: number,
  audience: Audience,
  title: string,
  body: string,
  guestId: number | null = null,
  link: NotificationLink | null = null,
) {
  await supabase.from('notifications').insert([{ trip_id: tripId, audience, guest_id: guestId, title, body, link }]);
}

export async function notifyGuests(tripId: number, guestIds: number[], title: string, body: string, link: NotificationLink | null = null) {
  if (guestIds.length === 0) return;
  await supabase
    .from('notifications')
    .insert(guestIds.map((guestId) => ({ trip_id: tripId, audience: 'guest', guest_id: guestId, title, body, link })));
}

export type NotificationScope =
  | { audience: 'guest'; guestId: number }
  | { audience: 'advisor' | 'staff'; tripIds: number[] };

export function notificationQuery(scope: NotificationScope) {
  const query = supabase.from('notifications').select('id, trip_id, audience, guest_id, title, body, created_at, read_at, link');
  if (scope.audience === 'guest') {
    return query.eq('audience', 'guest').eq('guest_id', scope.guestId);
  }
  return query.eq('audience', scope.audience).in('trip_id', scope.tripIds.length ? scope.tripIds : [-1]);
}

export async function countUnread(scope: NotificationScope) {
  const { data } = await notificationQuery(scope).is('read_at', null);
  return data?.length ?? 0;
}
