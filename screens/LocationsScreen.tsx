import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/format';
import { BackButton, Page, SmallButton } from '../components/ui';
import { styles } from '../styles';
import LocationsMap from '../components/LocationsMap';

type SharedLocation = {
  guest_id: number;
  legal_name: string;
  is_chaperone: boolean;
  latitude: number;
  longitude: number;
  updated_at: string;
};

// Advisor-only view of students who opted in to share their location for this trip.
export default function LocationsScreen({ tripId, onBack }: { tripId: number; onBack: () => void }) {
  const [locations, setLocations] = useState<SharedLocation[]>([]);
  const [guestCount, setGuestCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [{ data: locationRows }, { data: guestRows }] = await Promise.all([
      supabase.from('locations').select('guest_id, latitude, longitude, updated_at').eq('trip_id', tripId),
      supabase.from('guests').select('id, legal_name, is_chaperone, share_location').eq('trip_id', tripId),
    ]);
    const guests = new Map((guestRows ?? []).map((guest) => [guest.id, guest]));
    setGuestCount(guestRows?.length ?? 0);
    setLocations(
      (locationRows ?? [])
        .filter((row) => guests.get(row.guest_id)?.share_location)
        .map((row) => ({
          ...row,
          legal_name: guests.get(row.guest_id)?.legal_name ?? 'Unknown',
          is_chaperone: Boolean(guests.get(row.guest_id)?.is_chaperone),
        }))
        .sort((a, b) => a.legal_name.localeCompare(b.legal_name)),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [tripId]);

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Locations</Text>
      <Text style={styles.pageSubtitle}>
        {`${locations.length} of ${guestCount} travelers are sharing. Sharing is opt-in, only covers this trip, and only advisors can see it.`}
      </Text>
      {loading ? (
        <Text style={styles.normalText}>Loading...</Text>
      ) : locations.length === 0 ? (
        <Text style={styles.normalText}>No one is sharing their location right now.</Text>
      ) : (
        <>
        <LocationsMap
          pins={locations.map((l) => ({ label: l.legal_name.split(' ')[0], latitude: l.latitude, longitude: l.longitude }))}
        />
        {locations.map((location) => (
          <View key={location.guest_id} style={styles.card}>
            <Text style={styles.cardTitle}>{`${location.legal_name}${location.is_chaperone ? ' (chaperone)' : ''}`}</Text>
            <Text style={styles.cardText}>{`${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}</Text>
            <Text style={styles.mutedText}>{`Updated ${timeAgo(location.updated_at)}`}</Text>
            <View style={styles.actionRow}>
              <SmallButton
                text="Open in Maps"
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`)}
              />
            </View>
          </View>
        ))}
        </>
      )}
    </Page>
  );
}
