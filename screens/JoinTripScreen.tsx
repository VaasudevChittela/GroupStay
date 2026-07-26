import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function JoinTripScreen() {
  const [tripCode, setTripCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoinTrip = async () => {
    if (!tripCode) {
      Alert.alert('Missing code', 'Please enter a trip code.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.from('trips').select('*').eq('trip_code', tripCode).single();
    setLoading(false);

    if (error || !data) {
      Alert.alert('Join failed', 'Could not find a trip with that code.');
      return;
    }

    Alert.alert('Trip joined', `You joined ${data.trip_name} at ${data.hotel_name}.`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join Trip</Text>
      <Text style={styles.subtitle}>Enter the trip code from your advisor.</Text>

      <TextInput
        style={styles.input}
        placeholder="Trip Code"
        placeholderTextColor="#9CA3AF"
        value={tripCode}
        onChangeText={setTripCode}
        autoCapitalize="characters"
      />

      <Pressable style={styles.button} onPress={handleJoinTrip} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Joining...' : 'Join Trip'}</Text>
      </Pressable>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1A56A0',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#334155',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#1A56A0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});