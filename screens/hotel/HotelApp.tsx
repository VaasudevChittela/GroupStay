import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, useTheme } from '../../lib/theme';
import { HotelSnapshot, loadHotelSnapshot, subscribeToHotel } from '../../lib/hotel';
import { RoomWithOccupancy, TripSummary } from '../../lib/hotelTypes';
import DashboardTab from './DashboardTab';
import RoomsTab from './RoomsTab';
import GuestsTab from './GuestsTab';
import RoomDetailScreen from './RoomDetailScreen';
import { BedIcon, DashboardIcon, GuestsIcon } from '../../components/icons';
import { Org } from '../../lib/session';

type Tab = 'dashboard' | 'rooms' | 'guests';

const TABS: { id: Tab; Icon: (props: { size?: number; color: string }) => React.ReactElement; label: string }[] = [
  { id: 'dashboard', Icon: DashboardIcon, label: 'Dashboard' },
  { id: 'rooms', Icon: BedIcon, label: 'Rooms' },
  { id: 'guests', Icon: GuestsIcon, label: 'Guests' },
];

/**
 * The hotel staff experience: live dashboard, room inventory, and guest
 * management under a bottom tab bar. Data loads once, then stays fresh via
 * Supabase realtime — no pull-to-refresh needed (though it's there too).
 */
export default function HotelApp({
  trip,
  hotel,
  onExit,
  onHotelUpdated,
}: {
  trip: TripSummary;
  hotel?: Org | null;
  onExit?: () => void;
  onHotelUpdated?: () => Promise<void> | void;
}) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [snapshot, setSnapshot] = useState<HotelSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const result = await loadHotelSnapshot(trip.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setSnapshot(result.data);
  }, [trip.id]);

  useEffect(() => {
    refresh();
    // Realtime: debounce bursts of changes (check-in touches 3 tables) into one reload.
    const unsubscribe = subscribeToHotel(trip.id, () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(refresh, 250);
    });
    return () => {
      unsubscribe();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [trip.id, refresh]);

  const selectedRoom: RoomWithOccupancy | null =
    (selectedRoomId != null && snapshot?.rooms.find((r) => r.id === selectedRoomId)) || null;

  if (!snapshot) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
          {error ? <Text style={{ color: colors.danger, marginTop: 12, textAlign: 'center', paddingHorizontal: 24 }}>{error}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  if (selectedRoom) {
    return (
      <RoomDetailScreen
        trip={trip}
        room={selectedRoom}
        snapshot={snapshot}
        onBack={() => setSelectedRoomId(null)}
        onChanged={refresh}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.fill}>
        {tab === 'dashboard' && (
          <DashboardTab
            trip={trip}
            hotel={hotel}
            snapshot={snapshot}
            onOpenRoom={(room) => setSelectedRoomId(room.id)}
            onExit={onExit}
            refresh={refresh}
            onHotelUpdated={onHotelUpdated}
          />
        )}
        {tab === 'rooms' && (
          <RoomsTab trip={trip} snapshot={snapshot} onOpenRoom={(room) => setSelectedRoomId(room.id)} refresh={refresh} />
        )}
        {tab === 'guests' && <GuestsTab trip={trip} snapshot={snapshot} refresh={refresh} />}

        {/* Bottom navigation */}
        <View style={[styles.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          {TABS.map(({ id, Icon, label }) => {
            const active = tab === id;
            return (
              <TouchableOpacity key={id} style={styles.tabItem} onPress={() => setTab(id)} activeOpacity={0.7}>
                <Icon size={22} color={active ? colors.tint : colors.textTertiary} />
                <Text style={[styles.tabLabel, { color: active ? colors.tint : colors.textTertiary }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabLabel: { fontSize: 11, fontWeight: '700' },
});
