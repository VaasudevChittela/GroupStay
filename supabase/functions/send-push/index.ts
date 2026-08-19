/**
 * send-push — flushes queued notifications to devices via the Expo Push API.
 *
 * The app writes rows into `notifications` and calls this to drain the queue.
 * Splitting it this way means a push failure never loses the message: the row
 * is already there and shows up in the in-app list regardless.
 *
 * Deploy:
 *   supabase functions deploy send-push
 *   supabase secrets set SERVICE_ROLE_KEY=<service role key>
 *
 * Optionally schedule it (pg_cron or an external scheduler) every minute to
 * catch anything the client-side invoke missed.
 */

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type NotificationRow = {
  id: string;
  user_id: string | null;
  trip_id: string | null;
  title: string;
  body: string;
  data: Record<string, unknown>;
  type: string;
};

/**
 * Events aimed at the front desk rather than a guest. These arrive with no
 * user_id — the app cannot read other people's profiles to address them, so
 * recipients are resolved here, where the service role can.
 */
const STAFF_EVENTS = new Set(['room_request', 'maintenance_update']);

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
    });
  }

  try {
    // Anything queued but not yet delivered. Capped so one bad batch can't
    // stall the queue forever.
    const pending: NotificationRow[] = await (
      await rest(
        'notifications?sent_at=is.null&order=created_at.asc&limit=200&select=id,user_id,trip_id,title,body,data,type',
      )
    ).json();

    if (!pending.length) {
      return Response.json({ sent: 0, skipped: 0 });
    }

    // Staff-facing rows fan out to every staff account at the property the
    // trip belongs to.
    const staffTripIds = [
      ...new Set(pending.filter((n) => !n.user_id && STAFF_EVENTS.has(n.type) && n.trip_id).map((n) => n.trip_id!)),
    ];

    const staffByTrip = new Map<string, string[]>();
    if (staffTripIds.length) {
      const trips: { id: string; hotel_id: string | null }[] = await (
        await rest(`trips?id=in.(${staffTripIds.join(',')})&select=id,hotel_id`)
      ).json();

      const hotelIds = [...new Set(trips.map((t) => t.hotel_id).filter(Boolean))] as string[];
      const staff: { id: string; hotel_id: string }[] = hotelIds.length
        ? await (
            await rest(`profiles?hotel_id=in.(${hotelIds.join(',')})&role=eq.hotel_staff&select=id,hotel_id`)
          ).json()
        : [];

      trips.forEach((trip) => {
        if (!trip.hotel_id) return;
        staffByTrip.set(
          trip.id,
          staff.filter((p) => p.hotel_id === trip.hotel_id).map((p) => p.id),
        );
      });
    }

    const userIds = [
      ...new Set([
        ...pending.map((n) => n.user_id).filter(Boolean),
        ...[...staffByTrip.values()].flat(),
      ]),
    ] as string[];

    const tokens: { user_id: string; token: string }[] = userIds.length
      ? await (await rest(`device_tokens?user_id=in.(${userIds.join(',')})&select=user_id,token`)).json()
      : [];

    const byUser = new Map<string, string[]>();
    tokens.forEach((t) => {
      byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token]);
    });

    const messages: Record<string, unknown>[] = [];
    const delivered: string[] = [];
    const undeliverable: string[] = [];

    for (const n of pending) {
      const recipients = n.user_id
        ? [n.user_id]
        : STAFF_EVENTS.has(n.type) && n.trip_id
          ? staffByTrip.get(n.trip_id) ?? []
          : [];
      const targets = [...new Set(recipients.flatMap((id) => byUser.get(id) ?? []))];
      if (!targets.length) {
        // Nobody to push to — still mark it handled so it stops being retried.
        // The row remains readable in the app's notification list.
        undeliverable.push(n.id);
        continue;
      }
      targets.forEach((to) => {
        messages.push({
          to,
          title: n.title,
          body: n.body,
          sound: 'default',
          data: { ...n.data, type: n.type, notificationId: n.id },
        });
      });
      delivered.push(n.id);
    }

    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        console.error('Expo push rejected a batch', res.status, await res.text());
      }
    }

    const stamp = new Date().toISOString();
    const handled = [...delivered, ...undeliverable];
    if (handled.length) {
      await rest(`notifications?id=in.(${handled.join(',')})`, {
        method: 'PATCH',
        body: JSON.stringify({ sent_at: stamp }),
      });
    }

    return Response.json({
      sent: delivered.length,
      skipped: undeliverable.length,
      devices: messages.length,
    });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
