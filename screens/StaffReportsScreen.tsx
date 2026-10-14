import { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { saveCsv, toCsv } from '../lib/manifest';
import { formatDateRange } from '../lib/format';
import { colors } from '../lib/theme';
import { Trip } from '../lib/types';
import { BackButton, Page } from '../components/ui';
import { styles } from '../styles';

type Row = { trip: Trip; nights: number; rooms: number; roomsBooked: number; roomNights: number; guests: number; checkedIn: number };

const nightsBetween = (a: string | null, b: string | null) =>
  a && b ? Math.max(1, Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000)) : 1;

// What each group booked through GroupStay: the numbers a hotel needs for billing and for
// deciding whether to keep the pilot going.
export default function StaffReportsScreen({ trips, onBack }: { trips: Trip[]; onBack: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fee, setFee] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const ids = trips.map((t) => t.id);
      const [{ data: rooms }, { data: assignments }, { data: guests }] = await Promise.all([
        supabase.from('rooms').select('id, trip_id').in('trip_id', ids.length ? ids : [-1]),
        supabase.from('assignments').select('room_id, trip_id').in('trip_id', ids.length ? ids : [-1]),
        supabase.from('guests').select('trip_id, checked_in_at').in('trip_id', ids.length ? ids : [-1]),
      ]);
      setRows(
        trips.map((trip) => {
          const tripRooms = (rooms ?? []).filter((r) => r.trip_id === trip.id);
          const occupied = new Set((assignments ?? []).filter((a) => a.trip_id === trip.id).map((a) => a.room_id));
          const nights = nightsBetween(trip.check_in, trip.check_out);
          return {
            trip,
            nights,
            rooms: tripRooms.length,
            roomsBooked: occupied.size,
            roomNights: occupied.size * nights,
            guests: (guests ?? []).filter((g) => g.trip_id === trip.id).length,
            checkedIn: (guests ?? []).filter((g) => g.trip_id === trip.id && g.checked_in_at).length,
          };
        }),
      );
      setLoading(false);
    };
    load();
  }, [trips]);

  const totals = rows.reduce(
    (t, r) => ({ roomsBooked: t.roomsBooked + r.roomsBooked, roomNights: t.roomNights + r.roomNights, guests: t.guests + r.guests }),
    { roomsBooked: 0, roomNights: 0, guests: 0 },
  );
  const feeNumber = Number(fee) || 0;

  const download = () => {
    const csv = toCsv([
      ['School', 'Trip', 'Check-in', 'Check-out', 'Nights', 'Rooms on hold', 'Rooms booked', 'Room-nights', 'Guests', 'Checked in'],
      ...rows.map((r) => [
        r.trip.school ?? '',
        r.trip.name,
        r.trip.check_in ?? '',
        r.trip.check_out ?? '',
        String(r.nights),
        String(r.rooms),
        String(r.roomsBooked),
        String(r.roomNights),
        String(r.guests),
        String(r.checkedIn),
      ]),
      ['Total', '', '', '', '', '', String(totals.roomsBooked), String(totals.roomNights), String(totals.guests), ''],
    ]);
    saveCsv('groupstay-hotel-report.csv', csv).catch((e) => showAlert('Export failed', errorMessage(e)));
  };

  const stat = (value: string | number, label: string) => (
    <View style={styles.statBox}>
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Reports</Text>
      <Text style={styles.pageSubtitle}>Rooms booked through GroupStay. A room counts as booked once someone is placed in it.</Text>

      <View style={styles.statsContainer}>
        {stat(rows.length, 'Groups')}
        {stat(totals.roomsBooked, 'Rooms booked')}
        {stat(totals.roomNights, 'Room-nights')}
        {stat(totals.guests, 'Guests')}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Estimate fees (optional)</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.cardText}>Fee per room booked ($)</Text>
          <TextInput
            style={[styles.input, { width: 110, marginBottom: 0, textAlign: 'right' }]}
            placeholder="0"
            placeholderTextColor={colors.faint}
            keyboardType="decimal-pad"
            value={fee}
            onChangeText={setFee}
          />
        </View>
        {feeNumber > 0 && <Text style={[styles.cardTitle, { marginTop: 10 }]}>{`Estimated total: $${(feeNumber * totals.roomsBooked).toFixed(2)}`}</Text>}
      </View>

      <Text style={styles.sectionTitle}>By group</Text>
      {loading ? (
        <Text style={styles.normalText}>Loading...</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.normalText}>No groups yet.</Text>
      ) : (
        rows.map((r) => (
          <View key={r.trip.id} style={styles.card}>
            <Text style={styles.cardTitle}>{r.trip.school ?? r.trip.name}</Text>
            <Text style={styles.mutedText}>{`${r.trip.name} · ${formatDateRange(r.trip.check_in, r.trip.check_out)} · ${r.nights} night${r.nights === 1 ? '' : 's'}`}</Text>
            <Text style={styles.cardText}>{`${r.roomsBooked} of ${r.rooms} rooms booked · ${r.roomNights} room-nights`}</Text>
            <Text style={styles.cardText}>{`${r.guests} guests · ${r.checkedIn} checked in${feeNumber > 0 ? ` · $${(feeNumber * r.roomsBooked).toFixed(2)}` : ''}`}</Text>
          </View>
        ))
      )}

      <TouchableOpacity style={styles.button} onPress={download}>
        <Text style={styles.buttonText}>Download Report (CSV)</Text>
      </TouchableOpacity>
    </Page>
  );
}
