import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../lib/alert';
import { radius, spacing, useTheme } from '../../lib/theme';
import {
  HotelSnapshot,
  assignGuestToRoom,
  checkInGuest,
  checkOutGuest,
  formatDate,
  todayISO,
  tomorrowISO,
} from '../../lib/hotel';
import { TripSummary } from '../../lib/hotelTypes';
import { revokeKey } from '../../lib/keys';
import { Card, EmptyState, Stat } from '../../components/ui';
import { SearchIcon } from '../../components/icons';

type GuestFilter = 'all' | 'checked_in' | 'arriving' | 'unassigned';

export default function GuestsTab({
  trip,
  snapshot,
  refresh,
}: {
  trip: TripSummary;
  snapshot: HotelSnapshot;
  refresh: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GuestFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const reservationByGuest = new Map(
      snapshot.reservations
        .filter((r) => r.status !== 'cancelled')
        .map((r) => [r.guest_id, r]),
    );
    const roomById = new Map(snapshot.rooms.map((r) => [r.id, r]));

    return snapshot.guests.map((guest) => {
      const reservation = reservationByGuest.get(guest.id) ?? null;
      const room = reservation?.room_id != null ? roomById.get(reservation.room_id) ?? null : null;
      const keys = snapshot.keys.filter((k) => k.guest_id === guest.id && k.status === 'active');
      return { guest, reservation, room, keys };
    });
  }, [snapshot]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter(({ guest, room }) => {
        if (!q) return true;
        return (
          guest.legal_name.toLowerCase().includes(q) ||
          (guest.school ?? '').toLowerCase().includes(q) ||
          (guest.email ?? '').toLowerCase().includes(q) ||
          (guest.phone ?? '').includes(q) ||
          (room?.room_number ?? '').toLowerCase().includes(q)
        );
      })
      .filter(({ reservation }) => {
        switch (filter) {
          case 'checked_in':
            return reservation?.status === 'checked_in';
          case 'arriving':
            return reservation?.status === 'reserved';
          case 'unassigned':
            return !reservation || reservation.room_id == null;
          default:
            return true;
        }
      });
  }, [rows, query, filter]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      checkedIn: rows.filter((r) => r.reservation?.status === 'checked_in').length,
      unassigned: rows.filter((r) => !r.reservation || r.reservation.room_id == null).length,
    }),
    [rows],
  );

  const run = async (fn: () => Promise<string | null | void>, message?: string) => {
    setBusy(true);
    const error = await fn();
    setBusy(false);
    if (typeof error === 'string' && error) {
      Alert.alert('Error', error);
      return;
    }
    await refresh();
    if (message) Alert.alert('Done', message);
  };

  const roomsWithSpace = snapshot.rooms.filter((r) => r.reservations.length < (r.max_guests ?? r.capacity));

  const filters: { id: GuestFilter; label: string }[] = [
    { id: 'all', label: `All ${counts.total}` },
    { id: 'checked_in', label: `Checked in ${counts.checkedIn}` },
    { id: 'arriving', label: 'Not checked in' },
    { id: 'unassigned', label: `No room ${counts.unassigned}` },
  ];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: colors.text }]}>Guests</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{trip.name}</Text>

      <View style={styles.statRow}>
        <Stat value={counts.total} label="Guests" />
        <Stat value={counts.checkedIn} label="Checked in" accent={colors.success} />
        <Stat value={counts.unassigned} label="No room" accent={colors.warning} />
      </View>

      <TextInput
        style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        placeholder="Search name, school, phone, or room number"
        placeholderTextColor={colors.textTertiary}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      <View style={styles.filterRow}>
        {filters.map((f) => {
          const active = filter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              style={[
                styles.filterChip,
                { backgroundColor: active ? colors.tint : colors.surface, borderColor: active ? colors.tint : colors.border },
              ]}
              onPress={() => setFilter(f.id)}
            >
              <Text style={{ color: active ? colors.onTint : colors.text, fontWeight: '700', fontSize: 13 }}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <EmptyState icon={<SearchIcon size={26} color={colors.textTertiary} />} title="No guests found" subtitle={query ? `Nothing matched “${query}”.` : undefined} />
      ) : (
        filtered.map(({ guest, reservation, room, keys }) => {
          const expanded = expandedId === guest.id;
          const state = reservation?.status ?? 'none';
          return (
            <Card key={guest.id} style={{ marginBottom: spacing.sm }}>
              <TouchableOpacity onPress={() => setExpandedId(expanded ? null : guest.id)} activeOpacity={0.7}>
                <View style={styles.guestRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.guestName, { color: colors.text }]}>
                      {guest.legal_name}
                      {guest.is_chaperone ? ' · Chaperone' : ''}
                    </Text>
                    <Text style={[styles.guestMeta, { color: colors.textSecondary }]}>
                      {room ? `Room ${room.room_number} · ${room.room_type}` : 'No room assigned'}
                      {guest.school ? ` · ${guest.school}` : ''}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statePill,
                      {
                        backgroundColor:
                          state === 'checked_in' ? colors.successSoft : state === 'reserved' ? colors.warningSoft : colors.neutralSoft,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '800',
                        color: state === 'checked_in' ? colors.success : state === 'reserved' ? colors.warning : colors.neutral,
                      }}
                    >
                      {state === 'checked_in' ? 'IN' : state === 'reserved' ? 'DUE' : state === 'checked_out' ? 'OUT' : '—'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {expanded && (
                <View style={[styles.detail, { borderTopColor: colors.border }]}>
                  <Text style={[styles.detailLine, { color: colors.textSecondary }]}>
                    {guest.email ?? 'No email'} · {guest.phone ?? 'No phone'}
                  </Text>
                  {guest.arrival_window ? (
                    <Text style={[styles.detailLine, { color: colors.textSecondary }]}>Arrival window: {guest.arrival_window}</Text>
                  ) : null}
                  {reservation ? (
                    <>
                      <Text style={[styles.detailLine, { color: colors.textSecondary }]}>
                        Stay: {formatDate(reservation.check_in)} → {formatDate(reservation.check_out)}
                        {reservation.confirmation_code ? ` · ${reservation.confirmation_code}` : ''}
                      </Text>
                      {reservation.checked_in_at ? (
                        <Text style={[styles.detailLine, { color: colors.textSecondary }]}>
                          Checked in {formatDate(reservation.checked_in_at)}
                          {reservation.checked_out_at ? ` · checked out ${formatDate(reservation.checked_out_at)}` : ''}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                  <Text style={[styles.detailLine, { color: keys.length ? colors.tint : colors.textTertiary, fontWeight: '700' }]}>
                    {keys.length ? `Digital key active until ${formatDate(keys[0].valid_until)}` : 'No active digital key'}
                  </Text>

                  <View style={styles.actionRow}>
                    {room && state === 'reserved' && (
                      <TouchableOpacity
                        style={[styles.action, { backgroundColor: colors.tint }]}
                        disabled={busy}
                        onPress={() =>
                          run(async () => {
                            const result = await checkInGuest(trip.id, guest.id, room.id, {
                              check_in: reservation?.check_in ?? todayISO(),
                              check_out: reservation?.check_out ?? tomorrowISO(),
                            });
                            return result.error;
                          }, 'Checked in. Digital key issued.')
                        }
                      >
                        <Text style={[styles.actionText, { color: colors.onTint }]}>Check in</Text>
                      </TouchableOpacity>
                    )}
                    {state === 'checked_in' && (
                      <TouchableOpacity
                        style={[styles.action, { backgroundColor: colors.neutralSoft }]}
                        disabled={busy}
                        onPress={() => run(() => checkOutGuest(trip.id, guest.id), 'Checked out. Key expired.')}
                      >
                        <Text style={[styles.actionText, { color: colors.text }]}>Check out</Text>
                      </TouchableOpacity>
                    )}
                    {keys.length > 0 && (
                      <TouchableOpacity
                        style={[styles.action, { backgroundColor: colors.dangerSoft }]}
                        disabled={busy}
                        onPress={() => run(() => revokeKey(keys[0].id, 'Revoked by staff'), 'Key revoked.')}
                      >
                        <Text style={[styles.actionText, { color: colors.danger }]}>Revoke key</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {!room && (
                    <View style={{ marginTop: spacing.md }}>
                      <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>ASSIGN TO ROOM</Text>
                      {roomsWithSpace.length === 0 ? (
                        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Every room is full.</Text>
                      ) : (
                        <View style={styles.roomChipRow}>
                          {roomsWithSpace.map((target) => (
                            <TouchableOpacity
                              key={target.id}
                              style={[styles.roomChip, { borderColor: colors.border, backgroundColor: colors.neutralSoft }]}
                              disabled={busy}
                              onPress={() =>
                                run(
                                  () =>
                                    assignGuestToRoom(trip.id, guest.id, target.id, {
                                      check_in: reservation?.check_in ?? todayISO(),
                                      check_out: reservation?.check_out ?? tomorrowISO(),
                                    }),
                                  `Assigned to Room ${target.room_number}.`,
                                )
                              }
                            >
                              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                                {target.room_number} · {target.reservations.length}/{target.max_guests ?? target.capacity}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { fontSize: 13, fontWeight: '600', marginTop: 3, marginBottom: spacing.lg },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  search: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  filterChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  guestName: { fontSize: 16, fontWeight: '700' },
  guestMeta: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  statePill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  detail: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, paddingTop: spacing.md, gap: 4 },
  detailLine: { fontSize: 13, fontWeight: '500' },
  detailLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  action: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  actionText: { fontSize: 13, fontWeight: '700' },
  roomChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roomChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
});
