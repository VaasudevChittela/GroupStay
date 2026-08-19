import React, { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '../../lib/theme';
import {
  HotelSnapshot,
  checkInGuest,
  checkOutGuest,
  deriveRoomStatus,
  formatDate,
  moveGuest,
  nightsBetween,
  setRoomStatus,
  todayISO,
  tomorrowISO,
  unassignGuest,
} from '../../lib/hotel';
import {
  ROOM_STATUSES,
  ROOM_STATUS_META,
  RoomStatus,
  RoomWithOccupancy,
  TripSummary,
} from '../../lib/hotelTypes';
import { revokeKey } from '../../lib/keys';
import { Card, ChipSelect, EmptyState, PrimaryButton, SecondaryButton, SectionTitle, StatusBadge, statusColors } from '../../components/ui';
import RoomForm from './RoomForm';
import { BedIcon, CheckIcon, PlusIcon } from '../../components/icons';
import AssignmentHistory from '../../components/AssignmentHistory';
import { withReason } from '../../lib/history';

/** Offered when moving a guest, so history rows carry a why. */
const MOVE_REASONS = ['Roommate change', 'Guest request', 'Maintenance', 'Overbooking', 'Other'];

/**
 * Everything about one room: who is inside, their keys, and the actions staff
 * take most — check in, check out, move, assign, change housekeeping status.
 */
export default function RoomDetailScreen({
  trip,
  room,
  snapshot,
  onBack,
  onChanged,
}: {
  trip: TripSummary;
  room: RoomWithOccupancy;
  snapshot: HotelSnapshot;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [movingGuestId, setMovingGuestId] = useState<string | null>(null);

  const status = deriveRoomStatus(room);
  const capacity = room.max_guests ?? room.capacity;
  const spotsLeft = capacity - room.reservations.length;
  const stayDates = {
    check_in: room.reservations.find((r) => r.check_in)?.check_in ?? todayISO(),
    check_out: room.reservations.find((r) => r.check_out)?.check_out ?? tomorrowISO(),
  };

  // Guests with no room yet — the assign list.
  const unassignedGuests = useMemo(() => {
    const placed = new Set(
      snapshot.reservations.filter((r) => r.status === 'reserved' || r.status === 'checked_in').map((r) => r.guest_id),
    );
    return snapshot.guests.filter((g) => !placed.has(g.id));
  }, [snapshot]);

  const otherRooms = useMemo(
    () => snapshot.rooms.filter((r) => r.id !== room.id && r.reservations.length < (r.max_guests ?? r.capacity)),
    [snapshot.rooms, room.id],
  );

  const keysFor = (guestId: string) => snapshot.keys.filter((k) => k.guest_id === guestId && k.status === 'active');

  const run = async (fn: () => Promise<string | null | void>, successMessage?: string) => {
    setBusy(true);
    const error = await fn();
    setBusy(false);
    if (typeof error === 'string' && error) {
      Alert.alert('Error', error);
      return;
    }
    await onChanged();
    if (successMessage) Alert.alert('Done', successMessage);
  };

  if (editing) {
    return (
      <RoomForm
        trip={trip}
        room={room}
        existingRooms={snapshot.rooms}
        onClose={() => setEditing(false)}
        onSaved={onChanged}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: colors.tint, fontSize: 16, fontWeight: '700' }}>‹ Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditing(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: colors.tint, fontSize: 16, fontWeight: '700' }}>Edit</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.roomNumber, { color: colors.text }]}>Room {room.room_number}</Text>
        <Text style={[styles.roomMeta, { color: colors.textSecondary }]}>
          {room.room_type} · Sleeps {capacity}
          {room.floor ? ` · Floor ${room.floor}` : ''}
          {room.school ? ` · ${room.school}` : ''}
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <StatusBadge status={status} />
        </View>

        {room.photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.lg }}>
            {room.photos.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.photo} />
            ))}
          </ScrollView>
        )}

        {room.notes ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[styles.notesLabel, { color: colors.textTertiary }]}>NOTES</Text>
            <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>{room.notes}</Text>
          </Card>
        ) : null}

        {/* Occupants */}
        <SectionTitle>
          {room.reservations.length > 0 ? `Guests (${room.reservations.length}/${capacity})` : 'Guests'}
        </SectionTitle>

        {room.reservations.length === 0 ? (
          <EmptyState icon={<BedIcon size={26} color={colors.textTertiary} />} title="Nobody in this room" subtitle="Assign a guest below to fill it." />
        ) : (
          room.reservations.map((reservation) => {
            const guest = reservation.guest;
            const keys = keysFor(reservation.guest_id);
            const nights = nightsBetween(reservation.check_in, reservation.check_out);
            return (
              <Card key={reservation.guest_id} style={{ marginBottom: spacing.md }}>
                <View style={styles.guestHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.guestName, { color: colors.text }]}>
                      {guest?.legal_name ?? 'Unnamed guest'}
                      {guest?.is_chaperone ? ' · Chaperone' : ''}
                    </Text>
                    <Text style={[styles.guestMeta, { color: colors.textSecondary }]}>
                      {guest?.school ?? '—'}
                      {guest?.phone ? ` · ${guest.phone}` : ''}
                    </Text>
                    <Text style={[styles.guestMeta, { color: colors.textSecondary }]}>
                      {formatDate(reservation.check_in)} → {formatDate(reservation.check_out)}
                      {nights ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}
                      {reservation.confirmation_code ? ` · ${reservation.confirmation_code}` : ''}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statePill,
                      { backgroundColor: reservation.status === 'checked_in' ? colors.successSoft : colors.warningSoft },
                    ]}
                  >
                    <Text
                      style={{
                        color: reservation.status === 'checked_in' ? colors.success : colors.warning,
                        fontSize: 11,
                        fontWeight: '800',
                      }}
                    >
                      {reservation.status === 'checked_in' ? 'CHECKED IN' : 'RESERVED'}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.keyLine, { color: keys.length ? colors.tint : colors.textTertiary }]}>
                  {keys.length
                    ? `Digital key active · expires ${formatDate(keys[0].valid_until)}`
                    : 'No active digital key'}
                </Text>

                <View style={styles.actionRow}>
                  {reservation.status === 'reserved' ? (
                    <TouchableOpacity
                      style={[styles.action, { backgroundColor: colors.tint }]}
                      disabled={busy}
                      onPress={() =>
                        run(async () => {
                          const result = await checkInGuest(trip.id, reservation.guest_id, room.id, {
                            check_in: reservation.check_in ?? todayISO(),
                            check_out: reservation.check_out ?? tomorrowISO(),
                          });
                          return result.error;
                        }, 'Guest checked in and their digital key is active.')
                      }
                    >
                      <Text style={[styles.actionText, { color: colors.onTint }]}>Check in</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.action, { backgroundColor: colors.neutralSoft }]}
                      disabled={busy}
                      onPress={() =>
                        Alert.alert('Check out guest?', `${guest?.legal_name ?? 'This guest'} will lose room access immediately.`, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Check out',
                            style: 'destructive',
                            onPress: () => run(() => checkOutGuest(trip.id, reservation.guest_id), 'Checked out. Key expired.'),
                          },
                        ])
                      }
                    >
                      <Text style={[styles.actionText, { color: colors.text }]}>Check out</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.action, { backgroundColor: colors.neutralSoft }]}
                    disabled={busy}
                    onPress={() => setMovingGuestId(movingGuestId === reservation.guest_id ? null : reservation.guest_id)}
                  >
                    <Text style={[styles.actionText, { color: colors.text }]}>Move</Text>
                  </TouchableOpacity>

                  {keys.length > 0 && (
                    <TouchableOpacity
                      style={[styles.action, { backgroundColor: colors.dangerSoft }]}
                      disabled={busy}
                      onPress={() =>
                        Alert.alert('Revoke key?', 'The guest loses room access immediately.', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Revoke',
                            style: 'destructive',
                            onPress: () => run(() => revokeKey(keys[0].id, 'Revoked by staff'), 'Key revoked.'),
                          },
                        ])
                      }
                    >
                      <Text style={[styles.actionText, { color: colors.danger }]}>Revoke key</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.action, { backgroundColor: colors.neutralSoft }]}
                    disabled={busy}
                    onPress={() =>
                      Alert.alert('Remove from room?', 'The guest goes back to the unassigned list.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => run(() => unassignGuest(reservation.guest_id)) },
                      ])
                    }
                  >
                    <Text style={[styles.actionText, { color: colors.textSecondary }]}>Remove</Text>
                  </TouchableOpacity>
                </View>

                {/* Move destination picker — splits a reservation across rooms */}
                {movingGuestId === reservation.guest_id && (
                  <View style={[styles.movePanel, { borderTopColor: colors.border }]}>
                    <Text style={[styles.notesLabel, { color: colors.textTertiary }]}>MOVE TO</Text>
                    {otherRooms.length === 0 ? (
                      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>No other rooms have space.</Text>
                    ) : (
                      otherRooms.map((target) => (
                        <TouchableOpacity
                          key={target.id}
                          style={[styles.moveOption, { borderColor: colors.border }]}
                          disabled={busy}
                          onPress={() =>
                            Alert.alert(
                              `Move to Room ${target.room_number}?`,
                              'Pick a reason so the room history explains this later.',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                ...MOVE_REASONS.map((reason) => ({
                                  text: reason,
                                  onPress: () =>
                                    run(async () => {
                                      await withReason(reason);
                                      const error = await moveGuest(trip.id, reservation.guest_id, target.id);
                                      setMovingGuestId(null);
                                      return error;
                                    }, `Moved to Room ${target.room_number}. Their key now opens the new room.`),
                                })),
                              ],
                            )
                          }
                        >
                          <Text style={{ color: colors.text, fontWeight: '700' }}>Room {target.room_number}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                            {target.room_type} · {target.reservations.length}/{target.max_guests ?? target.capacity}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
              </Card>
            );
          })
        )}

        {/* Assign more guests */}
        {spotsLeft > 0 && (
          <>
            <SectionTitle>Add guests ({spotsLeft} spot{spotsLeft === 1 ? '' : 's'} left)</SectionTitle>
            {!assigning ? (
              <SecondaryButton title="Assign a guest to this room" onPress={() => setAssigning(true)} />
            ) : unassignedGuests.length === 0 ? (
              <EmptyState icon={<CheckIcon size={26} color={colors.textTertiary} />} title="Everyone has a room" subtitle="No unassigned guests on this trip." />
            ) : (
              <>
                {unassignedGuests.map((guest) => (
                  <TouchableOpacity
                    key={guest.id}
                    style={[styles.assignRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    disabled={busy}
                    onPress={() =>
                      run(async () => {
                        const result = await checkInGuest(trip.id, guest.id, room.id, stayDates);
                        setAssigning(false);
                        return result.error;
                      }, 'Guest assigned, checked in, and issued a digital key.')
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                        {guest.legal_name}
                        {guest.is_chaperone ? ' · Chaperone' : ''}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                        {guest.school ?? '—'}
                        {guest.arrival_window ? ` · arrives ${guest.arrival_window}` : ''}
                      </Text>
                    </View>
                    <PlusIcon size={18} color={colors.tint} />
                  </TouchableOpacity>
                ))}
                <SecondaryButton title="Cancel" onPress={() => setAssigning(false)} style={{ marginTop: spacing.sm }} />
              </>
            )}
          </>
        )}

        {/* Housekeeping */}
        <AssignmentHistory
          roomId={room.id}
          roomNumber={room.room_number}
          guestName={(id) => snapshot.guests.find((g) => g.id === id)?.legal_name ?? 'Guest'}
          canRestore
          onChanged={onChanged}
        />

        <SectionTitle>Room status</SectionTitle>
        <ChipSelect
          options={ROOM_STATUSES}
          value={room.status}
          onChange={(next: RoomStatus) => run(async () => (await setRoomStatus(room.id, next)).error)}
          labels={Object.fromEntries(
            ROOM_STATUSES.map((s) => [s, ROOM_STATUS_META[s].label]),
          ) as Record<RoomStatus, string>}
          dots={Object.fromEntries(
            ROOM_STATUSES.map((s) => [s, statusColors(colors, s).fg]),
          ) as Record<RoomStatus, string>}
        />
        {room.status === 'cleaning' && (
          <PrimaryButton
            title="Mark clean & available"
            onPress={() => run(async () => (await setRoomStatus(room.id, 'available')).error)}
            disabled={busy}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  roomNumber: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  roomMeta: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  photo: { width: 132, height: 99, borderRadius: radius.md, marginRight: spacing.sm },
  notesLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  guestHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  guestName: { fontSize: 16, fontWeight: '700' },
  guestMeta: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  statePill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  keyLine: { fontSize: 13, fontWeight: '700', marginTop: spacing.md },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  action: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  actionText: { fontSize: 13, fontWeight: '700' },
  movePanel: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, paddingTop: spacing.md, gap: spacing.sm },
  moveOption: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
});
