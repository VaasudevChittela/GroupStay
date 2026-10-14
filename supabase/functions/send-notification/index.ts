// Supabase Edge Function: sends an email and a phone push for each new row in public.notifications.
//
// Setup (once Supabase is back):
//   1. supabase functions deploy send-notification
//   2. supabase secrets set RESEND_API_KEY=... ALERT_FROM_EMAIL="GroupStay <alerts@yourdomain.com>"
//      (free Resend account at resend.com; the from-domain must be verified there)
//   3. Dashboard -> Database -> Webhooks: on INSERT into public.notifications, call this function.
// Push needs the app built with an EAS project id so phones register tokens (see lib/systemAlerts.ts).

import { createClient } from 'npm:@supabase/supabase-js@2';

type NotificationRow = {
  id: number;
  trip_id: number;
  audience: 'guest' | 'advisor' | 'staff';
  guest_id: number | null;
  title: string;
  body: string;
  link: string | null;
};

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function recipients(row: NotificationRow) {
  const emails = new Set<string>();
  const userIds = new Set<string>();

  if (row.audience === 'guest' && row.guest_id) {
    const { data: guest } = await admin.from('guests').select('email, user_id').eq('id', row.guest_id).maybeSingle();
    if (guest?.email) emails.add(guest.email);
    if (guest?.user_id) userIds.add(guest.user_id);
  }

  const { data: trip } = await admin.from('trips').select('advisor_id, hotel_email').eq('id', row.trip_id).maybeSingle();
  if (row.audience === 'staff' && trip?.hotel_email) {
    emails.add(trip.hotel_email);
  }
  if (row.audience === 'advisor' && trip) {
    if (trip.advisor_id) {
      userIds.add(trip.advisor_id);
      const { data } = await admin.auth.admin.getUserById(trip.advisor_id);
      if (data.user?.email) emails.add(data.user.email);
    }
    const { data: coAdvisors } = await admin.from('trip_advisors').select('email').eq('trip_id', row.trip_id);
    coAdvisors?.forEach((a) => emails.add(a.email));
  }

  return { emails: [...emails], userIds: [...userIds] };
}

async function sendEmail(to: string[], subject: string, text: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('ALERT_FROM_EMAIL');
  if (!key || !from || to.length === 0) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: `GroupStay: ${subject}`, text }),
  });
}

async function sendPush(userIds: string[], title: string, body: string, link: string | null) {
  if (userIds.length === 0) return;
  const { data: tokens } = await admin.from('push_tokens').select('token').in('user_id', userIds);
  if (!tokens?.length) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokens.map(({ token }) => ({ to: token, title, body, data: { link } }))),
  });
}

Deno.serve(async (req) => {
  const payload = await req.json();
  const row = payload.record as NotificationRow | undefined;
  if (!row) return new Response('no record', { status: 400 });

  const { emails, userIds } = await recipients(row);
  await Promise.all([sendEmail(emails, row.title, row.body), sendPush(userIds, row.title, row.body, row.link)]);
  return new Response(JSON.stringify({ emails: emails.length, users: userIds.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
