import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';
import { RoomHistoryEntry, Trip } from '../lib/types';
import { BackButton, Page } from '../components/ui';
import { styles } from '../styles';

const describe = (e: RoomHistoryEntry) => {
  switch (e.action) {
    case 'joined':
      return `joined room ${e.to_room}`;
    case 'left':
      return `left room ${e.from_room}`;
    case 'moved':
      return `moved from room ${e.from_room} to room ${e.to_room}`;
    case 'assigned':
      return `was placed in room ${e.to_room}`;
    default:
      return `was taken out of room ${e.from_room}`;
  }
};

// A log of every room change, newest first.
export default function RoomHistoryScreen({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  const [entries, setEntries] = useState<RoomHistoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('room_history')
      .select('id, trip_id, guest_id, guest_name, action, from_room, to_room, changed_by, created_at')
      .eq('trip_id', trip.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setEntries((data ?? []) as RoomHistoryEntry[]);
        setLoading(false);
      });
  }, [trip.id]);

  const shown = entries.filter((e) => e.guest_name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Room History</Text>
      <Text style={styles.pageSubtitle}>Every room change on this trip, newest first.</Text>
      <TextInput style={styles.input} placeholder="Search by name" placeholderTextColor={colors.faint} value={search} onChangeText={setSearch} />
      {loading ? (
        <Text style={styles.normalText}>Loading...</Text>
      ) : shown.length === 0 ? (
        <Text style={styles.normalText}>{entries.length ? 'No changes for that name.' : 'No room changes yet.'}</Text>
      ) : (
        shown.map((e) => (
          <View key={e.id} style={styles.card}>
            <Text style={styles.cardText}>
              <Text style={{ fontWeight: '800', color: colors.ink }}>{e.guest_name}</Text> {describe(e)}
            </Text>
            <Text style={styles.mutedText}>
              {`${e.changed_by === e.guest_name ? 'By themselves' : `By ${e.changed_by}`} · ${new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
            </Text>
          </View>
        ))
      )}
    </Page>
  );
}
