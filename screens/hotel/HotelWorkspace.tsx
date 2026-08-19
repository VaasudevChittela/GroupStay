import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, useTheme } from '../../lib/theme';
import { loadScopedTrips } from '../../lib/hotel';
import { supabase } from '../../lib/supabase';
import { Org, Profile, shortLocation } from '../../lib/session';
import { TripSummary } from '../../lib/hotelTypes';
import { Card, EmptyState, Field, PrimaryButton, SecondaryButton, SectionTitle } from '../../components/ui';
import { BuildingIcon } from '../../components/icons';
import HotelApp from './HotelApp';

const makeTripCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Everything a staff member can reach hangs off the hotel on their profile.
 * Row level security already rejects any trip belonging to another property,
 * so this screen never has to ask "is this mine" — it simply lists what came
 * back.
 */
export default function HotelWorkspace({
  profile,
  hotel,
  onSignOut,
  onHotelUpdated,
}: {
  profile: Profile;
  hotel: Org;
  onSignOut: () => Promise<void>;
  /** Re-read the profile after staff edit the property details. */
  onHotelUpdated?: () => Promise<void> | void;
}) {
  const { colors } = useTheme();
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await loadScopedTrips({ hotelId: hotel.id });
    if (!result.data) {
      setError(result.error);
      setTrips([]);
      return;
    }
    const visible = result.data;
    setError(null);
    setTrips(visible);
    // A property with a single group in house shouldn't make staff pick it.
    if (visible.length === 1) setActiveTripId((current) => current ?? visible[0].id);
  }, [hotel.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createGroup = async () => {
    if (!groupName.trim()) return;
    setBusy(true);
    const { data, error: insertError } = await supabase
      .from('trips')
      .insert([
        {
          name: groupName.trim(),
          hotel_name: hotel.name,
          hotel_id: hotel.id,
          trip_code: makeTripCode(),
          status: 'draft',
          check_in: todayISO(),
          check_out: todayISO(),
        },
      ])
      .select('id, name, hotel_name, trip_code')
      .single();
    setBusy(false);

    if (insertError || !data) {
      Alert.alert('Could not create group', insertError?.message ?? 'Unknown error');
      return;
    }
    setGroupName('');
    setCreating(false);
    await refresh();
    Alert.alert('Group created', `Share code ${data.trip_code} with the chapter advisor.`);
  };

  if (trips === null) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  const activeTrip = trips.find((t) => t.id === activeTripId) ?? null;
  if (activeTrip) {
    return (
      <HotelApp
        trip={activeTrip}
        hotel={hotel}
        onExit={trips.length > 1 ? () => setActiveTripId(null) : undefined}
        onHotelUpdated={onHotelUpdated}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.orgName, { color: colors.text }]}>{hotel.name}</Text>
            <Text style={[styles.orgMeta, { color: colors.textSecondary }]}>
              {shortLocation(hotel) ?? 'Location not set'} · {profile.full_name ?? profile.email}
            </Text>
          </View>
          <TouchableOpacity onPress={onSignOut} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 15 }}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text> : null}

        {trips.length === 0 && !creating ? (
          <EmptyState
            icon={<BuildingIcon size={26} color={colors.textTertiary} />}
            title="No groups in house"
            subtitle="Create a group block, then share its code with the chapter advisor so their students can join."
          />
        ) : (
          <>
            <SectionTitle>Groups in house</SectionTitle>
            {trips.map((trip) => (
              <TouchableOpacity key={trip.id} onPress={() => setActiveTripId(trip.id)} activeOpacity={0.75}>
                <Card style={{ marginBottom: spacing.sm }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{trip.name}</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 2 }}>
                    Code {trip.trip_code}
                  </Text>
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}

        {creating ? (
          <>
            <SectionTitle>New group block</SectionTitle>
            <Field
              placeholder="Group name (e.g. Lincoln HS DECA — State)"
              value={groupName}
              onChangeText={setGroupName}
              autoCapitalize="words"
            />
            <PrimaryButton title="Create group" onPress={createGroup} disabled={busy || !groupName.trim()} />
            <SecondaryButton title="Cancel" onPress={() => setCreating(false)} style={{ marginTop: spacing.sm }} />
          </>
        ) : (
          <PrimaryButton title="Create a group block" onPress={() => setCreating(true)} style={{ marginTop: spacing.md }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  orgName: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  orgMeta: { fontSize: 13, fontWeight: '600', marginTop: 2 },
});
