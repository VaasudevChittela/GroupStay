import { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { confirmAction, errorMessage, showAlert } from '../lib/alert';
import { notifyGuests } from '../lib/notify';
import { formatTime, stepTime } from '../lib/format';
import { colors, fs } from '../lib/theme';
import { ScheduleItem, Trip } from '../lib/types';
import { BackButton, Page, SmallButton } from '../components/ui';
import { styles } from '../styles';

// The trip's days, from check-in to check-out.
function tripDays(trip: Trip) {
  if (!trip.check_in) return [];
  const days: string[] = [];
  const start = new Date(`${trip.check_in}T12:00:00`);
  const end = new Date(`${trip.check_out ?? trip.check_in}T12:00:00`);
  for (let d = new Date(start); d <= end && days.length < 14; d.setDate(d.getDate() + 1)) {
    days.push(`${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`);
  }
  return days;
}

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

export default function ScheduleScreen({ trip, canEdit, onBack }: { trip: Trip; canEdit: boolean; onBack: () => void }) {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const days = tripDays(trip);
  const [day, setDay] = useState(days[0] ?? '');
  const [time, setTime] = useState('09:00');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('schedule_items').select('id, trip_id, starts_at, title, location, notes').eq('trip_id', trip.id).order('starts_at', { ascending: true });
    setItems((data ?? []) as ScheduleItem[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [trip.id]);

  const add = async () => {
    if (!title.trim() || !day) {
      showAlert('Missing info', 'Add a title and pick a day.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('schedule_items').insert([
      { trip_id: trip.id, starts_at: `${day}T${time}:00`, title: title.trim(), location: location.trim() || null, notes: notes.trim() || null },
    ]);
    setSaving(false);
    if (error) {
      showAlert('Could not add', errorMessage(error));
      return;
    }
    const { data: guests } = await supabase.from('guests').select('id').eq('trip_id', trip.id);
    await notifyGuests(trip.id, (guests ?? []).map((g) => g.id), 'Schedule updated', `${title.trim()}, ${dayLabel(day)} at ${formatTime(time)}.`, 'schedule');
    setTitle('');
    setLocation('');
    setNotes('');
    await load();
  };

  const remove = async (item: ScheduleItem) => {
    if (!(await confirmAction('Remove from schedule?', item.title, 'Remove'))) return;
    await supabase.from('schedule_items').delete().eq('id', item.id);
    await load();
  };

  const grouped = new Map<string, ScheduleItem[]>();
  items.forEach((item) => {
    const key = item.starts_at.slice(0, 10);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  });

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Schedule</Text>
      <Text style={styles.pageSubtitle}>{`${trip.name} · ${trip.hotel_name}`}</Text>

      {loading ? (
        <Text style={styles.normalText}>Loading...</Text>
      ) : items.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardText}>{canEdit ? 'No events yet. Add the bus times, meals, and sessions below.' : 'Your advisor hasn’t posted the schedule yet.'}</Text>
        </View>
      ) : (
        [...grouped.entries()].map(([key, dayItems]) => (
          <View key={key}>
            <Text style={styles.sectionTitle}>{dayLabel(key)}</Text>
            {dayItems.map((item) => (
              <View key={item.id} style={[styles.card, { flexDirection: 'row', gap: 14 }]}>
                <View style={{ width: fs(84) }}>
                  <Text style={[styles.cardTitle, { color: colors.primary }]}>{formatTime(item.starts_at.slice(11, 16))}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  {item.location ? <Text style={styles.cardText}>{item.location}</Text> : null}
                  {item.notes ? <Text style={styles.mutedText}>{item.notes}</Text> : null}
                  {canEdit && (
                    <View style={styles.actionRow}>
                      <SmallButton text="Remove" secondary onPress={() => remove(item)} />
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        ))
      )}

      {canEdit && (
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.cardTitle}>Add to schedule</Text>
          <Text style={styles.label}>Day</Text>
          <View style={[styles.actionRow, { marginTop: 0, marginBottom: 12 }]}>
            {days.map((d) => (
              <TouchableOpacity key={d} style={d === day ? [styles.threadTab, styles.threadTabSelected] : styles.threadTab} onPress={() => setDay(d)}>
                <Text style={d === day ? [styles.threadTabText, styles.threadTabTextSelected] : styles.threadTabText}>
                  {new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Time</Text>
          <View style={[styles.rowBetween, { marginBottom: 12 }]}>
            <SmallButton text="− 15 min" secondary onPress={() => setTime((t) => stepTime(t, -15))} />
            <Text style={[styles.cardTitle, { fontSize: 22 }]}>{formatTime(time)}</Text>
            <SmallButton text="+ 15 min" secondary onPress={() => setTime((t) => stepTime(t, 15))} />
          </View>
          <TextInput style={styles.input} placeholder="What (e.g. Bus leaves school)" placeholderTextColor={colors.faint} value={title} onChangeText={setTitle} />
          <TextInput style={styles.input} placeholder="Where (optional)" placeholderTextColor={colors.faint} value={location} onChangeText={setLocation} />
          <TextInput style={styles.input} placeholder="Notes (optional)" placeholderTextColor={colors.faint} value={notes} onChangeText={setNotes} />
          <TouchableOpacity style={styles.button} onPress={add} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? 'Adding...' : 'Add Event'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </Page>
  );
}
