import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../lib/alert';
import { spacing, useTheme } from '../../lib/theme';
import { HotelSnapshot, deriveRoomStatus, formatDate, resolveGuestRequest, todayISO } from '../../lib/hotel';
import { ROOM_STATUS_META, RoomStatus, RoomWithOccupancy, TripSummary } from '../../lib/hotelTypes';
import RoomCard from '../../components/RoomCard';
import { Card, EmptyState, Field, Pill, PrimaryButton, SecondaryButton, SectionTitle, Stat, statusColors } from '../../components/ui';
import { BedIcon } from '../../components/icons';
import PropertyCard from '../../components/PropertyCard';
import NotificationBell from '../../components/NotificationBell';
import { announce, registerForPush } from '../../lib/notifications';
import { Org, shortLocation } from '../../lib/session';

type Filter = 'all' | RoomStatus;

const REQUEST_LABEL: Record<string, string> = {
  housekeeping: 'Housekeeping',
  issue: 'Room issue',
  late_checkout: 'Late checkout',
  amenity: 'Amenity',
};

export default function DashboardTab({
  trip,
  hotel,
  snapshot,
  onOpenRoom,
  onExit,
  refresh,
  onHotelUpdated,
}: {
  trip: TripSummary;
  /** The property this staff account belongs to, when known. */
  hotel?: Org | null;
  snapshot: HotelSnapshot;
  onOpenRoom: (room: RoomWithOccupancy) => void;
  onExit?: () => void;
  refresh: () => Promise<void>;
  onHotelUpdated?: () => Promise<void> | void;
}) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Without a registered device, staff-facing events would queue and never
  // reach anyone.
  useEffect(() => {
    registerForPush();
  }, []);

  const today = todayISO();

  const derived = useMemo(() => {
    const withStatus = snapshot.rooms.map((room) => ({ room, status: deriveRoomStatus(room) }));
    const counts: Record<RoomStatus, number> = {
      available: 0, occupied: 0, reserved: 0, cleaning: 0, maintenance: 0, out_of_service: 0,
    };
    withStatus.forEach(({ status }) => { counts[status] += 1; });

    const activeReservations = snapshot.reservations.filter((r) => r.status === 'reserved' || r.status === 'checked_in');
    const arrivalsToday = activeReservations.filter((r) => r.status === 'reserved' && r.check_in === today);
    const departuresToday = activeReservations.filter((r) => r.status === 'checked_in' && r.check_out === today);
    const notCheckedIn = activeReservations.filter((r) => r.status === 'reserved');
    const activeKeys = snapshot.keys.filter((k) => k.status === 'active');

    return { withStatus, counts, arrivalsToday, departuresToday, notCheckedIn, activeKeys };
  }, [snapshot, today]);

  const guestName = (guestId: string) =>
    snapshot.guests.find((g) => g.id === guestId)?.legal_name ?? `Guest #${guestId}`;
  const roomNumber = (roomId: string | null) =>
    snapshot.rooms.find((r) => r.id === roomId)?.room_number ?? '—';

  const filteredRooms = derived.withStatus
    .filter(({ status }) => filter === 'all' || status === filter)
    .map(({ room }) => room);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: `All ${snapshot.rooms.length}` },
    ...(['available', 'occupied', 'reserved', 'cleaning', 'maintenance'] as RoomStatus[]).map((s) => ({
      id: s as Filter,
      label: `${ROOM_STATUS_META[s].label} ${derived.counts[s]}`,
    })),
  ];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.hotelName, { color: colors.text }]}>{hotel?.name ?? trip.hotel_name}</Text>
          <Text style={[styles.tripName, { color: colors.textSecondary }]}>
            {shortLocation(hotel ?? null) ? `${shortLocation(hotel ?? null)} · ` : ''}
            {trip.name} · Code {trip.trip_code}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <NotificationBell />
          {onExit ? (
            <TouchableOpacity onPress={onExit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 15 }}>Back to groups</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {snapshot.migrationPending && (
        <View style={[styles.setupBanner, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
          <Text style={[styles.setupTitle, { color: colors.text }]}>One-time database setup needed</Text>
          <Text style={[styles.setupBody, { color: colors.textSecondary }]}>
            Digital room keys and guest requests need their tables. Open the Supabase dashboard → SQL Editor and run
            supabase/migrations/0001_hotel_platform.sql. Rooms and guests work fine until then.
          </Text>
        </View>
      )}

      {hotel ? <PropertyCard hotel={hotel} onUpdated={onHotelUpdated} /> : null}

      {/* Today at a glance */}
      <View style={styles.statRow}>
        <Stat value={derived.counts.available} label="Available" accent={colors.success} />
        <Stat value={derived.counts.occupied} label="Occupied" accent={colors.info} />
        <Stat value={derived.arrivalsToday.length} label="Arriving" accent={colors.warning} />
        <Stat value={derived.departuresToday.length} label="Departing" accent={colors.orange} />
      </View>

      {/* Arrivals / departures / keys */}
      {(derived.arrivalsToday.length > 0 || derived.departuresToday.length > 0 || derived.notCheckedIn.length > 0) && (
        <Card style={{ marginTop: spacing.lg }}>
          {derived.arrivalsToday.length > 0 && (
            <View style={styles.todayBlock}>
              <Text style={[styles.todayTitle, { color: colors.text }]}>Arriving today</Text>
              {derived.arrivalsToday.map((r) => (
                <Text key={`a-${r.guest_id}`} style={[styles.todayLine, { color: colors.textSecondary }]}>
                  {guestName(r.guest_id)} · Room {roomNumber(r.room_id)}
                </Text>
              ))}
            </View>
          )}
          {derived.departuresToday.length > 0 && (
            <View style={styles.todayBlock}>
              <Text style={[styles.todayTitle, { color: colors.text }]}>Departing today</Text>
              {derived.departuresToday.map((r) => (
                <Text key={`d-${r.guest_id}`} style={[styles.todayLine, { color: colors.textSecondary }]}>
                  {guestName(r.guest_id)} · Room {roomNumber(r.room_id)}
                </Text>
              ))}
            </View>
          )}
          {derived.notCheckedIn.length > 0 && (
            <View style={[styles.todayBlock, { marginBottom: 0 }]}>
              <Text style={[styles.todayTitle, { color: colors.text }]}>
                Not checked in yet ({derived.notCheckedIn.length})
              </Text>
              <Text style={[styles.todayLine, { color: colors.textSecondary }]} numberOfLines={2}>
                {derived.notCheckedIn.slice(0, 5).map((r) => guestName(r.guest_id)).join(', ')}
                {derived.notCheckedIn.length > 5 ? ` +${derived.notCheckedIn.length - 5} more` : ''}
              </Text>
            </View>
          )}
        </Card>
      )}

      {/* Open guest requests */}
      {snapshot.requests.length > 0 && (
        <>
          <SectionTitle>Guest requests</SectionTitle>
          {snapshot.requests.map((req) => (
            <Card key={req.id} style={{ marginBottom: spacing.sm }}>
              <View style={styles.requestRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.requestType, { color: colors.text }]}>
                    {REQUEST_LABEL[req.type] ?? req.type} · Room {roomNumber(req.room_id)}
                  </Text>
                  <Text style={[styles.requestMsg, { color: colors.textSecondary }]}>
                    {req.guest_id ? guestName(req.guest_id) : 'Guest'}{req.message ? `: ${req.message}` : ''}
                  </Text>
                  <Text style={[styles.requestTime, { color: colors.textTertiary }]}>{formatDate(req.created_at)}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.resolveButton, { backgroundColor: colors.tintSoft }]}
                  onPress={async () => {
                    const error = await resolveGuestRequest(req.id);
                    if (error) Alert.alert('Error', error);
                    else refresh();
                  }}
                >
                  <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 13 }}>Done</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))}
        </>
      )}

      {/* Live room overview */}
      <AnnouncementBar tripId={trip.id} />

      <SectionTitle
        right={
          <Pill
            label={`${derived.activeKeys.length} active keys`}
            color={colors.tint}
            background={colors.tintSoft}
          />
        }
      >
        Rooms
      </SectionTitle>

      <View style={styles.filterRow}>
        {filters.map((f) => {
          const active = filter === f.id;
          const fg = f.id === 'all' ? null : statusColors(colors, f.id as RoomStatus).fg;
          return (
            <TouchableOpacity
              key={f.id}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.tint : colors.surface,
                  borderColor: active ? colors.tint : colors.border,
                },
              ]}
              onPress={() => setFilter(f.id)}
            >
              {fg ? <View style={[styles.filterDot, { backgroundColor: active ? colors.onTint : fg }]} /> : null}
              <Text style={{ color: active ? colors.onTint : colors.text, fontWeight: '700', fontSize: 13 }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filteredRooms.length === 0 ? (
        <EmptyState
          icon={<BedIcon size={26} color={colors.textTertiary} />}
          title={filter === 'all' ? 'No rooms yet' : `No ${filter === 'out_of_service' ? 'out-of-service' : filter} rooms`}
          subtitle={filter === 'all' ? 'Add your property’s rooms in the Rooms tab.' : undefined}
        />
      ) : (
        filteredRooms.map((room) => <RoomCard key={room.id} room={room} onPress={onOpenRoom} />)
      )}
    </ScrollView>
  );
}

/** Post a message to everyone on the trip. */
function AnnouncementBar({ tripId }: { tripId: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <SecondaryButton
        title="Post an announcement"
        onPress={() => setOpen(true)}
        style={{ marginTop: spacing.lg }}
      />
    );
  }

  return (
    <Card style={{ marginTop: spacing.lg }}>
      <Text style={[styles.announceLabel, { color: colors.textTertiary }]}>ANNOUNCEMENT</Text>
      <Field placeholder="Title (e.g. Breakfast moved to 7am)" value={title} onChangeText={setTitle} />
      <Field placeholder="Message" value={message} onChangeText={setMessage} multiline />
      <PrimaryButton
        title={busy ? 'Sending…' : 'Send to everyone on this trip'}
        disabled={busy || !title.trim() || !message.trim()}
        onPress={async () => {
          setBusy(true);
          const { sent, error } = await announce({ tripId, title, message });
          setBusy(false);
          if (error) {
            Alert.alert('Could not send', error);
            return;
          }
          setTitle('');
          setMessage('');
          setOpen(false);
          Alert.alert('Announcement sent', `Delivered to ${sent} guest${sent === 1 ? '' : 's'}.`);
        }}
      />
      <SecondaryButton title="Cancel" onPress={() => setOpen(false)} style={{ marginTop: spacing.sm }} />
    </Card>
  );
}

const styles = StyleSheet.create({
  announceLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: spacing.md },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  hotelName: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  tripName: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  setupBanner: { borderRadius: 14, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.lg },
  setupTitle: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  setupBody: { fontSize: 13, lineHeight: 19 },
  todayBlock: { marginBottom: spacing.md },
  todayTitle: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  todayLine: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  requestType: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  requestMsg: { fontSize: 13, fontWeight: '500' },
  requestTime: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  resolveButton: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterDot: { width: 7, height: 7, borderRadius: 4 },
});
