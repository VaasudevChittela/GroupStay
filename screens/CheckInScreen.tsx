import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { notify } from '../lib/notify';
import { Guest, GUEST_COLUMNS, Room, ROOM_COLUMNS, Trip } from '../lib/types';
import { BackButton, Badge, Page, SmallButton } from '../components/ui';
import { styles } from '../styles';

// Check-in day: mark who has arrived and picked up keys, room by room.
export default function CheckInScreen({ trip, role, onBack }: { trip: Trip; role: 'advisor' | 'staff'; onBack: () => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [roomOf, setRoomOf] = useState<Map<number, number>>(new Map());
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: roomRows }, { data: guestRows }, { data: assignmentRows }] = await Promise.all([
      supabase.from('rooms').select(ROOM_COLUMNS).eq('trip_id', trip.id).order('room_number', { ascending: true }),
      supabase.from('guests').select(GUEST_COLUMNS).eq('trip_id', trip.id).order('legal_name', { ascending: true }),
      supabase.from('assignments').select('guest_id, room_id').eq('trip_id', trip.id),
    ]);
    setRooms((roomRows ?? []) as Room[]);
    setGuests((guestRows ?? []) as Guest[]);
    setRoomOf(new Map((assignmentRows ?? []).map((a) => [a.guest_id, a.room_id])));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [trip.id]);

  const setCheckedIn = async (people: Guest[], checkedIn: boolean) => {
    if (busy || people.length === 0) return;
    setBusy(true);
    const { error } = await supabase
      .from('guests')
      .update({ checked_in_at: checkedIn ? new Date().toISOString() : null })
      .in('id', people.map((g) => g.id));
    if (error) {
      setBusy(false);
      showAlert('Could not update', errorMessage(error));
      return;
    }
    if (checkedIn) {
      await Promise.all(people.map((g) => notify(trip.id, 'guest', "You're checked in", `Welcome to ${trip.hotel_name}!`, g.id, 'rooms')));
      // Tell the other side when a whole room is in.
      const touchedRooms = new Set(people.map((g) => roomOf.get(g.id)).filter(Boolean) as number[]);
      for (const roomId of touchedRooms) {
        const occupants = guests.filter((g) => roomOf.get(g.id) === roomId);
        const allIn = occupants.every((g) => g.checked_in_at || people.some((p) => p.id === g.id));
        const room = rooms.find((r) => r.id === roomId);
        if (allIn && room) {
          await notify(trip.id, role === 'staff' ? 'advisor' : 'staff', 'Room checked in', `Everyone in room ${room.room_number} is checked in.`, null, 'checkin');
        }
      }
    }
    setBusy(false);
    await load();
  };

  const matches = (guest: Guest) => guest.legal_name.toLowerCase().includes(search.trim().toLowerCase());
  const checkedInCount = guests.filter((g) => g.checked_in_at).length;
  const noRoom = guests.filter((g) => !roomOf.has(g.id) && matches(g));

  const personRow = (guest: Guest) => (
    <View key={guest.id} style={[styles.rowBetween, { marginBottom: 6 }]}>
      <Text style={[styles.cardText, { flex: 1 }]}>{`${guest.checked_in_at ? '✓ ' : '• '}${guest.legal_name}${guest.is_chaperone ? ' (chaperone)' : ''}`}</Text>
      {guest.checked_in_at ? (
        <SmallButton text="Undo" secondary onPress={() => setCheckedIn([guest], false)} disabled={busy} />
      ) : (
        <SmallButton text="Check In" onPress={() => setCheckedIn([guest], true)} disabled={busy} />
      )}
    </View>
  );

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Check-In</Text>
      <Text style={styles.pageSubtitle}>{`${trip.school ?? trip.name} · ${checkedInCount} of ${guests.length} checked in`}</Text>
      <TextInput style={styles.input} placeholder="Search by name" placeholderTextColor="#94A3B8" value={search} onChangeText={setSearch} />

      {rooms.map((room) => {
        const occupants = guests.filter((g) => roomOf.get(g.id) === room.id);
        const shown = occupants.filter(matches);
        if (shown.length === 0) return null;
        const waiting = occupants.filter((g) => !g.checked_in_at);
        return (
          <View key={room.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{`Room ${room.room_number}`}</Text>
              {waiting.length === 0 ? (
                <Badge text="All checked in" tone="green" />
              ) : (
                <Badge text={`${occupants.length - waiting.length} of ${occupants.length} in`} tone="amber" />
              )}
            </View>
            {shown.map(personRow)}
            {waiting.length > 1 && (
              <View style={styles.actionRow}>
                <SmallButton text="Check In Whole Room" onPress={() => setCheckedIn(waiting, true)} disabled={busy} />
              </View>
            )}
          </View>
        );
      })}

      {noRoom.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No room yet</Text>
          {noRoom.map(personRow)}
        </View>
      )}
    </Page>
  );
}
