import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '../../lib/theme';
import {
  HotelSnapshot,
  assignGuestToRoom,
  autoAssignRooms,
  formatDate,
  loadScopedTrips,
  loadSnapshotForTrips,
  subscribeToScope,
  unassignGuest,
} from '../../lib/hotel';
import { Org, Profile } from '../../lib/session';
import { RoomWithOccupancy, TripSummary } from '../../lib/hotelTypes';
import { Card, EmptyState, PrimaryButton, SecondaryButton, SectionTitle, Stat } from '../../components/ui';
import { SearchIcon } from '../../components/icons';
import MessagesScreen from '../shared/MessagesScreen';

type Filter = 'all' | 'assigned' | 'unassigned';

/**
 * The chapter assignor's workspace. Everything it can read is already limited
 * to this chapter by row level security; the scope filter here is belt and
 * braces, not the boundary itself.
 */
export default function ChapterApp({
  profile,
  chapter,
  onSignOut,
}: {
  profile: Profile;
  chapter: Org;
  onSignOut: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [snapshot, setSnapshot] = useState<HotelSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [tripFilter, setTripFilter] = useState<string | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const tripsResult = await loadScopedTrips({ chapterId: chapter.id });
    if (!tripsResult.data) {
      setError(tripsResult.error);
      return;
    }
    const visibleTrips = tripsResult.data;
    setTrips(visibleTrips);

    const result = await loadSnapshotForTrips(visibleTrips.map((t) => t.id));
    if (!result.data) {
      setError(result.error);
      return;
    }
    setError(null);
    setSnapshot(result.data);
  }, [chapter.id]);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToScope(`chapter-${chapter.id}`, () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, 250);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [chapter.id, refresh]);

  const tripById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);

  const students = useMemo(() => {
    if (!snapshot) return [];
    const roomById = new Map(snapshot.rooms.map((r) => [r.id, r]));

    return snapshot.guests
      .map((guest) => {
        const reservation = snapshot.reservations.find(
          (r) => r.guest_id === guest.id && r.status !== 'cancelled',
        );
        const room = reservation?.room_id ? roomById.get(reservation.room_id) ?? null : null;
        const roommates = room
          ? room.reservations.filter((r) => r.guest_id !== guest.id).map((r) => r.guest?.legal_name ?? 'Unnamed guest')
          : [];
        return { guest, reservation, room, roommates, trip: tripById.get(reservation?.trip_id ?? '') ?? null };
      })
      .filter(({ guest, room, reservation }) => {
        if (tripFilter !== 'all' && reservation?.trip_id !== tripFilter) return false;
        if (filter === 'assigned' && !room) return false;
        if (filter === 'unassigned' && room) return false;
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          guest.legal_name.toLowerCase().includes(q) ||
          (guest.school ?? '').toLowerCase().includes(q) ||
          (room?.room_number ?? '').toLowerCase().includes(q)
        );
      });
  }, [snapshot, query, filter, tripFilter, tripById]);

  const totals = useMemo(() => {
    if (!snapshot) return { total: 0, assigned: 0, unassigned: 0, rooms: 0 };
    const assigned = snapshot.reservations.filter((r) => r.room_id && r.status !== 'cancelled').length;
    return {
      total: snapshot.guests.length,
      assigned,
      unassigned: snapshot.guests.length - assigned,
      rooms: snapshot.rooms.length,
    };
  }, [snapshot]);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    const error = await action();
    setBusy(false);
    if (error) Alert.alert('Error', error);
    else await refresh();
  };

  if (!snapshot) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
          {error ? (
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          ) : null}
          <SecondaryButton title="Sign out" onPress={onSignOut} style={{ marginTop: spacing.xl, minWidth: 200 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (showMessages && trips.length > 0) {
    return (
      <MessagesScreen
        role="chapter_assignor"
        tripId={trips[0].id}
        senderName={profile.full_name ?? 'Advisor'}
        onBack={() => setShowMessages(false)}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
            tintColor={colors.tint}
          />
        }
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.orgName, { color: colors.text }]}>{chapter.name}</Text>
            <Text style={[styles.orgMeta, { color: colors.textSecondary }]}>
              Chapter assignor · {profile.full_name ?? profile.email}
            </Text>
          </View>
          <TouchableOpacity onPress={onSignOut} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 15 }}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statRow}>
          <Stat value={totals.total} label="Students" />
          <Stat value={totals.assigned} label="Assigned" accent={colors.success} />
          <Stat value={totals.unassigned} label="Unassigned" accent={colors.warning} />
          <Stat value={totals.rooms} label="Rooms" accent={colors.info} />
        </View>

        <View style={styles.actionRow}>
          <PrimaryButton
            title="Auto-assign rooms"
            disabled={busy || totals.unassigned === 0 || totals.rooms === 0}
            style={{ flex: 1 }}
            onPress={() =>
              Alert.alert(
                'Auto-assign rooms',
                `Place the ${totals.unassigned} unassigned student${totals.unassigned === 1 ? '' : 's'} into open rooms? ` +
                  'Chaperones are spread out and mutual roommate requests are honoured. Existing assignments are left alone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Assign',
                    onPress: async () => {
                      setBusy(true);
                      const result = await autoAssignRooms(trips.map((t) => t.id), snapshot);
                      setBusy(false);
                      if (!result.data) {
                        Alert.alert('Could not auto-assign', result.error);
                        return;
                      }
                      await refresh();
                      Alert.alert(
                        'Auto-assign complete',
                        `${result.data.assigned} placed.` +
                          (result.data.unassigned > 0
                            ? ` ${result.data.unassigned} could not fit — add more rooms or assign them by hand.`
                            : ''),
                      );
                    },
                  },
                ],
              )
            }
          />
          <SecondaryButton title="Messages" onPress={() => setShowMessages(true)} style={{ flex: 1 }} />
        </View>

        {trips.length > 1 && (
          <>
            <SectionTitle>Trip</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(['all', ...trips.map((t) => t.id)] as const).map((id) => {
                const active = tripFilter === id;
                const label = id === 'all' ? 'All trips' : tripById.get(id)?.name ?? 'Trip';
                return (
                  <TouchableOpacity
                    key={id}
                    style={[
                      styles.chip,
                      { backgroundColor: active ? colors.tint : colors.surface, borderColor: active ? colors.tint : colors.border },
                    ]}
                    onPress={() => setTripFilter(id as string)}
                  >
                    <Text style={{ color: active ? colors.onTint : colors.text, fontWeight: '700', fontSize: 13 }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        <SectionTitle>Students</SectionTitle>
        <TextInput
          style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholder="Search by name, school or room"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
        />

        <View style={styles.chipRow}>
          {(['all', 'assigned', 'unassigned'] as Filter[]).map((f) => {
            const active = filter === f;
            return (
              <TouchableOpacity
                key={f}
                style={[
                  styles.chip,
                  { backgroundColor: active ? colors.tint : colors.surface, borderColor: active ? colors.tint : colors.border },
                ]}
                onPress={() => setFilter(f)}
              >
                <Text style={{ color: active ? colors.onTint : colors.text, fontWeight: '700', fontSize: 13 }}>
                  {f === 'all' ? 'All' : f === 'assigned' ? 'Assigned' : 'Unassigned'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {students.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={26} color={colors.textTertiary} />}
            title="No students found"
            subtitle={query ? `Nothing matched “${query}”.` : 'Students appear here once they join with your trip code.'}
          />
        ) : (
          students.map(({ guest, reservation, room, roommates, trip }) => {
            const expanded = expandedId === guest.id;
            return (
              <Card key={guest.id} style={{ marginBottom: spacing.sm }}>
                <TouchableOpacity onPress={() => setExpandedId(expanded ? null : guest.id)} activeOpacity={0.7}>
                  <View style={styles.studentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.studentName, { color: colors.text }]}>
                        {guest.legal_name}
                        {guest.is_chaperone ? ' · Chaperone' : ''}
                      </Text>
                      <Text style={[styles.studentMeta, { color: colors.textSecondary }]}>
                        {trip?.hotel_name ?? 'Hotel pending'}
                        {room ? ` · Room ${room.room_number}` : ' · No room yet'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statePill,
                        { backgroundColor: room ? colors.successSoft : colors.warningSoft },
                      ]}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: room ? colors.success : colors.warning }}>
                        {room ? 'ASSIGNED' : 'PENDING'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {expanded && (
                  <View style={[styles.detail, { borderTopColor: colors.border }]}>
                    {reservation?.check_in ? (
                      <Text style={[styles.detailLine, { color: colors.textSecondary }]}>
                        Stay: {formatDate(reservation.check_in)} → {formatDate(reservation.check_out)}
                      </Text>
                    ) : null}
                    {guest.school ? (
                      <Text style={[styles.detailLine, { color: colors.textSecondary }]}>School: {guest.school}</Text>
                    ) : null}
                    {roommates.length > 0 ? (
                      <Text style={[styles.detailLine, { color: colors.textSecondary }]}>
                        Sharing with: {roommates.join(', ')}
                      </Text>
                    ) : room ? (
                      <Text style={[styles.detailLine, { color: colors.textSecondary }]}>Alone in this room so far</Text>
                    ) : null}

                    <RoomPicker
                      rooms={snapshot.rooms}
                      currentRoomId={room?.id ?? null}
                      disabled={busy}
                      onPick={(roomId) =>
                        run(async () =>
                          assignGuestToRoom(reservation?.trip_id ?? trips[0]?.id ?? '', guest.id, roomId),
                        )
                      }
                    />

                    {room ? (
                      <SecondaryButton
                        title="Remove from room"
                        onPress={() => run(() => unassignGuest(guest.id))}
                        style={{ marginTop: spacing.sm }}
                      />
                    ) : null}
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Rooms in the chapter's block, with live space remaining. */
function RoomPicker({
  rooms,
  currentRoomId,
  disabled,
  onPick,
}: {
  rooms: RoomWithOccupancy[];
  currentRoomId: string | null;
  disabled: boolean;
  onPick: (roomId: string) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  if (rooms.length === 0) {
    return (
      <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: spacing.md }}>
        The hotel has not added rooms for this trip yet.
      </Text>
    );
  }

  if (!open) {
    return (
      <PrimaryButton
        title={currentRoomId ? 'Move to another room' : 'Assign a room'}
        onPress={() => setOpen(true)}
        style={{ marginTop: spacing.md }}
      />
    );
  }

  return (
    <View style={{ marginTop: spacing.md, gap: 6 }}>
      {rooms.map((room) => {
        const capacity = room.max_guests ?? room.capacity;
        const taken = room.reservations.length;
        const full = taken >= capacity && room.id !== currentRoomId;
        const current = room.id === currentRoomId;
        return (
          <TouchableOpacity
            key={room.id}
            style={[
              styles.roomOption,
              {
                borderColor: current ? colors.tint : colors.border,
                backgroundColor: current ? colors.tintSoft : colors.surface,
                opacity: full ? 0.4 : 1,
              },
            ]}
            disabled={disabled || full || current}
            onPress={() => {
              setOpen(false);
              onPick(room.id);
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
              Room {room.room_number} · {room.room_type}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {taken}/{capacity} {current ? '· current' : full ? '· full' : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
      <SecondaryButton title="Cancel" onPress={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { marginTop: spacing.lg, textAlign: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  orgName: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  orgMeta: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  search: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  studentRow: { flexDirection: 'row', alignItems: 'center' },
  studentName: { fontSize: 16, fontWeight: '700' },
  studentMeta: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  statePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  detail: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, paddingTop: spacing.md },
  detailLine: { fontSize: 13, marginBottom: 4 },
  roomOption: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
});
