import { useEffect, useRef, useState } from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { countUnread, notify } from '../lib/notify';
import { useSystemAlerts } from '../lib/systemAlerts';
import { formatDateRange, formatDeadline, formatTime } from '../lib/format';
import { applyLockDeadline, sameText } from '../lib/rooms';
import { checkBedCount } from '../lib/beds';
import { Gender, GENDERS, Guest, GUEST_COLUMNS, NotificationLink, Profile, Room, ROOM_COLUMNS, Trip, TRIP_COLUMNS } from '../lib/types';
import { BackButton, Badge, Hero, OptionPicker, Page, Tile } from '../components/ui';
import { colors, photos } from '../lib/theme';
import { styles } from '../styles';
import RoomsScreen from './RoomsScreen';
import RoommateRequestScreen from './RoommateRequestScreen';
import MessagesScreen from './MessagesScreen';
import NotificationsScreen from './NotificationsScreen';
import MyInfoScreen from './MyInfoScreen';
import ScheduleScreen from './ScheduleScreen';
import RoomChecksScreen from './RoomChecksScreen';
import Announcements from '../components/Announcements';

type SubScreen = 'rooms' | 'roommate' | 'messages' | 'notifications' | 'myinfo' | 'join' | 'schedule' | 'roomchecks' | null;

const STUDENT_LINKS: NotificationLink[] = ['rooms', 'messages', 'myinfo', 'schedule', 'roomchecks'];

export default function StudentHome({
  profile,
  onBack,
  onLogout,
  onOpenDisplay,
  joinCode,
  onJoinCodeUsed,
}: {
  profile: Profile;
  onBack: () => void;
  onLogout: () => void;
  onOpenDisplay: () => void;
  // Trip code from an invite link, if the app was opened from one.
  joinCode?: string | null;
  onJoinCodeUsed?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [myGuests, setMyGuests] = useState<Guest[]>([]);
  const [myTrips, setMyTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [myRoom, setMyRoom] = useState<Room | null>(null);
  const [unread, setUnread] = useState(0);
  const [pending, setPending] = useState({ invites: 0, requests: 0 });
  const [hasEmergencyContact, setHasEmergencyContact] = useState(true);
  const [subScreen, setSubScreen] = useState<SubScreen>(null);

  // A student can be on several trips; show the chosen one, or the newest.
  const guest = myGuests.find((g) => g.trip_id === selectedTripId) ?? myGuests[0] ?? null;
  const trip = myTrips.find((t) => t.id === guest?.trip_id) ?? null;

  useSystemAlerts(guest ? { audience: 'guest', guestId: guest.id } : null);

  const load = async () => {
    const { data: guestRows } = await supabase
      .from('guests')
      .select(GUEST_COLUMNS)
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    const guests = (guestRows ?? []) as Guest[];
    setMyGuests(guests);
    if (guests.length === 0) {
      setMyTrips([]);
      setLoading(false);
      return;
    }
    const { data: tripRows } = await supabase.from('trips').select(TRIP_COLUMNS).in('id', guests.map((g) => g.trip_id));
    let trips = (tripRows ?? []) as Trip[];
    const me = guests.find((g) => g.trip_id === selectedTripId) ?? guests[0];
    const current = trips.find((t) => t.id === me.trip_id);
    // Lock the trip if its room-pick deadline has passed.
    if (current && !current.locked_at && current.lock_deadline && new Date(current.lock_deadline).getTime() <= Date.now()) {
      if (await applyLockDeadline(current.id)) {
        const { data: fresh } = await supabase.from('trips').select(TRIP_COLUMNS).eq('id', current.id).maybeSingle();
        if (fresh) trips = trips.map((t) => (t.id === current.id ? (fresh as Trip) : t));
      }
    }
    setMyTrips(trips);

    const [{ data: assignment }, unreadCount, { data: requestRows }, { data: details }] = await Promise.all([
      supabase.from('assignments').select('room_id').eq('guest_id', me.id).maybeSingle(),
      countUnread({ audience: 'guest', guestId: me.id }),
      supabase.from('room_requests').select('guest_id, room_id, kind').eq('trip_id', me.trip_id).eq('status', 'pending'),
      supabase.from('guest_details').select('emergency_name, emergency_phone').eq('guest_id', me.id).maybeSingle(),
    ]);
    setUnread(unreadCount);
    setHasEmergencyContact(Boolean(details?.emergency_name && details?.emergency_phone));
    // Invites waiting on me, and requests waiting on my room, so they aren't buried in notifications.
    setPending({
      invites: (requestRows ?? []).filter((r) => r.kind === 'invite' && r.guest_id === me.id).length,
      requests: (requestRows ?? []).filter((r) => r.kind === 'request' && assignment?.room_id && r.room_id === assignment.room_id).length,
    });
    if (assignment?.room_id) {
      const { data: room } = await supabase.from('rooms').select(ROOM_COLUMNS).eq('id', assignment.room_id).maybeSingle();
      setMyRoom(room as Room | null);
    } else {
      setMyRoom(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (subScreen) return;
    load();
    // Poll so room-ready alerts and lock changes show up without a refresh.
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [subScreen, selectedTripId]);

  if (loading) {
    return (
      <Page>
        <Text style={styles.normalText}>Loading...</Text>
      </Page>
    );
  }

  // An invite link for a trip the student isn't on yet opens the join screen.
  const inviteCode = joinCode && !myTrips.some((t) => t.trip_code === joinCode) ? joinCode : null;
  if (!guest || !trip || subScreen === 'join' || inviteCode) {
    return (
      <JoinTrip
        profile={profile}
        initialCode={inviteCode}
        onJoined={(tripId) => {
          onJoinCodeUsed?.();
          setSelectedTripId(tripId);
          setSubScreen(null);
          load();
        }}
        onBack={() => {
          onJoinCodeUsed?.();
          if (guest) setSubScreen(null);
          else onBack();
        }}
        onLogout={onLogout}
      />
    );
  }

  const back = () => setSubScreen(null);
  if (subScreen === 'rooms') return <RoomsScreen me={guest} trip={trip} onBack={back} />;
  if (subScreen === 'roommate') return <RoommateRequestScreen guestId={guest.id} tripId={trip.id} onBack={back} />;
  if (subScreen === 'messages') return <MessagesScreen role="student" tripId={trip.id} guestId={guest.id} onBack={back} />;
  if (subScreen === 'myinfo') return <MyInfoScreen me={guest} onBack={back} />;
  if (subScreen === 'schedule') return <ScheduleScreen trip={trip} canEdit={false} onBack={back} />;
  if (subScreen === 'roomchecks' && guest.is_chaperone) return <RoomChecksScreen trip={trip} checkerName={guest.legal_name} onBack={back} />;
  if (subScreen === 'notifications') {
    return (
      <NotificationsScreen
        scope={{ audience: 'guest', guestId: guest.id }}
        userId={profile.id}
        onBack={back}
        openable={STUDENT_LINKS}
        onOpen={(link) => setSubScreen(link as SubScreen)}
      />
    );
  }

  const deadlinePassed = Boolean(trip.lock_deadline && new Date(trip.lock_deadline).getTime() <= Date.now());

  return (
    <Page
      hero={
        <Hero
          image={photos.room}
          eyebrow={`${trip.name} · ${formatDateRange(trip.check_in, trip.check_out)}`}
          title={`Hi, ${profile.full_name.split(' ')[0] || 'there'}`}
          subtitle={`${trip.hotel_name}${trip.hotel_address ? ` · ${trip.hotel_address}` : ''}`}
          onBack={onBack}
          backLabel="Home"
        />
      }
    >
      {myTrips.length > 1 && (
        <View style={[styles.actionRow, { marginBottom: 16, marginTop: 0 }]}>
          {myGuests.map((g) => {
            const t = myTrips.find((x) => x.id === g.trip_id);
            const selected = g.trip_id === trip.id;
            return (
              <TouchableOpacity
                key={g.id}
                style={selected ? [styles.threadTab, styles.threadTabSelected] : styles.threadTab}
                onPress={() => setSelectedTripId(g.trip_id)}
              >
                <Text style={selected ? [styles.threadTabText, styles.threadTabTextSelected] : styles.threadTabText}>{t?.name ?? 'Trip'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {trip.locked_at && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{myRoom ? 'Rooms are locked. Your room is final.' : 'Rooms are locked. Your advisor will place you in a room.'}</Text>
        </View>
      )}

      {!hasEmergencyContact && (
        <TouchableOpacity style={styles.banner} onPress={() => setSubScreen('myinfo')}>
          <Text style={styles.bannerText}>Add an emergency contact before the trip · Tap here</Text>
        </TouchableOpacity>
      )}

      {!trip.locked_at && (pending.invites > 0 || pending.requests > 0) && (
        <TouchableOpacity style={[styles.banner, { backgroundColor: colors.primarySoft }]} onPress={() => setSubScreen('rooms')}>
          <Text style={[styles.bannerText, { color: colors.primaryDark }]}>
            {[
              pending.invites ? `You have ${pending.invites} room invite${pending.invites === 1 ? '' : 's'}` : '',
              pending.requests ? `${pending.requests} request${pending.requests === 1 ? '' : 's'} to join your room` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
            {' · Tap to respond'}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Your room</Text>
        {myRoom ? (
          <>
            <Text style={[styles.bigBlueText, { textAlign: 'left', marginBottom: 8 }]}>{`Room ${myRoom.room_number}`}</Text>
            {guest.checked_in_at ? (
              <Badge text="Checked in ✓" tone="green" />
            ) : myRoom.ready_at ? (
              <Badge text="Ready, head to the front desk" tone="green" />
            ) : trip.locked_at ? (
              <Badge text="Hotel is preparing your room" tone="amber" />
            ) : (
              <Badge text="You can still switch rooms" tone="blue" />
            )}
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>No room yet</Text>
            <Text style={styles.mutedText}>{trip.locked_at ? 'Your advisor will place you in a room.' : 'Pick a room or ask to join friends.'}</Text>
          </>
        )}
        {!trip.locked_at && trip.lock_deadline && !deadlinePassed && (
          <Text style={[styles.mutedText, { color: colors.warning }]}>{`Pick by ${formatDeadline(trip.lock_deadline)}. Rooms lock automatically after that.`}</Text>
        )}
        <Text style={styles.mutedText}>{`Estimated arrival: ${formatTime(trip.arrival_time)}`}</Text>
      </View>

      <View style={styles.buttonsGrid}>
        <Tile icon="bed-outline" label={myRoom ? 'My Room' : 'Pick a Room'} onPress={() => setSubScreen('rooms')} />
        <Tile icon="notifications-outline" label="Notifications" count={unread} onPress={() => setSubScreen('notifications')} tint="#DB2777" />
        <Tile icon="chatbubbles-outline" label="Messages" onPress={() => setSubScreen('messages')} tint="#7C3AED" />
        <Tile icon="medkit-outline" label="My Info" onPress={() => setSubScreen('myinfo')} tint={colors.danger} />
        <Tile icon="people-outline" label="Roommate Preference" onPress={() => setSubScreen('roommate')} tint={colors.success} />
        <Tile icon="calendar-outline" label="Schedule" onPress={() => setSubScreen('schedule')} tint="#0891B2" />
        {guest.is_chaperone && <Tile icon="moon-outline" label="Room Checks" onPress={() => setSubScreen('roomchecks')} tint="#7C3AED" />}
        <Tile icon="add-circle-outline" label="Join Another Trip" onPress={() => setSubScreen('join')} tint={colors.muted} />
      </View>

      <Announcements tripId={trip.id} />

      <LocationSharing guest={guest} onChanged={load} />

      <TouchableOpacity style={styles.secondaryButton} onPress={onOpenDisplay}>
        <Text style={styles.secondaryButtonText}>Display Settings</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={onLogout}>
        <Text style={styles.secondaryButtonText}>Log Out</Text>
      </TouchableOpacity>
    </Page>
  );
}

type FoundTrip = Pick<Trip, 'id' | 'name' | 'hotel_name' | 'hotel_address' | 'school' | 'check_in' | 'check_out' | 'locked_at'>;

function JoinTrip({
  profile,
  initialCode,
  onJoined,
  onBack,
  onLogout,
}: {
  profile: Profile;
  initialCode?: string | null;
  onJoined: (tripId: number) => void;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [code, setCode] = useState(initialCode ?? '');
  const [found, setFound] = useState<FoundTrip | null>(null);
  const [loading, setLoading] = useState(false);
  const [school, setSchool] = useState(profile.school);
  const [gender, setGender] = useState<Gender | ''>(profile.gender);
  const [phone, setPhone] = useState(profile.phone);
  const profileIncomplete = !profile.school || !profile.gender || !profile.phone;

  const handleFind = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      showAlert('Missing code', 'Enter the trip code from your advisor.');
      return;
    }
    setLoading(true);
    // Students can't read trips they aren't on, so the lookup goes through a server function.
    const { data, error } = await supabase.rpc('find_trip_by_code', { p_code: trimmed });
    setLoading(false);
    if (error) {
      showAlert('Error', errorMessage(error));
      return;
    }
    if (!data) {
      showAlert('Trip not found', 'Check the code and try again.');
      return;
    }
    setFound(data as FoundTrip);
  };

  // Opened from an invite link: look the trip up right away.
  useEffect(() => {
    if (initialCode) handleFind();
  }, []);

  const handleJoin = async () => {
    if (!found) return;
    if (!school.trim() || !gender || !phone.trim()) {
      showAlert('Finish your profile', 'Add your school, gender, and phone so we can match you to rooms.');
      return;
    }
    // Each trip code belongs to exactly one school (the server checks this too).
    if (found.school && !sameText(found.school, school)) {
      showAlert('Wrong school', `This trip code is for ${found.school}. Ask your advisor for your school's code.`);
      return;
    }

    setLoading(true);
    if (profileIncomplete) {
      await supabase.auth.updateUser({ data: { school: school.trim(), gender, phone: phone.trim() } });
    }
    const { data: joined, error } = await supabase.rpc('join_trip', {
      p_trip_id: found.id,
      p_full_name: profile.full_name,
      p_phone: phone.trim(),
      p_school: school.trim(),
      p_gender: gender,
      p_is_chaperone: profile.role === 'Chaperone',
    });
    setLoading(false);
    if (error) {
      showAlert('Could not join', errorMessage(error));
      return;
    }
    const who = `${profile.full_name}${profile.role === 'Chaperone' ? ' (chaperone)' : ''}`;
    // An advisor may have added (and placed) this student already; only flag a late join with no room.
    const { data: placed } = await supabase.from('assignments').select('room_id').eq('guest_id', (joined as Guest | null)?.id ?? -1).maybeSingle();
    if (found.locked_at && !placed) {
      // Joining isn't a room change, so late students can still join; the advisor places them.
      await notify(found.id, 'advisor', 'Late join: needs a room', `${who} joined ${found.name} after rooms were locked. Unlock rooms to place them, then lock again to resend the manifest.`, null, 'assign');
    } else {
      await notify(found.id, 'advisor', 'Student joined', `${who} joined ${found.name}.`, null, 'roster');
    }
    await checkBedCount(found.id);
    onJoined(found.id);
  };

  return (
    <Page
      hero={
        <Hero
          image={photos.friends}
          eyebrow="GroupStay"
          title="Join your trip"
          subtitle="Enter the 6-character trip code from your advisor."
          onBack={found ? () => setFound(null) : onBack}
          height={240}
        />
      }
    >
      {!found ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Trip Code"
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
            value={code}
            onChangeText={setCode}
            onSubmitEditing={handleFind}
          />
          <TouchableOpacity style={styles.button} onPress={handleFind} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Looking...' : 'Find Trip'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Is this your trip?</Text>
          <Text style={styles.cardTitle}>{found.name}</Text>
          <Text style={styles.cardText}>{`${found.hotel_name} · ${formatDateRange(found.check_in, found.check_out)}`}</Text>
          {found.hotel_address ? <Text style={styles.mutedText}>{found.hotel_address}</Text> : null}
          <Text style={styles.mutedText}>{`For ${found.school ?? 'any school'}`}</Text>

          {profileIncomplete && (
            <>
              <Text style={[styles.label, { marginTop: 16 }]}>Finish your profile</Text>
              <TextInput style={styles.input} placeholder="School" placeholderTextColor="#94A3B8" value={school} onChangeText={setSchool} />
              <TextInput
                style={styles.input}
                placeholder="Phone Number"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
              <OptionPicker options={GENDERS} value={gender} onChange={setGender} />
            </>
          )}

          <TouchableOpacity style={[styles.button, { marginTop: 12 }]} onPress={handleJoin} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Joining...' : 'Yes, Join This Trip'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setFound(null)}>
            <Text style={styles.secondaryButtonText}>Not My Trip</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.backButton} onPress={onLogout}>
        <Text style={styles.backText}>Log Out</Text>
      </TouchableOpacity>
    </Page>
  );
}

// Opt-in, trip-scoped location sharing. Only advisors can read the locations table.
function LocationSharing({ guest, onChanged }: { guest: Guest; onChanged: () => void }) {
  const [sharing, setSharing] = useState(guest.share_location);
  const [status, setStatus] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendLocation = async () => {
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await supabase.from('locations').upsert(
        [
          {
            guest_id: guest.id,
            trip_id: guest.trip_id,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'guest_id' },
      );
      setStatus(`Last shared at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    } catch (error) {
      setStatus(`Couldn't get your location: ${errorMessage(error)}`);
    }
  };

  useEffect(() => {
    if (!sharing) return;
    sendLocation();
    intervalRef.current = setInterval(sendLocation, 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sharing]);

  const toggle = async (next: boolean) => {
    if (next) {
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (permission !== 'granted') {
        showAlert('Location permission needed', 'Allow location access to share it with your advisor.');
        return;
      }
      await supabase.from('guests').update({ share_location: true }).eq('id', guest.id);
    } else {
      await supabase.from('guests').update({ share_location: false }).eq('id', guest.id);
      await supabase.from('locations').delete().eq('guest_id', guest.id);
      setStatus('');
    }
    setSharing(next);
    onChanged();
  };

  return (
    <View style={styles.card}>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Share my location</Text>
          <Text style={styles.mutedText}>Only your advisors can see it, and only for this trip. Turn it off anytime.</Text>
        </View>
        <Switch value={sharing} onValueChange={toggle} />
      </View>
      {status ? <Text style={styles.mutedText}>{status}</Text> : null}
    </View>
  );
}
