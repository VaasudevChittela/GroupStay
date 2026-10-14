import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { formatDateRange, formatTime } from '../lib/format';
import { colors, photos } from '../lib/theme';
import { Guest, GUEST_COLUMNS, PermissionSlip, Profile, Room, ROOM_COLUMNS, Trip, TRIP_COLUMNS } from '../lib/types';
import { Badge, Hero, Page, SmallButton } from '../components/ui';
import Announcements from '../components/Announcements';
import { styles } from '../styles';
import ScheduleScreen from './ScheduleScreen';
import PermissionSlipScreen from './PermissionSlipScreen';

type Child = { guest: Guest; trip: Trip; room: Room | null; roommates: string[]; slip: PermissionSlip | null };

// View-only dashboard for parents and guardians. A student links a parent by adding the
// parent's email under My Info; the parent then sees that student's trip here.
export default function ParentHome({
  profile,
  onBack,
  onLogout,
  onOpenDisplay,
}: {
  profile: Profile;
  onBack: () => void;
  onLogout: () => void;
  onOpenDisplay: () => void;
}) {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<{ kind: 'schedule' | 'slip'; child: Child } | null>(null);

  const load = async () => {
    const { data: links } = await supabase.from('guest_details').select('guest_id').ilike('parent_email', profile.email);
    const ids = (links ?? []).map((l) => l.guest_id);
    if (ids.length === 0) {
      setChildren([]);
      setLoading(false);
      return;
    }
    const { data: guestRows } = await supabase.from('guests').select(GUEST_COLUMNS).in('id', ids);
    const guests = (guestRows ?? []) as Guest[];
    const [{ data: tripRows }, { data: assignments }, { data: slips }] = await Promise.all([
      supabase.from('trips').select(TRIP_COLUMNS).in('id', guests.map((g) => g.trip_id)),
      supabase.from('assignments').select('guest_id, room_id').in('guest_id', ids),
      supabase.from('permission_slips').select('id, guest_id, trip_id, signed_name, signed_email, signed_at').in('guest_id', ids),
    ]);
    const roomIds = (assignments ?? []).map((a) => a.room_id);
    const { data: roomRows } = await supabase.from('rooms').select(ROOM_COLUMNS).in('id', roomIds.length ? roomIds : [-1]);
    const result: Child[] = [];
    for (const guest of guests) {
      const trip = ((tripRows ?? []) as Trip[]).find((t) => t.id === guest.trip_id);
      if (!trip) continue;
      const roomId = (assignments ?? []).find((a) => a.guest_id === guest.id)?.room_id;
      // Roommates' first names only, through a server function (parents can't read the roster).
      const { data: roommates } = await supabase.rpc('roommate_names', { p_guest_id: guest.id });
      result.push({
        guest,
        trip,
        room: ((roomRows ?? []) as Room[]).find((r) => r.id === roomId) ?? null,
        roommates: (roommates as string[] | null) ?? [],
        slip: ((slips ?? []) as PermissionSlip[]).find((s) => s.guest_id === guest.id) ?? null,
      });
    }
    setChildren(result);
    setLoading(false);
  };

  useEffect(() => {
    if (view) return;
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [view]);

  if (view?.kind === 'schedule') return <ScheduleScreen trip={view.child.trip} canEdit={false} onBack={() => setView(null)} />;
  if (view?.kind === 'slip') {
    return <PermissionSlipScreen child={view.child.guest} trip={view.child.trip} slip={view.child.slip} parent={profile} onBack={() => setView(null)} />;
  }

  return (
    <Page
      hero={
        <Hero
          image={photos.friends}
          eyebrow="Parent / guardian"
          title={`Hi, ${profile.full_name.split(' ')[0] || 'there'}`}
          subtitle="Follow your student's trip: their room, the schedule, and updates from the advisor."
          onBack={onBack}
          backLabel="Home"
        />
      }
    >
      {loading ? (
        <Text style={styles.normalText}>Loading...</Text>
      ) : children.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No students linked yet</Text>
          <Text style={styles.cardText}>{`Ask your student to open GroupStay, go to My Info, and add ${profile.email} as their parent email. Their trip will show up here.`}</Text>
        </View>
      ) : (
        children.map((child) => (
          <View key={child.guest.id}>
            <View style={styles.card}>
              <Text style={styles.label}>{child.trip.name}</Text>
              <Text style={[styles.cardTitle, { fontSize: 22 }]}>{child.guest.legal_name}</Text>
              <Text style={styles.cardText}>{`${child.trip.hotel_name} · ${formatDateRange(child.trip.check_in, child.trip.check_out)}`}</Text>
              {child.trip.hotel_address ? <Text style={styles.mutedText}>{child.trip.hotel_address}</Text> : null}
              <Text style={styles.mutedText}>{`Estimated arrival ${formatTime(child.trip.arrival_time)}`}</Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {child.room ? <Badge text={`Room ${child.room.room_number}`} tone="blue" /> : <Badge text="No room yet" tone="amber" />}
                {child.guest.checked_in_at ? <Badge text="Checked in" tone="green" /> : child.room?.ready_at ? <Badge text="Room ready" tone="green" /> : null}
                {child.slip ? <Badge text="Permission slip signed" tone="green" /> : <Badge text="Permission slip needed" tone="amber" />}
              </View>
              {child.roommates.length > 0 && <Text style={styles.mutedText}>{`Roommates: ${child.roommates.join(', ')}`}</Text>}

              <View style={styles.actionRow}>
                {!child.slip && <SmallButton text="Sign Permission Slip" onPress={() => setView({ kind: 'slip', child })} />}
                <SmallButton text="Trip Schedule" secondary onPress={() => setView({ kind: 'schedule', child })} />
                {child.slip && <SmallButton text="View Signed Slip" secondary onPress={() => setView({ kind: 'slip', child })} />}
              </View>
            </View>
            <Announcements tripId={child.trip.id} />
          </View>
        ))
      )}

      <TouchableOpacity style={styles.secondaryButton} onPress={onOpenDisplay}>
        <Text style={styles.secondaryButtonText}>Display Settings</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={onLogout}>
        <Text style={styles.secondaryButtonText}>Log Out</Text>
      </TouchableOpacity>
    </Page>
  );
}
