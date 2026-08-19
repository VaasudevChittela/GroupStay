import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { radius, spacing, useTheme } from '../../lib/theme';
import { DigitalKey, HotelGuest, HotelRoom, Reservation } from '../../lib/hotelTypes';
import { createGuestRequest, formatDate, nightsBetween } from '../../lib/hotel';
import { getActiveKeyForGuest, shareKey } from '../../lib/keys';
import { demoStay, isDemoMode } from '../../lib/demo';
import { registerForPush, scheduleStayReminders } from '../../lib/notifications';
import KeyCard from '../../components/KeyCard';
import { Card, EmptyState, PrimaryButton, SecondaryButton, SectionTitle } from '../../components/ui';
import { AlertIcon, CleaningIcon, ClockIcon, SearchIcon } from '../../components/icons';
import NotificationBell from '../../components/NotificationBell';

type Stay = {
  guest: HotelGuest;
  reservation: Reservation | null;
  room: HotelRoom | null;
  key: DigitalKey | null;
  roommates: HotelGuest[];
  sharedByName: string | null;
};

/**
 * The guest's stay: reservation details, the digital room key with wallet
 * buttons, key sharing with roommates, and service requests.
 */
export default function GuestStayScreen({
  guestId,
  trip,
  onBack,
  onOpenMessages,
}: {
  guestId: string;
  trip: { id: string; name: string; hotel_name: string };
  /** Omit when the surrounding shell already offers a way out. */
  onBack?: () => void;
  onOpenMessages?: () => void;
}) {
  const { colors } = useTheme();
  const [stay, setStay] = useState<Stay | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (isDemoMode()) {
      setStay(demoStay());
      setLoading(false);
      return;
    }

    const [guestRes, reservationRes, keyData] = await Promise.all([
      supabase
        .from('guests')
        .select('id, legal_name, email, phone, school, arrival_window, is_chaperone')
        .eq('id', guestId)
        .maybeSingle(),
      supabase.from('assignments').select('*').eq('guest_id', guestId).maybeSingle(),
      getActiveKeyForGuest(guestId),
    ]);

    const guest = guestRes.data as HotelGuest | null;
    if (!guest) {
      setLoading(false);
      return;
    }

    const reservation = (reservationRes.data as Reservation) ?? null;
    let room: HotelRoom | null = null;
    let roommates: HotelGuest[] = [];

    if (reservation?.room_id) {
      const [roomRes, roommateRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', reservation.room_id).maybeSingle(),
        supabase
          .from('assignments')
          .select('guest_id')
          .eq('room_id', reservation.room_id)
          .neq('guest_id', guestId)
          // Without this, guests who already checked out stay listed as roommates.
          .in('status', ['reserved', 'checked_in']),
      ]);
      room = roomRes.data
        ? { ...(roomRes.data as any), photos: Array.isArray(roomRes.data.photos) ? roomRes.data.photos : [] }
        : null;

      const roommateIds = (roommateRes.data ?? []).map((r: any) => r.guest_id);
      if (roommateIds.length > 0) {
        const { data } = await supabase
          .from('guests')
          .select('id, legal_name, email, phone, school, arrival_window, is_chaperone')
          .in('id', roommateIds);
        roommates = (data ?? []) as HotelGuest[];
      }
    }

    let sharedByName: string | null = null;
    if (keyData?.shared_by) {
      const { data } = await supabase.from('guests').select('legal_name').eq('id', keyData.shared_by).maybeSingle();
      sharedByName = data?.legal_name ?? null;
    }

    setStay({ guest, reservation, room, key: keyData, roommates, sharedByName });
    setLoading(false);
  }, [guestId]);

  // Reminders are scheduled on the device, so they still fire offline — and
  // rescheduled whenever the stay changes, so a room move or extended checkout
  // never leaves a stale alert behind.
  useEffect(() => {
    if (!stay) return;
    scheduleStayReminders({
      guestId,
      hotelName: trip.hotel_name,
      roomNumber: stay.room?.room_number ?? null,
      checkIn: stay.reservation?.check_in ?? null,
      checkOut: stay.reservation?.check_out ?? null,
      keyValidUntil: stay.key?.valid_until ?? null,
    });
  }, [stay, guestId, trip.hotel_name]);

  useEffect(() => {
    registerForPush();
  }, []);

  useEffect(() => {
    load();
    if (isDemoMode()) return;

    // Keep the key live: staff revokes, room moves, and checkout land instantly.
    const channel = supabase
      .channel(`guest-stay-${guestId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'digital_keys', filter: `guest_id=eq.${guestId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `guest_id=eq.${guestId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [guestId, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const requestService = (type: 'housekeeping' | 'issue' | 'late_checkout', label: string, message: string) => {
    if (!stay) return;
    Alert.alert(label, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send request',
        onPress: async () => {
          setBusy(true);
          const error = await createGuestRequest(trip.id, guestId, stay.room?.id ?? null, type, message);
          setBusy(false);
          Alert.alert(error ? 'Error' : 'Sent', error ?? 'The front desk has your request.');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  if (!stay) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <EmptyState icon={<SearchIcon size={26} color={colors.textTertiary} />} title="Reservation not found" subtitle="Try rejoining the trip with your code." />
          {onBack ? <PrimaryButton title="Back" onPress={onBack} /> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const { guest, reservation, room, key, roommates, sharedByName } = stay;
  const nights = nightsBetween(reservation?.check_in ?? null, reservation?.check_out ?? null);
  const checkedIn = reservation?.status === 'checked_in';

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
      >
        {onBack ? (
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: colors.tint, fontSize: 16, fontWeight: '700' }}>‹ Back</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>My Stay</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {trip.hotel_name} · {trip.name}
            </Text>
          </View>
          <NotificationBell />
        </View>

        {/* The key */}
        {key && room ? (
          <View style={{ marginTop: spacing.lg }}>
            <KeyCard
              keyData={key}
              hotelName={trip.hotel_name}
              guestName={guest.legal_name}
              roomNumber={room.room_number}
              confirmation={reservation?.confirmation_code ?? '—'}
              checkIn={reservation?.check_in ?? null}
              checkOut={reservation?.check_out ?? null}
              sharedByName={sharedByName}
            />
          </View>
        ) : (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[styles.pendingTitle, { color: colors.text }]}>
              {room ? 'Key activates at check-in' : 'Room not assigned yet'}
            </Text>
            <Text style={[styles.pendingBody, { color: colors.textSecondary }]}>
              {room
                ? `You're booked into Room ${room.room_number}. The front desk activates your digital key when you check in — it will appear right here.`
                : 'Your advisor or the front desk will assign your room shortly. Your digital key appears here automatically.'}
            </Text>
          </Card>
        )}

        {/* Reservation details */}
        <SectionTitle>Reservation</SectionTitle>
        <Card>
          <DetailRow label="Guest" value={guest.legal_name} />
          <DetailRow label="Room" value={room ? `${room.room_number} · ${room.room_type}` : 'Pending'} />
          <DetailRow label="Confirmation" value={reservation?.confirmation_code ?? '—'} />
          <DetailRow
            label="Stay"
            value={
              reservation?.check_in
                ? `${formatDate(reservation.check_in)} → ${formatDate(reservation.check_out)}${nights ? ` (${nights} night${nights === 1 ? '' : 's'})` : ''}`
                : '—'
            }
          />
          <DetailRow label="Status" value={checkedIn ? 'Checked in' : reservation ? 'Reserved — not checked in' : 'No reservation'} last />
        </Card>

        {/* Roommates + key sharing */}
        {room && roommates.length > 0 && (
          <>
            <SectionTitle>Roommates</SectionTitle>
            <Card>
              {roommates.map((mate, index) => (
                <View key={mate.id} style={[styles.mateRow, index === roommates.length - 1 && { borderBottomWidth: 0 }, { borderBottomColor: colors.border }]}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                    {mate.legal_name}
                    {mate.is_chaperone ? ' · Chaperone' : ''}
                  </Text>
                  {key && sharing && (
                    <TouchableOpacity
                      style={[styles.shareButton, { backgroundColor: colors.tintSoft }]}
                      disabled={busy}
                      onPress={async () => {
                        setBusy(true);
                        const result = await shareKey({ targetGuestId: mate.id });
                        setBusy(false);
                        Alert.alert(
                          result.error ? 'Could not share key' : 'Key shared',
                          result.error ??
                            (result.data
                              ? `${mate.legal_name} can now open Room ${room.room_number}.`
                              : `${mate.legal_name} already has a key for this room.`),
                        );
                        await load();
                      }}
                    >
                      <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 13 }}>Share key</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {key && (
                <SecondaryButton
                  title={sharing ? 'Done sharing' : 'Share room access'}
                  onPress={() => setSharing((s) => !s)}
                  style={{ marginTop: spacing.md }}
                />
              )}
            </Card>
          </>
        )}

        {/* Services */}
        {onOpenMessages ? (
          <SecondaryButton title="Messages" onPress={onOpenMessages} style={{ marginTop: spacing.lg }} />
        ) : null}

        <SectionTitle>Requests</SectionTitle>
        <View style={styles.serviceGrid}>
          <ServiceButton
            Icon={CleaningIcon}
            label="Housekeeping"
            onPress={() => requestService('housekeeping', 'Request housekeeping', 'Please service my room.')}
            disabled={busy || !room}
          />
          <ServiceButton
            Icon={AlertIcon}
            label="Report issue"
            onPress={() => requestService('issue', 'Report a room issue', 'Something in my room needs attention.')}
            disabled={busy || !room}
          />
          <ServiceButton
            Icon={ClockIcon}
            label="Late checkout"
            onPress={() => requestService('late_checkout', 'Request late checkout', 'I would like a later checkout time if available.')}
            disabled={busy || !room}
          />
        </View>

        {room?.notes ? (
          <>
            <SectionTitle>Room notes</SectionTitle>
            <Card>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>{room.notes}</Text>
            </Card>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.detailRow, { borderBottomColor: colors.border }, last && { borderBottomWidth: 0, paddingBottom: 0 }]}>
      <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function ServiceButton({
  Icon,
  label,
  onPress,
  disabled,
}: {
  Icon: (props: { size?: number; color: string }) => React.ReactElement;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.serviceButton,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.45 : 1 },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      <Icon size={22} color={colors.tint} />
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 4, textAlign: 'center' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerRow: { marginBottom: spacing.md },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { fontSize: 14, fontWeight: '600', marginTop: 3 },
  pendingTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  pendingBody: { fontSize: 14, lineHeight: 21 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  shareButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  serviceGrid: { flexDirection: 'row', gap: spacing.sm },
  serviceButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
});
