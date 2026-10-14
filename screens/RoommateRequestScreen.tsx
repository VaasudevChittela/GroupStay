import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableWithoutFeedback, View, TextInput, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { styles } from '../styles';
import { colors } from '../lib/theme';

type RequestGuest = { id: number; legal_name: string; school: string; roommate_request_id: number | null };

export default function RoommateRequestScreen({ onBack, guestId, tripId }: { onBack: () => void; guestId: number; tripId: number }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [allGuests, setAllGuests] = useState<RequestGuest[]>([]);
  const [myRequest, setMyRequest] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  const loadGuests = async () => {
    setLoading(true);
    const [{ data: guests, error: guestsError }, { data: me, error: meError }] = await Promise.all([
      supabase
        .from('guests')
        .select('id, legal_name, school, roommate_request_id')
        .eq('trip_id', tripId)
        .neq('id', guestId)
        .order('legal_name', { ascending: true }),
      supabase
        .from('guests')
        .select('roommate_request_id')
        .eq('id', guestId)
        .single(),
    ]);

    setLoading(false);
    if (guestsError || meError) {
      showAlert('Error', errorMessage(guestsError || meError));
      return;
    }
    setAllGuests(guests ?? []);
    setMyRequest(me?.roommate_request_id ?? null);
  };

  useEffect(() => {
    loadGuests();
  }, []);

  const handleRequest = async (targetGuestId: number) => {
    setUpdating(true);
    const { error } = await supabase
      .from('guests')
      .update({ roommate_request_id: targetGuestId })
      .eq('id', guestId);

    setUpdating(false);
    if (error) {
      showAlert('Error', errorMessage(error));
      return;
    }
    setMyRequest(targetGuestId);
  };

  const handleCancel = async () => {
    setUpdating(true);
    const { error } = await supabase
      .from('guests')
      .update({ roommate_request_id: null })
      .eq('id', guestId);

    setUpdating(false);
    if (error) {
      showAlert('Error', errorMessage(error));
      return;
    }
    setMyRequest(null);
  };

  const filteredGuests = allGuests.filter(guest =>
    guest.legal_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatus = (guest: { id: number; roommate_request_id: number | null }) => {
    if (myRequest === guest.id && guest.roommate_request_id === guestId) {
      return 'confirmed';
    }
    if (myRequest === guest.id) {
      return 'pending';
    }
    if (guest.roommate_request_id === guestId) {
      return 'incoming';
    }
    return 'none';
  };

  return (
    <KeyboardAvoidingView style={styles.keyboardAvoidingContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, styles.pageContent]}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Request Roommate</Text>
          <Text style={styles.subtitle}>Search for students in your trip to request as roommate.</Text>
          <TextInput
            style={styles.input}
            placeholder="Search by name"
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
      {loading ? (
        <Text style={styles.subtitle}>Loading...</Text>
      ) : (
        <View style={styles.guestListContainer}>
          {filteredGuests.length === 0 ? (
            <Text style={styles.normalText}>No students found.</Text>
          ) : (
            filteredGuests.map((guest) => {
              const status = getStatus(guest);
              return (
                <View key={guest.id} style={styles.guestRow}>
                  <Text style={styles.guestName}>{guest.legal_name}</Text>
                  <Text style={styles.normalText}>{guest.school}</Text>
                  {status === 'confirmed' && (
                    <Text style={[styles.normalText, { color: colors.success }]}>Confirmed Roommate</Text>
                  )}
                  {status === 'pending' && (
                    <TouchableOpacity style={styles.secondaryButton} onPress={handleCancel} disabled={updating}>
                      <Text style={styles.secondaryButtonText}>{updating ? '...' : 'Cancel Request'}</Text>
                    </TouchableOpacity>
                  )}
                  {status === 'incoming' && (
                    <TouchableOpacity style={styles.button} onPress={() => handleRequest(guest.id)} disabled={updating}>
                      <Text style={styles.buttonText}>{updating ? '...' : 'Accept Request'}</Text>
                    </TouchableOpacity>
                  )}
                  {status === 'none' && (
                    <TouchableOpacity style={styles.button} onPress={() => handleRequest(guest.id)} disabled={updating}>
                      <Text style={styles.buttonText}>{updating ? '...' : 'Request'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
