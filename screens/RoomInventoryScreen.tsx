import { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { confirmAction, errorMessage, showAlert } from '../lib/alert';
import { notify } from '../lib/notify';
import { checkBedCount } from '../lib/beds';
import { roomTypeForCapacity, sameText } from '../lib/rooms';
import { Room, ROOM_COLUMNS, Trip } from '../lib/types';
import { BackButton, Badge, OptionPicker, Page, SmallButton } from '../components/ui';
import { styles } from '../styles';

const GENDER_OPTIONS = ['Any', 'Male', 'Female'] as const;

export default function RoomInventoryScreen({ trip, role, onBack }: { trip: Trip; role: 'staff' | 'advisor'; onBack: () => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [occupancy, setOccupancy] = useState<Map<number, number>>(new Map());
  const [roomNumber, setRoomNumber] = useState('');
  const [capacity, setCapacity] = useState('2');
  const [gender, setGender] = useState<(typeof GENDER_OPTIONS)[number]>('Any');
  const [school, setSchool] = useState(trip.school ?? '');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: roomRows }, { data: assignmentRows }] = await Promise.all([
      supabase.from('rooms').select(ROOM_COLUMNS).eq('trip_id', trip.id).order('room_number', { ascending: true }),
      supabase.from('assignments').select('room_id').eq('trip_id', trip.id),
    ]);
    const counts = new Map<number, number>();
    (assignmentRows ?? []).forEach((row) => counts.set(row.room_id, (counts.get(row.room_id) ?? 0) + 1));
    setRooms((roomRows ?? []) as Room[]);
    setOccupancy(counts);
  };

  useEffect(() => {
    load();
  }, [trip.id]);

  const totalBeds = rooms.reduce((sum, room) => sum + room.capacity, 0);

  const handleAdd = async () => {
    const number = roomNumber.trim();
    const beds = Number(capacity);
    if (!number) {
      showAlert('Missing room number', 'Enter the room number.');
      return;
    }
    if (!beds || beds <= 0 || beds > 12) {
      showAlert('Invalid capacity', 'Capacity must be between 1 and 12.');
      return;
    }
    if (!school.trim()) {
      showAlert('Missing school', 'Enter which school this room is for.');
      return;
    }
    if (rooms.some((room) => sameText(room.room_number, number))) {
      showAlert('Already added', `Room ${number} is already on this trip.`);
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('rooms').insert([
      {
        trip_id: trip.id,
        room_number: number,
        capacity: beds,
        room_type: roomTypeForCapacity(beds),
        gender: gender === 'Any' ? null : gender,
        school: school.trim(),
      },
    ]);
    setSaving(false);

    if (error) {
      showAlert('Could not add room', errorMessage(error));
      return;
    }

    if (role === 'staff') {
      await notify(trip.id, 'advisor', 'Hotel added a room', `${trip.hotel_name} added room ${number} (${beds} beds${gender === 'Any' ? '' : `, ${gender}`}).`, null, 'assign');
    }
    setRoomNumber('');
    await checkBedCount(trip.id);
    await load();
  };

  const handleDelete = async (room: Room) => {
    const ok = await confirmAction('Remove room?', `Remove room ${room.room_number} from this trip?`, 'Remove');
    if (!ok) return;
    const { error } = await supabase.from('rooms').delete().eq('id', room.id);
    if (error) {
      showAlert('Could not remove room', errorMessage(error));
      return;
    }
    await checkBedCount(trip.id);
    await load();
  };

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Room Inventory</Text>
      <Text style={styles.pageSubtitle}>{`${trip.school ?? ''} · ${trip.name}\n${rooms.length} rooms · ${totalBeds} beds for ${trip.headcount ?? '?'} people`}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add a room</Text>
        <TextInput
          style={styles.input}
          placeholder="Room number (e.g. 405)"
          placeholderTextColor="#94A3B8"
          value={roomNumber}
          onChangeText={setRoomNumber}
        />
        <TextInput
          style={styles.input}
          placeholder="Capacity (beds)"
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
          value={capacity}
          onChangeText={setCapacity}
        />
        {!trip.school && (
          <TextInput
            style={styles.input}
            placeholder="School"
            placeholderTextColor="#94A3B8"
            value={school}
            onChangeText={setSchool}
          />
        )}
        <Text style={styles.label}>Gender designation (optional)</Text>
        <OptionPicker options={GENDER_OPTIONS} value={gender} onChange={setGender} />
        <TouchableOpacity style={styles.button} onPress={handleAdd} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Add Room'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Rooms</Text>
      {rooms.length === 0 ? (
        <Text style={styles.normalText}>No rooms yet.</Text>
      ) : (
        rooms.map((room) => {
          const occupied = occupancy.get(room.id) ?? 0;
          return (
            <View key={room.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{`Room ${room.room_number}`}</Text>
                {room.ready_at ? <Badge text="Ready" tone="green" /> : null}
              </View>
              <Text style={styles.cardText}>{`${room.room_type} · ${room.gender ?? 'Any gender'} · ${room.school}`}</Text>
              <Text style={styles.mutedText}>{`${occupied} of ${room.capacity} beds taken`}</Text>
              {occupied === 0 && !trip.locked_at && (
                <View style={styles.actionRow}>
                  <SmallButton text="Remove" secondary onPress={() => handleDelete(room)} />
                </View>
              )}
            </View>
          );
        })
      )}
    </Page>
  );
}
