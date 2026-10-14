import { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { notify } from '../lib/notify';
import { timeAgo } from '../lib/format';
import { colors } from '../lib/theme';
import { Room, ROOM_COLUMNS, RoomCheck, Trip } from '../lib/types';
import { BackButton, Badge, Page, SmallButton } from '../components/ui';
import { styles } from '../styles';

// Every night of the trip (check-in through the night before check-out).
function tripNights(trip: Trip) {
  if (!trip.check_in) return [];
  const nights: string[] = [];
  const end = new Date(`${trip.check_out ?? trip.check_in}T12:00:00`);
  for (let d = new Date(`${trip.check_in}T12:00:00`); d < end && nights.length < 14; d.setDate(d.getDate() + 1)) {
    nights.push(`${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`);
  }
  return nights.length ? nights : [trip.check_in];
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
};

// Curfew checks: chaperones tick off each room every night, or report a problem.
export default function RoomChecksScreen({ trip, checkerName, onBack }: { trip: Trip; checkerName: string; onBack: () => void }) {
  const nights = tripNights(trip);
  const [night, setNight] = useState(nights.includes(today()) ? today() : nights[0]);
  const [rooms, setRooms] = useState<Array<Room & { names: string[] }>>([]);
  const [checks, setChecks] = useState<RoomCheck[]>([]);
  const [reportingRoom, setReportingRoom] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: roomRows }, { data: guests }, { data: assignments }, { data: checkRows }] = await Promise.all([
      supabase.from('rooms').select(ROOM_COLUMNS).eq('trip_id', trip.id).order('room_number', { ascending: true }),
      supabase.from('guests').select('id, legal_name').eq('trip_id', trip.id),
      supabase.from('assignments').select('guest_id, room_id').eq('trip_id', trip.id),
      supabase.from('room_checks').select('id, trip_id, room_id, night, status, note, checked_by, created_at').eq('trip_id', trip.id).eq('night', night),
    ]);
    const nameOf = new Map((guests ?? []).map((g) => [g.id, g.legal_name]));
    setRooms(
      ((roomRows ?? []) as Room[])
        .map((room) => ({
          ...room,
          names: (assignments ?? []).filter((a) => a.room_id === room.id).map((a) => nameOf.get(a.guest_id) ?? '?'),
        }))
        .filter((room) => room.names.length > 0),
    );
    setChecks((checkRows ?? []) as RoomCheck[]);
  };

  useEffect(() => {
    load();
  }, [night]);

  // The latest check for each room this night.
  const latest = new Map<number, RoomCheck>();
  [...checks].sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((c) => latest.set(c.room_id, c));

  const record = async (room: Room, status: 'ok' | 'issue', issueNote = '') => {
    setBusy(true);
    const { error } = await supabase
      .from('room_checks')
      .insert([{ trip_id: trip.id, room_id: room.id, night, status, note: issueNote || null, checked_by: checkerName }]);
    setBusy(false);
    if (error) {
      showAlert('Could not save', errorMessage(error));
      return;
    }
    if (status === 'issue') {
      await notify(trip.id, 'advisor', `Room check issue: ${room.room_number}`, `${checkerName}: ${issueNote || 'Problem reported.'}`, null, 'roomchecks');
    }
    setReportingRoom(null);
    setNote('');
    await load();
  };

  const done = rooms.filter((r) => latest.get(r.id)?.status === 'ok').length;
  const issues = rooms.filter((r) => latest.get(r.id)?.status === 'issue').length;

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Room Checks</Text>
      <Text style={styles.pageSubtitle}>{`Nightly curfew check · ${done} of ${rooms.length} rooms all present${issues ? ` · ${issues} with issues` : ''}`}</Text>

      <View style={[styles.actionRow, { marginTop: 0, marginBottom: 16 }]}>
        {nights.map((n) => (
          <TouchableOpacity key={n} style={n === night ? [styles.threadTab, styles.threadTabSelected] : styles.threadTab} onPress={() => setNight(n)}>
            <Text style={n === night ? [styles.threadTabText, styles.threadTabTextSelected] : styles.threadTabText}>
              {`${new Date(`${n}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} night`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {rooms.length === 0 ? (
        <Text style={styles.normalText}>No one is in a room yet.</Text>
      ) : (
        rooms.map((room) => {
          const check = latest.get(room.id);
          return (
            <View key={room.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{`Room ${room.room_number}`}</Text>
                {check?.status === 'ok' ? (
                  <Badge text="All present" tone="green" />
                ) : check?.status === 'issue' ? (
                  <Badge text="Issue reported" tone="amber" />
                ) : (
                  <Badge text="Not checked" />
                )}
              </View>
              <Text style={styles.cardText}>{room.names.join(', ')}</Text>
              {check && (
                <Text style={styles.mutedText}>{`${check.status === 'ok' ? 'Checked' : 'Reported'} by ${check.checked_by} ${timeAgo(check.created_at)}${check.note ? `: ${check.note}` : ''}`}</Text>
              )}
              {reportingRoom === room.id ? (
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    style={styles.input}
                    placeholder="What's wrong? (e.g. Liam not in room at 11:05)"
                    placeholderTextColor={colors.faint}
                    value={note}
                    onChangeText={setNote}
                  />
                  <View style={[styles.actionRow, { marginTop: 0 }]}>
                    <SmallButton text="Send to Advisor" onPress={() => record(room, 'issue', note.trim())} disabled={busy} />
                    <SmallButton text="Cancel" secondary onPress={() => setReportingRoom(null)} />
                  </View>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <SmallButton text="All Present ✓" onPress={() => record(room, 'ok')} disabled={busy} />
                  <SmallButton text="Report Issue" secondary onPress={() => setReportingRoom(room.id)} disabled={busy} />
                </View>
              )}
            </View>
          );
        })
      )}
    </Page>
  );
}
