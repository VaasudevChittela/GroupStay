import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { countUnread, notify, notifyGuests } from '../lib/notify';
import { useSystemAlerts } from '../lib/systemAlerts';
import { applyLockDeadline } from '../lib/rooms';
import { exportManifestCsv, printManifest } from '../lib/manifest';
import { formatDateRange, formatTime, timeAgo } from '../lib/format';
import { NotificationLink, Profile, Room, ROOM_COLUMNS, Trip, TRIP_COLUMNS } from '../lib/types';
import { BackButton, Badge, Hero, Page, SmallButton } from '../components/ui';
import { Ionicons } from '@expo/vector-icons';
import { colors, photos } from '../lib/theme';
import { styles } from '../styles';
import RoomInventoryScreen from './RoomInventoryScreen';
import NotificationsScreen from './NotificationsScreen';
import CheckInScreen from './CheckInScreen';
import StaffReportsScreen from './StaffReportsScreen';

type TripSummary = Trip & { roomCount: number; readyCount: number; guestCount: number; checkedInCount: number };
type TripView = 'manifest' | 'checkin';

// Schools arriving earliest come first so the hotel preps rooms in arrival order.
const byArrival = (a: Trip, b: Trip) =>
  (a.check_in ?? '').localeCompare(b.check_in ?? '') || (a.arrival_time ?? '99:99').localeCompare(b.arrival_time ?? '99:99');

const STAFF_LINKS: NotificationLink[] = ['manifest', 'checkin'];

export default function StaffHome({ profile, onBack, onLogout, onOpenDisplay }: { profile: Profile; onBack: () => void; onLogout: () => void; onOpenDisplay: () => void }) {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [open, setOpen] = useState<{ tripId: number; view: TripView } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  // Hotel staff see exactly the trips booked under their login email.
  const load = async () => {
    const { data: hotelTrips } = await supabase.from('trips').select(TRIP_COLUMNS).ilike('hotel_email', profile.email);
    let list = (hotelTrips ?? []) as Trip[];
    const overdue = list.filter((t) => !t.locked_at && t.lock_deadline && new Date(t.lock_deadline).getTime() <= Date.now());
    if (overdue.length) {
      await Promise.all(overdue.map((t) => applyLockDeadline(t.id)));
      const { data: fresh } = await supabase.from('trips').select(TRIP_COLUMNS).ilike('hotel_email', profile.email);
      list = (fresh ?? []) as Trip[];
    }
    const ids = list.map((t) => t.id);
    const [{ data: roomRows }, { data: guestRows }, unreadCount] = await Promise.all([
      supabase.from('rooms').select('trip_id, ready_at').in('trip_id', ids.length ? ids : [-1]),
      supabase.from('guests').select('trip_id, checked_in_at').in('trip_id', ids.length ? ids : [-1]),
      countUnread({ audience: 'staff', tripIds: ids }),
    ]);
    setTrips(
      list.sort(byArrival).map((trip) => ({
        ...trip,
        roomCount: (roomRows ?? []).filter((r) => r.trip_id === trip.id).length,
        readyCount: (roomRows ?? []).filter((r) => r.trip_id === trip.id && r.ready_at).length,
        guestCount: (guestRows ?? []).filter((g) => g.trip_id === trip.id).length,
        checkedInCount: (guestRows ?? []).filter((g) => g.trip_id === trip.id && g.checked_in_at).length,
      })),
    );
    setUnread(unreadCount);
    setLoading(false);
  };

  useSystemAlerts(trips.length ? { audience: 'staff', tripIds: trips.map((t) => t.id) } : null);

  useEffect(() => {
    if (open || showNotifications) return;
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [open, showNotifications]);

  const openTrip = trips.find((trip) => trip.id === open?.tripId);
  if (openTrip && open) return <StaffTrip trip={openTrip} initialView={open.view} onBack={() => setOpen(null)} />;
  if (showReports) return <StaffReportsScreen trips={trips} onBack={() => setShowReports(false)} />;
  if (showNotifications) {
    return (
      <NotificationsScreen
        scope={{ audience: 'staff', tripIds: trips.map((t) => t.id) }}
        userId={profile.id}
        onBack={() => setShowNotifications(false)}
        openable={STAFF_LINKS}
        onOpen={(link, item) => {
          setShowNotifications(false);
          setOpen({ tripId: item.trip_id, view: link === 'checkin' ? 'checkin' : 'manifest' });
        }}
      />
    );
  }

  return (
    <Page
      hero={
        <Hero image={photos.reception} eyebrow={profile.email} title="Hotel Dashboard" subtitle="Groups are listed in arrival order." onBack={onBack} backLabel="Home" height={230} />
      }
    >
      <TouchableOpacity style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]} onPress={() => setShowNotifications(true)} activeOpacity={0.85}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#DB277718', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="notifications-outline" size={20} color="#DB2777" />
        </View>
        <Text style={[styles.cardTitle, { flex: 1, marginBottom: 0 }]}>Notifications</Text>
        {unread ? <Badge text={`${unread} new`} tone="blue" /> : <Ionicons name="chevron-forward" size={18} color={colors.faint} />}
      </TouchableOpacity>

      <TouchableOpacity style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]} onPress={() => setShowReports(true)} activeOpacity={0.85}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="bar-chart-outline" size={20} color={colors.primary} />
        </View>
        <Text style={[styles.cardTitle, { flex: 1, marginBottom: 0 }]}>Reports</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.faint} />
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Upcoming groups</Text>

      {loading ? (
        <Text style={styles.normalText}>Loading...</Text>
      ) : trips.length === 0 ? (
        <Text style={styles.normalText}>{`No trips are booked under ${profile.email} yet. Ask the group's advisor to set this as the hotel contact email in Trip Settings.`}</Text>
      ) : (
        trips.map((trip) => (
          <TouchableOpacity key={trip.id} style={styles.card} onPress={() => setOpen({ tripId: trip.id, view: 'manifest' })}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{trip.school ?? trip.name}</Text>
              {trip.manifest_sent_at ? <Badge text="Manifest received" tone="green" /> : <Badge text="Rooms not locked yet" tone="amber" />}
            </View>
            <Text style={styles.cardText}>{`${trip.name} · ${formatDateRange(trip.check_in, trip.check_out)}`}</Text>
            <Text style={styles.cardText}>{`Arrives ${formatTime(trip.arrival_time)} · ${trip.guestCount} of ${trip.headcount ?? '?'} guests signed up`}</Text>
            <Text style={styles.mutedText}>{`${trip.readyCount} of ${trip.roomCount} rooms ready · ${trip.checkedInCount} of ${trip.guestCount} checked in`}</Text>
          </TouchableOpacity>
        ))
      )}

      <TouchableOpacity style={styles.secondaryButton} onPress={onOpenDisplay}>
        <Text style={styles.secondaryButtonText}>Display Settings</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={onLogout}>
        <Text style={styles.secondaryButtonText}>Log Out</Text>
      </TouchableOpacity>
    </Page>
  );
}

type ManifestRoom = Room & { occupants: Array<{ id: number; legal_name: string; is_chaperone: boolean }> };

function StaffTrip({ trip: initialTrip, initialView, onBack }: { trip: Trip; initialView: TripView; onBack: () => void }) {
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [rooms, setRooms] = useState<ManifestRoom[]>([]);
  const [unassigned, setUnassigned] = useState(0);
  const [guestCount, setGuestCount] = useState(0);
  const [showInventory, setShowInventory] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(initialView === 'checkin');
  const [busyRoom, setBusyRoom] = useState<number | null>(null);

  const load = async () => {
    const [{ data: tripRow }, { data: roomRows }, { data: guestRows }, { data: assignmentRows }] = await Promise.all([
      supabase.from('trips').select(TRIP_COLUMNS).eq('id', initialTrip.id).maybeSingle(),
      supabase.from('rooms').select(ROOM_COLUMNS).eq('trip_id', initialTrip.id).order('room_number', { ascending: true }),
      supabase.from('guests').select('id, legal_name, is_chaperone').eq('trip_id', initialTrip.id).order('legal_name', { ascending: true }),
      supabase.from('assignments').select('guest_id, room_id').eq('trip_id', initialTrip.id),
    ]);
    if (tripRow) setTrip(tripRow as Trip);
    const roomOf = new Map((assignmentRows ?? []).map((row) => [row.guest_id, row.room_id]));
    setRooms(
      ((roomRows ?? []) as Room[]).map((room) => ({
        ...room,
        occupants: (guestRows ?? []).filter((guest) => roomOf.get(guest.id) === room.id),
      })),
    );
    setUnassigned((guestRows ?? []).filter((guest) => !roomOf.has(guest.id)).length);
    setGuestCount(guestRows?.length ?? 0);
  };

  useEffect(() => {
    if (showInventory || showCheckIn) return;
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [showInventory, showCheckIn]);

  if (showInventory) return <RoomInventoryScreen trip={trip} role="staff" onBack={() => setShowInventory(false)} />;
  if (showCheckIn) return <CheckInScreen trip={trip} role="staff" onBack={() => setShowCheckIn(false)} />;

  const setReady = async (room: ManifestRoom, ready: boolean) => {
    setBusyRoom(room.id);
    const { error } = await supabase.from('rooms').update({ ready_at: ready ? new Date().toISOString() : null }).eq('id', room.id);
    if (error) {
      setBusyRoom(null);
      showAlert('Error', errorMessage(error));
      return;
    }
    if (ready) {
      await notifyGuests(trip.id, room.occupants.map((g) => g.id), 'Your room is ready', `Room ${room.room_number} at ${trip.hotel_name} is ready. Head to the front desk.`, 'rooms');
      await notify(trip.id, 'advisor', 'Room ready', `Room ${room.room_number} is ready for ${room.occupants.map((g) => g.legal_name).join(', ') || 'your group'}.`, null, 'checkin');
    }
    setBusyRoom(null);
    await load();
  };

  const manifestReady = Boolean(trip.manifest_sent_at);
  const totalBeds = rooms.reduce((sum, room) => sum + room.capacity, 0);
  const people = Math.max(trip.headcount ?? 0, guestCount);
  const bedsShort = Math.max(0, people - totalBeds);
  const readyCount = rooms.filter((room) => room.ready_at).length;

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>{trip.school ?? trip.name}</Text>
      <Text style={styles.pageSubtitle}>{`${trip.name}\n${formatDateRange(trip.check_in, trip.check_out)} · ${trip.headcount ?? '?'} guests · code ${trip.trip_code}`}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Arrival</Text>
        <Text style={styles.cardTitle}>{`Estimated ${formatTime(trip.arrival_time)}`}</Text>
        <Text style={styles.mutedText}>Aim to have every room ready by arrival (20–30 min turnaround per room).</Text>
        <Text style={styles.cardText}>{`${readyCount} of ${rooms.length} rooms ready`}</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={() => setShowInventory(true)}>
        <Text style={styles.buttonText}>Room Inventory ({rooms.length})</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => setShowCheckIn(true)}>
        <Text style={styles.buttonText}>Check-In</Text>
      </TouchableOpacity>
      {manifestReady && (
        <View style={[styles.actionRow, { marginBottom: 8 }]}>
          <SmallButton text="Download CSV" secondary onPress={() => exportManifestCsv(trip, 'hotel').catch((e) => showAlert('Export failed', errorMessage(e)))} />
          <SmallButton text="Print / Save PDF" secondary onPress={() => printManifest(trip, 'hotel').catch((e) => showAlert('Print failed', errorMessage(e)))} />
        </View>
      )}

      {bedsShort > 0 && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{`This group needs ${bedsShort} more bed${bedsShort === 1 ? '' : 's'}: ${people} people, ${totalBeds} beds. Add rooms in Room Inventory.`}</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Rooming manifest</Text>
      {!manifestReady ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>The advisor hasn't locked rooms yet. You'll be notified when the manifest is sent.</Text>
        </View>
      ) : (
        <Text style={styles.mutedText}>{`Received ${timeAgo(trip.manifest_sent_at)}${unassigned ? ` · ${unassigned} guests without a room` : ''}`}</Text>
      )}

      {rooms.map((room) => (
        <View key={room.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{`Room ${room.room_number}`}</Text>
            {room.ready_at ? <Badge text="Ready" tone="green" /> : <Badge text="Not ready" tone="amber" />}
          </View>
          <Text style={styles.mutedText}>{`${room.room_type} · ${room.gender ?? 'Any gender'} · ${room.occupants.length} of ${room.capacity} beds`}</Text>
          {manifestReady &&
            (room.occupants.length === 0 ? (
              <Text style={styles.mutedText}>Empty</Text>
            ) : (
              room.occupants.map((guest) => (
                <Text key={guest.id} style={styles.cardText}>{`• ${guest.legal_name}${guest.is_chaperone ? ' (chaperone)' : ''}`}</Text>
              ))
            ))}
          {manifestReady && (
            <View style={styles.actionRow}>
              {room.ready_at ? (
                <SmallButton text="Undo Ready" secondary onPress={() => setReady(room, false)} disabled={busyRoom === room.id} />
              ) : (
                <SmallButton text="Mark Ready" onPress={() => setReady(room, true)} disabled={busyRoom === room.id} />
              )}
            </View>
          )}
        </View>
      ))}
    </Page>
  );
}
