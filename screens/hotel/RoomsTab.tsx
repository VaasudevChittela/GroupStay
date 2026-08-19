import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { radius, spacing, useTheme } from '../../lib/theme';
import { HotelSnapshot, deriveRoomStatus } from '../../lib/hotel';
import { HotelRoom, RoomWithOccupancy, TripSummary } from '../../lib/hotelTypes';
import RoomCard from '../../components/RoomCard';
import { EmptyState, Stat } from '../../components/ui';
import RoomForm from './RoomForm';
import { BuildingIcon, PlusIcon, SearchIcon } from '../../components/icons';

export default function RoomsTab({
  trip,
  snapshot,
  onOpenRoom,
  refresh,
}: {
  trip: TripSummary;
  snapshot: HotelSnapshot;
  onOpenRoom: (room: RoomWithOccupancy) => void;
  refresh: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [formRoom, setFormRoom] = useState<HotelRoom | null | undefined>(undefined); // undefined = closed

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snapshot.rooms;
    return snapshot.rooms.filter(
      (room) =>
        room.room_number.toLowerCase().includes(q) ||
        room.room_type.toLowerCase().includes(q) ||
        (room.school ?? '').toLowerCase().includes(q) ||
        room.reservations.some((r) => (r.guest?.legal_name ?? '').toLowerCase().includes(q)),
    );
  }, [snapshot.rooms, query]);

  const totals = useMemo(() => {
    const beds = snapshot.rooms.reduce((sum, r) => sum + (r.max_guests ?? r.capacity), 0);
    const filled = snapshot.rooms.reduce((sum, r) => sum + r.reservations.length, 0);
    const needsCleaning = snapshot.rooms.filter((r) => deriveRoomStatus(r) === 'cleaning').length;
    return { beds, filled, needsCleaning };
  }, [snapshot.rooms]);

  if (formRoom !== undefined) {
    return (
      <RoomForm
        trip={trip}
        room={formRoom}
        existingRooms={snapshot.rooms}
        onClose={() => setFormRoom(undefined)}
        onSaved={refresh}
      />
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Room Inventory</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {snapshot.rooms.length} rooms · {totals.filled}/{totals.beds} beds filled
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.tint }]}
          onPress={() => setFormRoom(null)}
          activeOpacity={0.8}
        >
          <PlusIcon size={15} color={colors.onTint} />
          <Text style={[styles.addButtonText, { color: colors.onTint }]}>Add Room</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statRow}>
        <Stat value={snapshot.rooms.length} label="Rooms" />
        <Stat value={totals.beds} label="Beds" />
        <Stat value={totals.needsCleaning} label="Need cleaning" accent={colors.orange} />
      </View>

      <TextInput
        style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        placeholder="Search room number, type, or guest"
        placeholderTextColor={colors.textTertiary}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      {snapshot.rooms.length === 0 ? (
        <EmptyState
          icon={<BuildingIcon size={26} color={colors.textTertiary} />}
          title="Add your first room"
          subtitle="Enter the room number, pick the bed setup — Single, Double, Quadruple and more — and set how many guests it sleeps."
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<SearchIcon size={26} color={colors.textTertiary} />} title="No matches" subtitle={`Nothing matched “${query}”.`} />
      ) : (
        filtered.map((room) => <RoomCard key={room.id} room={room} onPress={onOpenRoom} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  addButtonText: { fontSize: 14, fontWeight: '800' },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  search: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: spacing.lg,
  },
});
