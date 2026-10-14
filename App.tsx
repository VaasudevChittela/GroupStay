import { useEffect, useState } from 'react';
import { Platform, Text, View, TouchableOpacity } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase, isDemoMode } from './lib/supabase';
import { addDemoStudentsToTrip, resetDemoData } from './lib/demoBackend';
import { autoAssignGuests } from './lib/assignments';
import { confirmAction, errorMessage, showAlert } from './lib/alert';
import { countUnread, notify, notifyGuests } from './lib/notify';
import { profileFromSession } from './lib/profile';
import { applyLockDeadline, canUseRoom } from './lib/rooms';
import { useSystemAlerts } from './lib/systemAlerts';
import { exportManifestCsv, printManifest } from './lib/manifest';
import { formatDateRange, formatDeadline, formatTime, stepTime, timeAgo } from './lib/format';
import { Guest, GUEST_COLUMNS, GUEST_DETAILS_COLUMNS, GuestDetails, NotificationLink, Profile, Role, Room, ROOM_COLUMNS, Trip, TRIP_COLUMNS } from './lib/types';
import { BackButton, Badge, Hero, IconName, Page, SmallButton, Tile } from './components/ui';
import { Ionicons } from '@expo/vector-icons';
import { appearance, colors, loadAppearance, onAppearanceChange, photos } from './lib/theme';
import { takeJoinCodeFromUrl } from './lib/links';
import ParentHome from './screens/ParentHome';
import DisplaySettingsScreen from './screens/DisplaySettingsScreen';
import AlertHost from './components/AlertHost';
import { styles } from './styles';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import CreateTripScreen from './screens/CreateTripScreen';
import StudentHome from './screens/StudentHome';
import StaffHome from './screens/StaffHome';
import MessagesScreen from './screens/MessagesScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import LocationsScreen from './screens/LocationsScreen';
import RoomInventoryScreen from './screens/RoomInventoryScreen';
import CheckInScreen from './screens/CheckInScreen';
import AddStudentsScreen from './screens/AddStudentsScreen';
import TripSettingsScreen from './screens/TripSettingsScreen';
import ScheduleScreen from './screens/ScheduleScreen';
import RoomChecksScreen from './screens/RoomChecksScreen';
import RoomHistoryScreen from './screens/RoomHistoryScreen';
import InviteScreen from './screens/InviteScreen';
import { logRoomChanges } from './lib/history';

type Screen = 'home' | 'login' | 'signup' | 'dashboard';
type AssignmentItem = { guest_id: number; room_id: number };

const ROLE_CARDS: Array<{ role: Role; title: string; text: string; icon: IconName; tint: string }> = [
  { role: 'Advisor', title: "I'm an Advisor", text: 'Create trips, manage rooms, and send the hotel a rooming list.', icon: 'briefcase-outline', tint: colors.primary },
  { role: 'Student', title: "I'm a Student", text: 'Join your trip with a code and pick a room with friends.', icon: 'school-outline', tint: '#7C3AED' },
  { role: 'Chaperone', title: "I'm a Chaperone", text: 'Join the trip and keep an eye on your room roster.', icon: 'shield-checkmark-outline', tint: colors.success },
  { role: 'Hotel Staff', title: "I'm Hotel Staff", text: 'Add room inventory, get manifests, and mark rooms ready.', icon: 'bed-outline', tint: '#DB2777' },
  { role: 'Parent', title: "I'm a Parent", text: "Follow your student's trip and sign the permission slip.", icon: 'heart-outline', tint: '#0891B2' },
];

function HomeScreen({
  profile,
  onSelect,
  onDashboard,
  onLogout,
  onOpenDisplay,
}: {
  profile: Profile | null;
  onSelect: (role: Role) => void;
  onDashboard: () => void;
  onLogout: () => void;
  onOpenDisplay: () => void;
}) {
  return (
    <Page
      hero={
        <Hero image={photos.lobby} eyebrow="Group travel, sorted" title="GroupStay" subtitle="Rooming lists, room picks, and check-in for school trips, all in one place." height={340}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {['Pick rooms together', 'Locked rooming lists', 'Room-ready alerts'].map((chip) => (
              <View key={chip} style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
                <Text style={{ color: colors.white, fontSize: 13, fontWeight: '600' }}>{chip}</Text>
              </View>
            ))}
          </View>
        </Hero>
      }
    >
      {profile ? (
        <View style={styles.card}>
          <Text style={styles.label}>Welcome back</Text>
          <Text style={styles.cardTitle}>{profile.full_name || profile.email}</Text>
          <Text style={[styles.mutedText, { marginBottom: 14 }]}>{`Signed in as ${profile.role ?? 'no role'}`}</Text>
          <TouchableOpacity style={styles.button} onPress={onDashboard}>
            <Text style={styles.buttonText}>Go to My Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, { marginBottom: 0 }]} onPress={onLogout}>
            <Text style={styles.secondaryButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Who are you?</Text>
          {ROLE_CARDS.map((card) => (
            <TouchableOpacity key={card.role} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]} onPress={() => onSelect(card.role)} activeOpacity={0.85}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: `${card.tint}18`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={card.icon} size={24} color={card.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={[styles.mutedText, { marginBottom: 0 }]}>{card.text}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.faint} />
            </TouchableOpacity>
          ))}
        </>
      )}

      <TouchableOpacity style={[styles.backButton, { flexDirection: 'row', justifyContent: 'center', gap: 6 }]} onPress={onOpenDisplay}>
        <Ionicons name="contrast-outline" size={16} color={colors.primary} />
        <Text style={styles.backText}>Display settings</Text>
      </TouchableOpacity>

      {isDemoMode && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={async () => {
            if (await confirmAction('Reset demo data?', 'This erases everything you changed in demo mode and logs you out.', 'Reset')) {
              resetDemoData();
            }
          }}
        >
          <Text style={[styles.mutedText, { textAlign: 'center' }]}>Demo mode · Reset demo data</Text>
        </TouchableOpacity>
      )}
    </Page>
  );
}

function AdvisorScreen({ profile, onBack, onLogout, onOpenDisplay }: { profile: Profile; onBack: () => void; onLogout: () => void; onOpenDisplay: () => void }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openTripId, setOpenTripId] = useState<number | null>(null);

  // Trips this advisor owns, plus trips where they were added as a co-advisor.
  const load = async () => {
    const [{ data: owned, error }, { data: coRows }] = await Promise.all([
      supabase.from('trips').select(TRIP_COLUMNS).eq('advisor_id', profile.id),
      supabase.from('trip_advisors').select('trip_id').ilike('email', profile.email),
    ]);
    if (error) showAlert('Error', errorMessage(error));
    const coIds = (coRows ?? []).map((r) => r.trip_id);
    const { data: coTrips } = coIds.length ? await supabase.from('trips').select(TRIP_COLUMNS).in('id', coIds) : { data: [] };
    const all = new Map<number, Trip>();
    [...(owned ?? []), ...(coTrips ?? [])].forEach((t) => all.set(t.id, t as Trip));
    setTrips([...all.values()].sort((a, b) => (a.check_in ?? '').localeCompare(b.check_in ?? '')));
    setLoading(false);
  };

  useEffect(() => {
    if (!openTripId && !creating) load();
  }, [openTripId, creating]);

  if (creating) {
    return (
      <CreateTripScreen
        profile={profile}
        onBack={() => setCreating(false)}
        onTripCreated={(trip) => {
          setCreating(false);
          setOpenTripId(trip.id);
        }}
      />
    );
  }

  if (openTripId) {
    return <AdvisorTripDashboard tripId={openTripId} profile={profile} onBack={() => setOpenTripId(null)} />;
  }

  return (
    <Page
      hero={
        <Hero
          image={photos.grandLobby}
          eyebrow={`${profile.full_name} · ${profile.school || 'Advisor'}`}
          title="My Trips"
          subtitle="Every trip you run or help with."
          onBack={onBack}
          backLabel="Home"
          height={230}
        />
      }
    >
      <TouchableOpacity style={[styles.button, { flexDirection: 'row', justifyContent: 'center', gap: 8 }]} onPress={() => setCreating(true)}>
        <Ionicons name="add" size={20} color={colors.white} />
        <Text style={styles.buttonText}>Create Trip</Text>
      </TouchableOpacity>

      {loading ? (
        <Text style={styles.normalText}>Loading...</Text>
      ) : trips.length === 0 ? (
        <Text style={styles.normalText}>No trips yet. Create one to get a join code for your students.</Text>
      ) : (
        trips.map((trip) => (
          <TouchableOpacity key={trip.id} style={styles.card} onPress={() => setOpenTripId(trip.id)} activeOpacity={0.85}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="airplane-outline" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.cardTitle, { flex: 1 }]}>{trip.name}</Text>
              </View>
              {trip.locked_at ? <Badge text="Locked" tone="green" /> : <Badge text="Open" tone="blue" />}
            </View>
            {trip.advisor_id !== profile.id && <Badge text="Co-advisor" />}
            <Text style={styles.cardText}>{`${trip.hotel_name} · ${formatDateRange(trip.check_in, trip.check_out)}`}</Text>
            <Text style={styles.mutedText}>{`${trip.school ?? ''} · Code ${trip.trip_code}`}</Text>
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

type AdvisorSubScreen =
  | 'rooms'
  | 'roster'
  | 'assign'
  | 'messages'
  | 'locations'
  | 'notifications'
  | 'addstudents'
  | 'checkin'
  | 'settings'
  | 'schedule'
  | 'roomchecks'
  | 'history'
  | 'invite'
  | null;

const ADVISOR_LINKS: NotificationLink[] = ['assign', 'roster', 'checkin', 'messages', 'team', 'schedule', 'roomchecks', 'history'];

function AdvisorTripDashboard({ tripId, profile, onBack }: { tripId: number; profile: Profile; onBack: () => void }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stats, setStats] = useState({ guests: 0, assigned: 0, rooms: 0, beds: 0, ready: 0, sharing: 0, checkedIn: 0, slips: 0, students: 0 });
  const [unread, setUnread] = useState(0);
  const [subScreen, setSubScreen] = useState<AdvisorSubScreen>(null);
  const [arrival, setArrival] = useState<string | null>(null);
  const [savingArrival, setSavingArrival] = useState(false);
  const [locking, setLocking] = useState(false);

  useSystemAlerts({ audience: 'advisor', tripIds: [tripId] });

  const load = async () => {
    await applyLockDeadline(tripId); // no-op unless the room-pick deadline just passed
    const [{ data: tripRow }, { data: guestRows }, { data: assignmentRows }, { data: roomRows }, unreadCount] = await Promise.all([
      supabase.from('trips').select(TRIP_COLUMNS).eq('id', tripId).maybeSingle(),
      supabase.from('guests').select('id, share_location, checked_in_at, is_chaperone').eq('trip_id', tripId),
      supabase.from('assignments').select('guest_id').eq('trip_id', tripId),
      supabase.from('rooms').select('capacity, ready_at').eq('trip_id', tripId),
      countUnread({ audience: 'advisor', tripIds: [tripId] }),
    ]);
    const { data: slipRows } = await supabase.from('permission_slips').select('guest_id').eq('trip_id', tripId);
    const nextTrip = tripRow as Trip | null;
    setTrip(nextTrip);
    setArrival((prev) => prev ?? nextTrip?.arrival_time ?? '14:00');
    setStats({
      guests: guestRows?.length ?? 0,
      assigned: assignmentRows?.length ?? 0,
      rooms: roomRows?.length ?? 0,
      beds: (roomRows ?? []).reduce((sum, room) => sum + room.capacity, 0),
      ready: (roomRows ?? []).filter((room) => room.ready_at).length,
      sharing: (guestRows ?? []).filter((guest) => guest.share_location).length,
      checkedIn: (guestRows ?? []).filter((guest) => guest.checked_in_at).length,
      slips: slipRows?.length ?? 0,
      // Only students need permission slips; chaperones are adults.
      students: (guestRows ?? []).filter((guest) => !guest.is_chaperone).length,
    });
    setUnread(unreadCount);
  };

  useEffect(() => {
    if (subScreen) return;
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [subScreen]);

  if (!trip) {
    return (
      <Page>
        <BackButton onPress={onBack} />
        <Text style={styles.normalText}>Loading trip...</Text>
      </Page>
    );
  }

  const back = () => setSubScreen(null);
  if (subScreen === 'rooms') return <RoomInventoryScreen trip={trip} role="advisor" onBack={back} />;
  if (subScreen === 'roster') return <AdvisorRosterScreen trip={trip} onBack={back} />;
  if (subScreen === 'assign') return <AdvisorAssignmentScreen trip={trip} onBack={back} />;
  if (subScreen === 'messages') return <MessagesScreen role="advisor" tripId={trip.id} advisorName={profile.full_name} onBack={back} />;
  if (subScreen === 'locations') return <LocationsScreen tripId={trip.id} onBack={back} />;
  if (subScreen === 'addstudents') return <AddStudentsScreen trip={trip} onBack={back} />;
  if (subScreen === 'checkin') return <CheckInScreen trip={trip} role="advisor" onBack={back} />;
  if (subScreen === 'settings') return <TripSettingsScreen trip={trip} profile={profile} onBack={back} />;
  if (subScreen === 'schedule') return <ScheduleScreen trip={trip} canEdit onBack={back} />;
  if (subScreen === 'roomchecks') return <RoomChecksScreen trip={trip} checkerName={profile.full_name} onBack={back} />;
  if (subScreen === 'history') return <RoomHistoryScreen trip={trip} onBack={back} />;
  if (subScreen === 'invite') return <InviteScreen trip={trip} onBack={back} />;
  if (subScreen === 'notifications') {
    return (
      <NotificationsScreen
        scope={{ audience: 'advisor', tripIds: [trip.id] }}
        userId={profile.id}
        onBack={back}
        openable={ADVISOR_LINKS}
        onOpen={(link) => setSubScreen(link === 'team' ? 'settings' : (link as AdvisorSubScreen))}
      />
    );
  }

  const saveArrival = async () => {
    setSavingArrival(true);
    const { error } = await supabase.from('trips').update({ arrival_time: arrival }).eq('id', trip.id);
    setSavingArrival(false);
    if (error) {
      showAlert('Error', errorMessage(error));
      return;
    }
    await notify(trip.id, 'staff', 'Arrival time updated', `${trip.school ?? trip.name} now expects to arrive at ${formatTime(arrival)} on ${trip.check_in}.`, null, 'manifest');
    showAlert('Arrival time sent', `The hotel will prep rooms for a ${formatTime(arrival)} arrival.`);
    await load();
  };

  const lockAndSend = async () => {
    const unassigned = stats.guests - stats.assigned;
    const warning = unassigned > 0 ? `${unassigned} people still have no room. ` : '';
    const ok = await confirmAction(
      'Lock rooms and send manifest?',
      `${warning}Students won't be able to change rooms, and ${trip.hotel_name} gets the rooming list.`,
      'Lock & Send',
    );
    if (!ok) return;
    setLocking(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('trips').update({ locked_at: now, manifest_sent_at: now }).eq('id', trip.id);
    if (error) {
      setLocking(false);
      showAlert('Error locking assignments', errorMessage(error));
      return;
    }
    // Cancel any invites/requests still waiting: they can't be acted on anymore.
    await supabase.from('room_requests').update({ status: 'cancelled' }).eq('trip_id', trip.id).eq('status', 'pending');
    await notify(
      trip.id,
      'staff',
      'Manifest received',
      `${trip.school ?? trip.name} locked rooms: ${stats.assigned} guests in ${stats.rooms} rooms. Arrival ${formatTime(trip.arrival_time)} on ${trip.check_in}.`,
      null,
      'manifest',
    );
    const { data: guestRows } = await supabase.from('guests').select('id').eq('trip_id', trip.id);
    await notifyGuests(trip.id, (guestRows ?? []).map((g) => g.id), 'Rooms are locked', 'Your advisor locked room assignments. Check My Room for your final room.', 'rooms');
    setLocking(false);
    showAlert('Locked', 'Rooms are locked and the manifest was sent to the hotel.');
    await load();
  };

  const unlock = async () => {
    // A deadline that already passed would lock the trip again right away, so unlocking clears it.
    const deadlinePassed = Boolean(trip.lock_deadline && new Date(trip.lock_deadline).getTime() <= Date.now());
    const ok = await confirmAction(
      'Unlock rooms?',
      `Students will be able to change rooms again, and the hotel will be told the manifest may change.${deadlinePassed ? ' The passed room-pick deadline will be cleared; set a new one in Trip Settings.' : ''}`,
      'Unlock',
    );
    if (!ok) return;
    const { error } = await supabase
      .from('trips')
      .update({ locked_at: null, manifest_sent_at: null, ...(deadlinePassed ? { lock_deadline: null } : {}) })
      .eq('id', trip.id);
    if (error) {
      showAlert('Error', errorMessage(error));
      return;
    }
    await notify(trip.id, 'staff', 'Manifest withdrawn', `${trip.school ?? trip.name} unlocked rooms to make changes. A new manifest will follow.`, null, 'manifest');
    await load();
  };

  const grid: Array<{ key: AdvisorSubScreen; label: string; icon: IconName; tint: string; count?: number }> = [
    { key: 'rooms', label: `Rooms (${stats.rooms})`, icon: 'bed-outline', tint: colors.primary },
    { key: 'assign', label: 'Assign Rooms', icon: 'grid-outline', tint: '#7C3AED' },
    { key: 'roster', label: 'Roster', icon: 'people-outline', tint: colors.success },
    { key: 'addstudents', label: 'Add Students', icon: 'person-add-outline', tint: '#0891B2' },
    { key: 'messages', label: 'Messages', icon: 'chatbubbles-outline', tint: '#7C3AED' },
    { key: 'notifications', label: 'Notifications', icon: 'notifications-outline', tint: '#DB2777', count: unread },
    { key: 'checkin', label: `Check-In (${stats.checkedIn}/${stats.guests})`, icon: 'checkmark-done-outline', tint: colors.success },
    { key: 'locations', label: `Locations (${stats.sharing})`, icon: 'map-outline', tint: colors.danger },
    { key: 'schedule', label: 'Schedule', icon: 'calendar-outline', tint: '#0891B2' },
    { key: 'roomchecks', label: 'Room Checks', icon: 'moon-outline', tint: '#7C3AED' },
    { key: 'history', label: 'Room History', icon: 'time-outline', tint: colors.muted },
    { key: 'invite', label: 'Invite Students', icon: 'qr-code-outline', tint: colors.primary },
    { key: 'settings', label: 'Trip Settings', icon: 'settings-outline', tint: colors.muted },
  ];
  const bedsShort = Math.max(0, Math.max(trip.headcount ?? 0, stats.guests) - stats.beds);

  return (
    <Page
      hero={
        <Hero
          image={photos.lobby}
          eyebrow={`${trip.school ?? ''} · ${formatDateRange(trip.check_in, trip.check_out)}`}
          title={trip.name}
          subtitle={`${trip.hotel_name}${trip.hotel_address ? ` · ${trip.hotel_address}` : ''}`}
          onBack={onBack}
          backLabel="My Trips"
        >
          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            <View style={{ backgroundColor: trip.locked_at ? colors.success : 'rgba(255,255,255,0.18)', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
              <Text style={{ color: colors.white, fontSize: 13, fontWeight: '700' }}>{trip.locked_at ? 'Rooms locked · manifest sent' : 'Rooms open for picking'}</Text>
            </View>
          </View>
        </Hero>
      }
    >
      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{`${stats.guests}`}</Text>
          <Text style={styles.statLabel}>{`of ${trip.headcount ?? '?'} joined`}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.assigned}</Text>
          <Text style={styles.statLabel}>In rooms</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.guests - stats.assigned}</Text>
          <Text style={styles.statLabel}>No room</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.beds}</Text>
          <Text style={styles.statLabel}>Beds</Text>
        </View>
      </View>

      {bedsShort > 0 && stats.rooms > 0 && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{`Not enough beds: ${bedsShort} short. The hotel has been told to add rooms.`}</Text>
        </View>
      )}
      {stats.students > 0 && stats.slips < stats.students && (
        <TouchableOpacity style={[styles.banner, { backgroundColor: colors.primarySoft }]} onPress={() => setSubScreen('roster')}>
          <Text style={[styles.bannerText, { color: colors.primaryDark }]}>{`Permission slips: ${stats.slips} of ${stats.students} students signed · See who's missing`}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Join code</Text>
          <Text style={[styles.cardTitle, { letterSpacing: 2 }]}>{trip.trip_code}</Text>
        </View>
        <Text style={styles.mutedText}>{`Share this with ${trip.school ?? 'your'} students. It only works for this school.`}</Text>
        <View style={styles.actionRow}>
          <SmallButton text="Show QR Code & Invite Link" onPress={() => setSubScreen('invite')} />
        </View>
        {isDemoMode && !trip.locked_at && (
          <View style={styles.actionRow}>
            <SmallButton
              text="Add Demo Students"
              secondary
              onPress={async () => {
                const added = addDemoStudentsToTrip(trip);
                showAlert(
                  added.length ? `Added ${added.length} people` : 'No one to add',
                  added.length
                    ? `${added.join(', ')} joined with code ${trip.trip_code}.`
                    : `Every demo account from ${trip.school ?? 'this school'} is already on a trip.`,
                );
                await load();
              }}
            />
          </View>
        )}
      </View>

      <View style={styles.buttonsGrid}>
        {grid.map((item) => (
          <Tile key={item.key} icon={item.icon} label={item.label} tint={item.tint} count={item.count} onPress={() => setSubScreen(item.key)} />
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Estimated arrival</Text>
        <Text style={styles.mutedText}>The hotel preps rooms in arrival order and notifies students when their room is ready.</Text>
        <View style={[styles.rowBetween, { marginTop: 8 }]}>
          <SmallButton text="− 15 min" secondary onPress={() => setArrival((t) => stepTime(t, -15))} />
          <Text style={styles.bigBlueText}>{formatTime(arrival)}</Text>
          <SmallButton text="+ 15 min" secondary onPress={() => setArrival((t) => stepTime(t, 15))} />
        </View>
        {arrival !== trip.arrival_time && (
          <TouchableOpacity style={styles.button} onPress={saveArrival} disabled={savingArrival}>
            <Text style={styles.buttonText}>{savingArrival ? 'Sending...' : 'Send Arrival Time to Hotel'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Lock & manifest</Text>
        {trip.locked_at ? (
          <>
            <Badge text={`Locked · manifest sent ${timeAgo(trip.manifest_sent_at)}`} tone="green" />
            <Text style={styles.mutedText}>{`${stats.ready} of ${stats.rooms} rooms marked ready by the hotel.`}</Text>
            <View style={styles.actionRow}>
              <SmallButton text="Unlock Rooms" secondary onPress={unlock} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.mutedText}>
              {trip.lock_deadline
                ? `Students can pick and switch rooms until ${formatDeadline(trip.lock_deadline)}, when rooms lock automatically. You can also lock now.`
                : 'Students can pick and switch rooms until you lock. Locking freezes rooms and sends the rooming list to the hotel. Set a deadline in Trip Settings to lock automatically.'}
            </Text>
            <TouchableOpacity style={[styles.button, { marginTop: 8 }]} onPress={lockAndSend} disabled={locking}>
              <Text style={styles.buttonText}>{locking ? 'Locking...' : 'Lock Rooms & Send Manifest'}</Text>
            </TouchableOpacity>
          </>
        )}
        <Text style={[styles.label, { marginTop: 12 }]}>Rooming list (with contacts and medical notes)</Text>
        <View style={styles.actionRow}>
          <SmallButton text="Download CSV" secondary onPress={() => exportManifestCsv(trip, 'advisor').catch((e) => showAlert('Export failed', errorMessage(e)))} />
          <SmallButton text="Print / Save PDF" secondary onPress={() => printManifest(trip, 'advisor').catch((e) => showAlert('Print failed', errorMessage(e)))} />
        </View>
      </View>
    </Page>
  );
}

function AdvisorRosterScreen({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [roomOf, setRoomOf] = useState<Map<number, string>>(new Map());
  const [details, setDetails] = useState<Map<number, GuestDetails>>(new Map());
  const [signed, setSigned] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: guestRows, error }, { data: assignmentRows }, { data: roomRows }, { data: detailRows }] = await Promise.all([
        supabase.from('guests').select(GUEST_COLUMNS).eq('trip_id', trip.id).order('legal_name', { ascending: true }),
        supabase.from('assignments').select('guest_id, room_id').eq('trip_id', trip.id),
        supabase.from('rooms').select('id, room_number').eq('trip_id', trip.id),
        supabase.from('guest_details').select(GUEST_DETAILS_COLUMNS).eq('trip_id', trip.id),
      ]);
      if (error) showAlert('Error', errorMessage(error));
      setDetails(new Map(((detailRows ?? []) as GuestDetails[]).map((d) => [d.guest_id, d])));
      const { data: slipRows } = await supabase.from('permission_slips').select('guest_id, signed_name').eq('trip_id', trip.id);
      setSigned(new Map((slipRows ?? []).map((r) => [r.guest_id, r.signed_name])));
      const roomNumbers = new Map((roomRows ?? []).map((room) => [room.id, room.room_number]));
      setRoomOf(new Map((assignmentRows ?? []).map((row) => [row.guest_id, roomNumbers.get(row.room_id) ?? '?'])));
      setGuests((guestRows ?? []) as Guest[]);
      setLoading(false);
    };
    load();
  }, [trip.id]);

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Roster</Text>
      <Text style={styles.pageSubtitle}>{`${guests.length} of ${trip.headcount ?? '?'} people have joined`}</Text>
      {loading ? (
        <Text style={styles.normalText}>Loading...</Text>
      ) : guests.length === 0 ? (
        <Text style={styles.normalText}>{`No one has joined yet. Share code ${trip.trip_code}.`}</Text>
      ) : (
        guests.map((guest) => (
          <View key={guest.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{guest.legal_name}</Text>
              {roomOf.has(guest.id) ? <Badge text={`Room ${roomOf.get(guest.id)}`} tone="green" /> : <Badge text="No room" tone="amber" />}
            </View>
            <Text style={styles.cardText}>{`${guest.is_chaperone ? 'Chaperone' : 'Student'} · ${guest.gender ?? 'gender not set'} · ${guest.school}`}</Text>
            <Text style={styles.mutedText}>{`${guest.phone ?? 'no phone'} · ${guest.email ?? 'no email'}${guest.share_location ? ' · sharing location' : ''}${guest.checked_in_at ? ' · checked in' : ''}${guest.user_id ? '' : ' · no account yet'}`}</Text>
            {details.get(guest.id)?.emergency_name ? (
              <Text style={styles.mutedText}>{`Emergency: ${details.get(guest.id)!.emergency_name}${details.get(guest.id)!.emergency_relationship ? ` (${details.get(guest.id)!.emergency_relationship})` : ''} ${details.get(guest.id)!.emergency_phone ?? ''}`}</Text>
            ) : (
              <Text style={[styles.mutedText, { color: colors.warning }]}>No emergency contact yet</Text>
            )}
            {guest.is_chaperone ? null : signed.has(guest.id) ? (
              <Text style={[styles.mutedText, { color: colors.success }]}>{`Permission slip signed by ${signed.get(guest.id)}`}</Text>
            ) : (
              <Text style={[styles.mutedText, { color: colors.warning }]}>
                {details.get(guest.id)?.parent_email ? `Permission slip not signed yet (parent: ${details.get(guest.id)!.parent_email})` : 'Permission slip not signed · no parent email added yet'}
              </Text>
            )}
            {details.get(guest.id)?.medical_notes ? (
              <Text style={[styles.mutedText, { color: colors.danger }]}>{`Medical: ${details.get(guest.id)!.medical_notes}`}</Text>
            ) : null}
          </View>
        ))
      )}
    </Page>
  );
}

function AdvisorAssignmentScreen({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(Boolean(trip.locked_at));
  const [rooms, setRooms] = useState<Room[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [saved, setSaved] = useState<AssignmentItem[]>([]);
  const [separate, setSeparate] = useState(trip.separate_chaperones);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [editingGuestId, setEditingGuestId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: tripRow }, { data: roomRows, error: roomError }, { data: guestRows, error: guestError }, { data: assignmentRows, error: assignmentError }] =
      await Promise.all([
        supabase.from('trips').select('locked_at, lock_deadline, separate_chaperones').eq('id', trip.id).maybeSingle(),
        supabase.from('rooms').select(ROOM_COLUMNS).eq('trip_id', trip.id).order('room_number', { ascending: true }),
        supabase.from('guests').select(GUEST_COLUMNS).eq('trip_id', trip.id).order('legal_name', { ascending: true }),
        supabase.from('assignments').select('guest_id, room_id').eq('trip_id', trip.id),
      ]);
    setLoading(false);
    if (roomError || guestError || assignmentError) {
      showAlert('Error', errorMessage(roomError || guestError || assignmentError));
      return;
    }
    const current = (assignmentRows ?? []).map((row) => ({ guest_id: row.guest_id, room_id: row.room_id }));
    setLocked(Boolean(tripRow?.locked_at) || Boolean(tripRow?.lock_deadline && new Date(tripRow.lock_deadline).getTime() <= Date.now()));
    setSeparate(Boolean(tripRow?.separate_chaperones));
    setRooms((roomRows ?? []) as Room[]);
    setGuests((guestRows ?? []) as Guest[]);
    setSaved(current);
    setAssignments(current);
    setEditingGuestId(null);
  };

  useEffect(() => {
    load();
  }, [trip.id]);

  const roomGuests = (roomId: number) =>
    assignments.filter((a) => a.room_id === roomId).map((a) => guests.find((g) => g.id === a.guest_id)).filter(Boolean) as Guest[];
  const roomIdOf = (guestId: number) => assignments.find((a) => a.guest_id === guestId)?.room_id ?? null;
  const unassigned = guests.filter((guest) => roomIdOf(guest.id) === null);

  // Rooms this person could move into: same school and gender, with a free bed.
  const roomsFor = (guest: Guest) =>
    rooms.filter((room) => {
      if (room.id === roomIdOf(guest.id)) return false;
      const others = roomGuests(room.id).filter((g) => g.id !== guest.id);
      return others.length < room.capacity && canUseRoom(guest, room, others, separate);
    });

  const placeGuest = (guestId: number, roomId: number | null) => {
    setAssignments((prev) => {
      const rest = prev.filter((a) => a.guest_id !== guestId);
      return roomId === null ? rest : [...rest, { guest_id: guestId, room_id: roomId }];
    });
    setEditingGuestId(null);
  };

  const handleAutoAssign = () => {
    const result = autoAssignGuests(guests, rooms, assignments, separate);
    setAssignments(result.assignments);
    if (result.unassignedGuestIds.length) {
      showAlert('Some people still need rooms', `${result.unassignedGuestIds.length} people didn't fit. Ask the hotel to add rooms that match their school and gender.`);
    }
  };

  const changed = assignments.filter((a) => !saved.some((s) => s.guest_id === a.guest_id && s.room_id === a.room_id));
  const removed = saved.filter((s) => !assignments.some((a) => a.guest_id === s.guest_id));
  const pendingCount = changed.length + removed.length;

  const handleSave = async () => {
    if (pendingCount === 0) return;
    setSaving(true);
    const roomNumber = new Map(rooms.map((room) => [room.id, room.room_number]));
    if (removed.length) {
      const { error } = await supabase.from('assignments').delete().in('guest_id', removed.map((r) => r.guest_id));
      if (error) {
        setSaving(false);
        showAlert('Error saving assignments', errorMessage(error));
        return;
      }
    }
    if (changed.length) {
      const { error } = await supabase
        .from('assignments')
        .upsert(changed.map((a) => ({ trip_id: trip.id, guest_id: a.guest_id, room_id: a.room_id })), { onConflict: 'guest_id' });
      if (error) {
        setSaving(false);
        showAlert('Error saving assignments', errorMessage(error));
        return;
      }
    }
    const before = new Map(saved.map((a) => [a.guest_id, a.room_id]));
    const person = (id: number) => guests.find((g) => g.id === id) ?? { id, legal_name: 'Unknown' };
    await logRoomChanges(trip.id, 'Advisor', [
      ...changed.map((a) => ({
        guest: person(a.guest_id),
        action: (before.has(a.guest_id) ? 'moved' : 'assigned') as 'moved' | 'assigned',
        fromRoom: before.has(a.guest_id) ? roomNumber.get(before.get(a.guest_id)!) : null,
        toRoom: roomNumber.get(a.room_id),
      })),
      ...removed.map((r) => ({ guest: person(r.guest_id), action: 'removed' as const, fromRoom: roomNumber.get(r.room_id) })),
    ]);
    await Promise.all([
      ...changed.map((a) => notify(trip.id, 'guest', 'Room assigned', `Your advisor placed you in room ${roomNumber.get(a.room_id) ?? ''}.`, a.guest_id, 'rooms')),
      ...removed.map((r) => notify(trip.id, 'guest', 'Room removed', `Your advisor took you out of room ${roomNumber.get(r.room_id) ?? ''}. Pick a new room.`, r.guest_id, 'rooms')),
    ]);
    setSaving(false);
    showAlert('Saved', `${pendingCount} change${pendingCount === 1 ? '' : 's'} saved and students notified.`);
    await load();
  };

  const status = (guestId: number) => {
    const now = roomIdOf(guestId);
    const before = saved.find((s) => s.guest_id === guestId)?.room_id ?? null;
    return now === before ? '' : now === null ? '  ← removed' : before === null ? '  ← new' : '  ← moved';
  };

  // The room picker shown under whichever person is being edited.
  const picker = (guest: Guest) => {
    const options = roomsFor(guest);
    return (
      <View style={{ marginTop: 8 }}>
        <Text style={styles.mutedText}>{options.length ? (roomIdOf(guest.id) === null ? 'Put in:' : 'Move to:') : 'No other room fits this person (school, gender, and free beds).'}</Text>
        <View style={styles.actionRow}>
          {options.map((room) => (
            <SmallButton
              key={room.id}
              text={`${room.room_number} (${roomGuests(room.id).length}/${room.capacity})`}
              onPress={() => placeGuest(guest.id, room.id)}
            />
          ))}
          {roomIdOf(guest.id) !== null && <SmallButton text="Remove from room" secondary onPress={() => placeGuest(guest.id, null)} />}
          <SmallButton text="Cancel" secondary onPress={() => setEditingGuestId(null)} />
        </View>
      </View>
    );
  };

  const personRow = (guest: Guest) => (
    <View key={guest.id} style={{ marginBottom: 6 }}>
      <View style={styles.rowBetween}>
        <Text style={[styles.cardText, { flex: 1 }]}>
          {`• ${guest.legal_name}${guest.is_chaperone ? ' (chaperone)' : ''}${status(guest.id)}`}
        </Text>
        {!locked && editingGuestId !== guest.id && (
          <SmallButton text={roomIdOf(guest.id) === null ? 'Assign' : 'Move'} secondary onPress={() => setEditingGuestId(guest.id)} />
        )}
      </View>
      {editingGuestId === guest.id && picker(guest)}
    </View>
  );

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Assign Rooms</Text>
      <Text style={styles.pageSubtitle}>Students pick their own rooms. You can place anyone by hand, or auto-fill the empty beds.</Text>

      {locked ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Rooms are locked. Unlock from the trip dashboard to make changes.</Text>
        </View>
      ) : (
        <>
          <TouchableOpacity style={styles.button} onPress={handleAutoAssign} disabled={loading || rooms.length === 0 || unassigned.length === 0}>
            <Text style={styles.buttonText}>{`Auto-Assign ${unassigned.length} Without a Room`}</Text>
          </TouchableOpacity>
          {pendingCount > 0 && (
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={handleSave} disabled={saving}>
                <Text style={styles.buttonText}>{saving ? 'Saving...' : `Save ${pendingCount} Change${pendingCount === 1 ? '' : 's'}`}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={() => setAssignments(saved)} disabled={saving}>
                <Text style={styles.secondaryButtonText}>Undo</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {loading ? (
        <Text style={styles.normalText}>Loading...</Text>
      ) : (
        <>
          <Text style={styles.sectionTitle}>{`No room (${unassigned.length})`}</Text>
          {unassigned.length === 0 ? (
            <Text style={styles.normalText}>Everyone has a room.</Text>
          ) : (
            <View style={styles.card}>
              {unassigned.map((guest) => (
                <View key={guest.id}>
                  {personRow(guest)}
                  {editingGuestId !== guest.id && <Text style={[styles.mutedText, { marginTop: -4, marginLeft: 12 }]}>{`${guest.gender ?? 'gender not set'} · ${guest.school}`}</Text>}
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>By room</Text>
          {rooms.length === 0 ? (
            <Text style={styles.normalText}>No rooms yet. The hotel adds them from their dashboard, or add them under Rooms.</Text>
          ) : (
            rooms.map((room) => (
              <View key={room.id} style={styles.card}>
                <Text style={styles.cardTitle}>{`Room ${room.room_number}`}</Text>
                <Text style={styles.mutedText}>{`${room.room_type} · ${room.gender ?? 'Any gender'} · ${roomGuests(room.id).length} of ${room.capacity}`}</Text>
                {roomGuests(room.id).length === 0 ? <Text style={styles.mutedText}>Empty</Text> : roomGuests(room.id).map(personRow)}
              </View>
            ))
          )}
        </>
      )}
    </Page>
  );
}

// Web: use the Inter font (phones already use a clean system font).
function useWebFont() {
  useEffect(() => {
    if (Platform.OS !== 'web' || document.getElementById('groupstay-font')) return;
    const link = document.createElement('link');
    link.id = 'groupstay-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(link);
    const style = document.createElement('style');
    // Icons are text in an icon font, so leave anything styled with an icon font alone.
    style.textContent =
      "body *:not([style*='icons']) { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important; } body { background: #F3F5FA; }";
    document.head.appendChild(style);
  }, []);
}

export default function App() {
  useWebFont();
  const [screen, setScreen] = useState<Screen>('home');
  const [session, setSession] = useState<Session | null>(null);
  const [roleHint, setRoleHint] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDisplay, setShowDisplay] = useState(false);
  // A join link (?join=CODE) opens the student's join screen with the code filled in.
  const [pendingJoin, setPendingJoin] = useState<string | null>(() => takeJoinCodeFromUrl());
  const [, setThemeVersion] = useState(appearance.version);

  useEffect(() => {
    // Re-render everything when the theme or text size changes.
    const stop = onAppearanceChange(() => {
      setThemeVersion(appearance.version);
      if (Platform.OS === 'web') document.body.style.background = colors.bg;
    });

    // Load display settings, then restore a saved login and go straight to the dashboard.
    loadAppearance().then(() =>
      supabase.auth.getSession().then(({ data: { session: saved } }) => {
        setSession(saved);
        if (saved?.user) setScreen('dashboard');
        else if (pendingJoin) {
          setRoleHint('Student');
          setScreen('login');
        }
        setLoading(false);
      }),
    );

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_IN') setScreen((prev) => (prev === 'login' || prev === 'signup' ? 'dashboard' : prev));
      if (event === 'SIGNED_OUT') setScreen('home');
    });

    return () => {
      subscription.unsubscribe();
      stop();
    };
  }, []);

  const profile = profileFromSession(session);
  const openDisplay = () => setShowDisplay(true);
  const logout = async () => {
    await supabase.auth.signOut();
    setScreen('home');
  };
  const goHome = () => setScreen('home');

  let content = null;
  if (loading) {
    content = null;
  } else if (showDisplay) {
    content = <DisplaySettingsScreen onBack={() => setShowDisplay(false)} />;
  } else if (screen === 'login') {
    content = <LoginScreen roleHint={roleHint} joinCode={pendingJoin} onSignup={() => setScreen('signup')} onBack={goHome} />;
  } else if (screen === 'signup') {
    content = <SignupScreen roleHint={roleHint} onLogin={() => setScreen('login')} />;
  } else if (screen === 'dashboard' && profile) {
    if (profile.role === 'Advisor') content = <AdvisorScreen profile={profile} onBack={goHome} onLogout={logout} onOpenDisplay={openDisplay} />;
    else if (profile.role === 'Student' || profile.role === 'Chaperone') {
      content = (
        <StudentHome
          profile={profile}
          onBack={goHome}
          onLogout={logout}
          onOpenDisplay={openDisplay}
          joinCode={pendingJoin}
          onJoinCodeUsed={() => setPendingJoin(null)}
        />
      );
    } else if (profile.role === 'Hotel Staff') content = <StaffHome profile={profile} onBack={goHome} onLogout={logout} onOpenDisplay={openDisplay} />;
    else if (profile.role === 'Parent') content = <ParentHome profile={profile} onBack={goHome} onLogout={logout} onOpenDisplay={openDisplay} />;
    else {
      content = (
        <Page>
          <BackButton onPress={goHome} />
          <Text style={styles.pageTitle}>No role set</Text>
          <Text style={styles.pageSubtitle}>This account has no role. Log out and sign up again with a role.</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={logout}>
            <Text style={styles.secondaryButtonText}>Log Out</Text>
          </TouchableOpacity>
        </Page>
      );
    }
  } else {
    content = (
      <HomeScreen
        profile={profile}
        onDashboard={() => setScreen('dashboard')}
        onLogout={logout}
        onOpenDisplay={openDisplay}
        onSelect={(role) => {
          setRoleHint(role);
          setScreen('login');
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {content}
      <AlertHost />
    </View>
  );
}
