import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, useTheme } from '../../lib/theme';
import { Profile, loadMyTrip } from '../../lib/session';
import { EmptyState, SecondaryButton } from '../../components/ui';
import { BuildingIcon } from '../../components/icons';
import GuestStayScreen from './GuestStayScreen';
import MessagesScreen from '../shared/MessagesScreen';

/**
 * A student sees exactly one thing: their own stay. The trip is resolved
 * through the my_trip() function because students have no SELECT on the trips
 * table at all — they cannot list or probe other groups.
 */
export default function StudentApp({
  profile,
  onSignOut,
  hideBack,
}: {
  profile: Profile;
  onSignOut: () => Promise<void>;
  /** True when an outer shell already shows a sign-out control. */
  hideBack?: boolean;
}) {
  const { colors } = useTheme();
  const [trip, setTrip] = useState<{ id: string; name: string; hotel_name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMessages, setShowMessages] = useState(false);

  const load = useCallback(async () => {
    const { trip: found, error: tripError } = await loadMyTrip();
    setTrip(found);
    setError(tripError);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile.guest_id || !trip) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <EmptyState
            icon={<BuildingIcon size={26} color={colors.textTertiary} />}
            title="No trip yet"
            subtitle={error ?? 'Join your chapter’s trip with the code from your advisor.'}
          />
          <SecondaryButton title="Sign out" onPress={onSignOut} style={{ minWidth: 200 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (showMessages) {
    return (
      <MessagesScreen
        role="student"
        tripId={trip.id}
        guestId={profile.guest_id}
        senderName={profile.full_name ?? 'Student'}
        onBack={() => setShowMessages(false)}
      />
    );
  }

  return (
    <GuestStayScreen
      guestId={profile.guest_id}
      trip={trip}
      onBack={hideBack ? undefined : onSignOut}
      onOpenMessages={() => setShowMessages(true)}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
