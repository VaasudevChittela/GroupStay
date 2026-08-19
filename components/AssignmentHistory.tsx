import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../lib/alert';
import { radius, spacing, useTheme } from '../lib/theme';
import {
  ACTION_LABEL,
  ACTOR_LABEL,
  AssignmentEvent,
  formatEventTime,
  loadRoomHistory,
  previousRoomFor,
  restoreAssignment,
} from '../lib/history';
import { formatDate } from '../lib/dates';
import { Card, SecondaryButton, SectionTitle } from './ui';

/**
 * A room's assignment trail. Grouped by day, because "who was in here on the
 * 17th" is the question staff actually arrive with, and timestamps alone force
 * them to do the grouping in their head.
 */
export default function AssignmentHistory({
  roomId,
  roomNumber,
  guestName,
  canRestore,
  onChanged,
}: {
  roomId: string;
  roomNumber: string;
  /** Resolve a guest id to a name; ids alone make the timeline unreadable. */
  guestName: (guestId: string) => string;
  canRestore?: boolean;
  onChanged?: () => Promise<void> | void;
}) {
  const { colors } = useTheme();
  const [events, setEvents] = useState<AssignmentEvent[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setEvents(await loadRoomHistory(roomId));
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!events) return null;

  if (events.length === 0) {
    return (
      <>
        <SectionTitle>History</SectionTitle>
        <Card>
          <Text style={{ color: colors.textTertiary, fontSize: 14 }}>
            Nothing has happened in Room {roomNumber} yet.
          </Text>
        </Card>
      </>
    );
  }

  const shown = expanded ? events : events.slice(0, 6);

  // Group by calendar day so the timeline reads as a log, not a wall of times.
  const days: { day: string; rows: AssignmentEvent[] }[] = [];
  shown.forEach((event) => {
    const day = event.created_at.split('T')[0];
    const last = days[days.length - 1];
    if (last && last.day === day) last.rows.push(event);
    else days.push({ day, rows: [event] });
  });

  const restore = (event: AssignmentEvent) => {
    const previous = previousRoomFor(events, event.guest_id);
    if (!previous) return;

    Alert.alert(
      'Restore previous assignment',
      `Put ${guestName(event.guest_id)} back where they were before this move?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setBusy(true);
            const { error } = await restoreAssignment(event.guest_id);
            setBusy(false);
            if (error) {
              Alert.alert('Could not restore', error);
              return;
            }
            await load();
            await onChanged?.();
          },
        },
      ],
    );
  };

  return (
    <>
      <SectionTitle>History</SectionTitle>
      <Card>
        {days.map(({ day, rows }) => (
          <View key={day} style={styles.day}>
            <Text style={[styles.dayLabel, { color: colors.textTertiary }]}>{formatDate(day)}</Text>

            {rows.map((event) => {
              const restorable =
                canRestore && event.action === 'moved' && !!previousRoomFor(events, event.guest_id);
              return (
                <View key={event.id} style={styles.row}>
                  <Text style={[styles.time, { color: colors.textTertiary }]}>
                    {formatEventTime(event.created_at)}
                  </Text>

                  <View style={[styles.spine, { backgroundColor: colors.border }]}>
                    <View style={[styles.dot, { backgroundColor: colors.tint }]} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.line, { color: colors.text }]}>
                      {event.action === 'moved' || event.action === 'assigned'
                        ? `${guestName(event.guest_id)} → Room ${roomNumber}`
                        : `${guestName(event.guest_id)} · ${ACTION_LABEL[event.action]}`}
                    </Text>

                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                      {event.actor_role ? ACTOR_LABEL[event.actor_role] ?? event.actor_role : 'System'}
                      {event.actor_name ? ` · ${event.actor_name}` : ''}
                    </Text>

                    {event.reason ? (
                      <Text style={[styles.reason, { color: colors.textSecondary }]}>{event.reason}</Text>
                    ) : null}

                    {restorable ? (
                      <TouchableOpacity onPress={() => restore(event)} disabled={busy}>
                        <Text style={[styles.restore, { color: colors.tint }]}>Restore previous assignment</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {events.length > 6 ? (
          <SecondaryButton
            title={expanded ? 'Show less' : `Show all ${events.length} entries`}
            onPress={() => setExpanded((v) => !v)}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  day: { marginBottom: spacing.lg },
  dayLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  time: { fontSize: 12, fontWeight: '600', width: 62, paddingTop: 1 },
  spine: { width: 2, alignSelf: 'stretch', marginTop: 4, alignItems: 'center', borderRadius: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: -3, marginTop: -1 },
  line: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12.5, marginTop: 2 },
  reason: { fontSize: 12.5, fontStyle: 'italic', marginTop: 2 },
  restore: { fontSize: 13, fontWeight: '700', marginTop: 6 },
});
