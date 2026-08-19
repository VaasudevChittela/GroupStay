import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { radius, spacing, useTheme } from '../lib/theme';
import { RoomWithOccupancy } from '../lib/hotelTypes';
import { deriveRoomStatus, formatDate, nightsBetween } from '../lib/hotel';
import { StatusBadge, statusColors } from './ui';
import { KeyIcon } from './icons';

/**
 * The dashboard room card: everything staff needs at a glance —
 * number, type, who's inside, checkout date, key + cleaning state.
 */
export default function RoomCard({
  room,
  onPress,
}: {
  room: RoomWithOccupancy;
  onPress: (room: RoomWithOccupancy) => void;
}) {
  const { colors } = useTheme();
  const status = deriveRoomStatus(room);
  const { fg } = statusColors(colors, status);

  const occupants = room.reservations;
  const guestCount = occupants.length;
  const capacity = room.max_guests ?? room.capacity;
  const checkOut = occupants.find((r) => r.check_out)?.check_out ?? null;
  const checkIn = occupants.find((r) => r.check_in)?.check_in ?? null;
  const nights = nightsBetween(checkIn, checkOut);
  const photo = room.photos[0];

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: fg },
      ]}
      onPress={() => onPress(room)}
      activeOpacity={0.75}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.roomNumber, { color: colors.text }]}>Room {room.room_number}</Text>
          <Text style={[styles.roomType, { color: colors.textSecondary }]}>
            {room.room_type}
            {room.floor ? ` · Floor ${room.floor}` : ''} · {guestCount}/{capacity} guests
          </Text>
        </View>
        {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : null}
      </View>

      <View style={styles.badgeRow}>
        <StatusBadge status={status} />
        {room.activeKeyCount > 0 && (
          <View style={[styles.keyPill, { backgroundColor: colors.tintSoft }]}>
            <KeyIcon size={13} color={colors.tint} />
            <Text style={[styles.keyPillText, { color: colors.tint }]}>
              {room.activeKeyCount} active {room.activeKeyCount === 1 ? 'key' : 'keys'}
            </Text>
          </View>
        )}
      </View>

      {occupants.length > 0 ? (
        <View style={styles.guestBlock}>
          {occupants.slice(0, 4).map((r) => (
            <Text key={r.guest_id} style={[styles.guestLine, { color: colors.text }]} numberOfLines={1}>
              {r.guest?.legal_name ?? 'Unnamed guest'}
              {r.status === 'reserved' ? (
                <Text style={{ color: colors.textTertiary }}>  · not checked in</Text>
              ) : null}
            </Text>
          ))}
          {occupants.length > 4 && (
            <Text style={[styles.guestLine, { color: colors.textSecondary }]}>+{occupants.length - 4} more</Text>
          )}
          {checkOut ? (
            <Text style={[styles.checkoutLine, { color: colors.textSecondary }]}>
              Check-out: {formatDate(checkOut)}
              {nights != null && nights > 0 ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.emptyLine, { color: colors.textTertiary }]}>
          {status === 'cleaning'
            ? 'Being cleaned — ready soon'
            : status === 'maintenance'
              ? room.housekeeping_note || 'Under maintenance'
              : status === 'out_of_service'
                ? 'Out of service'
                : 'No guests assigned'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 4,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  roomNumber: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  roomType: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  photo: { width: 52, height: 52, borderRadius: radius.sm, marginLeft: spacing.sm },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  keyPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  keyPillText: { fontSize: 12, fontWeight: '700' },
  guestBlock: { gap: 3 },
  guestLine: { fontSize: 15, fontWeight: '600' },
  checkoutLine: { fontSize: 13, fontWeight: '600', marginTop: 6 },
  emptyLine: { fontSize: 14, fontWeight: '500' },
});
