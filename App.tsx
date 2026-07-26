import { useEffect, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableWithoutFeedback, View, TextInput, TouchableOpacity } from 'react-native';
import { supabase } from './lib/supabase';
import { autoAssignGuests } from './lib/assignments';
import { supabaseUrl, supabaseAnonKey } from './lib/supabaseConfig';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';

type Screen = 'home' | 'advisor' | 'student' | 'staff' | 'login' | 'signup';
type AssignmentCountMap = Map<number, number>;

type GuestListItem = { id: number; legal_name: string; school: string; room_number?: string | null; room_type?: string | null; requested_roommate_id?: number | null };

type ThreadType = { id: string; name: string; canPost: boolean };
type MessageItem = { id: number; sender_name: string; sender_role: string; content: string; created_at: string };

type RoomOption = { id: number; room_number: string; room_type: string; capacity: number; school: string; occupants?: number };
type GuestInfo = { id: number; legal_name: string; school: string; arrival_window: string; is_chaperone: boolean; roommate_request_id?: number | null };
type AssignmentItem = { guest_id: number; room_id: number };
type RequestGuest = { id: number; legal_name: string; school: string; roommate_request_id: number | null };

type TripInfo = { id: number; name: string; hotel_name: string; trip_code?: string };

function HomeScreen({ onSelect }: { onSelect: (screen: Screen) => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>GroupStay</Text>
      <Text style={styles.subtitle}>Hotel check-in for groups</Text>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={styles.button} onPress={() => onSelect('advisor')}>
          <Text style={styles.buttonText}>I'm an Advisor</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => onSelect('student')}>
          <Text style={styles.buttonText}>I'm a Student</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => onSelect('staff')}>
          <Text style={styles.buttonText}>I'm Hotel Staff</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AdvisorScreen({ onBack }: { onBack: () => void }) {
  const [tripName, setTripName] = useState('');
  const [hotelName, setHotelName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showGuestList, setShowGuestList] = useState(false);
  const [showAssignmentManager, setShowAssignmentManager] = useState(false);
  const [showRoomManager, setShowRoomManager] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [tripCreated, setTripCreated] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<{ id: number; name: string; hotel_name: string; trip_code: string } | null>(null);
  const [roomNumber, setRoomNumber] = useState('');
  const [roomCapacity, setRoomCapacity] = useState('1');
  const [roomType, setRoomType] = useState<'Single' | 'Double' | 'Quad'>('Single');
  const [roomSchool, setRoomSchool] = useState('');
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [stats, setStats] = useState<{ totalGuests: number; assigned: number; unassigned: number; roomsAdded: number; hasAssignments: boolean } | null>(null);

  const loadStats = async (tripId: number) => {
    const [{ count: totalGuests }, { count: assigned }, { count: roomsAdded }] = await Promise.all([
      supabase.from('guests').select('*', { count: 'exact', head: true }).eq('trip_id', tripId),
      supabase.from('assignments').select('*', { count: 'exact', head: true }).eq('trip_id', tripId),
      supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('trip_id', tripId),
    ]);
    const unassigned = (totalGuests ?? 0) - (assigned ?? 0);
    const hasAssignments = (assigned ?? 0) > 0;
    setStats({ totalGuests: totalGuests ?? 0, assigned: assigned ?? 0, unassigned, roomsAdded: roomsAdded ?? 0, hasAssignments });
  };

  const createTripCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const getToday = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleCreate = async () => {
    if (!tripName || !hotelName) {
      Alert.alert('Missing info', 'Please enter both trip and hotel names.');
      return;
    }

    const tripCode = createTripCode();
    const today = getToday();
    setLoading(true);

    const { data, error } = await supabase
      .from('trips')
      .insert([
        {
          name: tripName,
          hotel_name: hotelName,
          trip_code: tripCode,
          status: 'draft',
          check_in: today,
          check_out: today,
        },
      ])
      .select('id, name, hotel_name, trip_code')
      .single();

    setLoading(false);

    if (error || !data) {
      Alert.alert('Error', JSON.stringify(error ?? 'Unable to create trip.'));
      return;
    }

    setCurrentTrip(data);
    setRooms([]);
    setTripCreated(true);
    await loadStats(data.id);
    Alert.alert('Trip Created!', `Share this code with your students: ${tripCode}`);
    setTripName('');
    setHotelName('');
  };

  const handleAddRoom = async () => {
    if (!currentTrip) {
      Alert.alert('Missing trip', 'Create a trip before adding rooms.');
      return;
    }
    if (!roomNumber.trim() || !roomCapacity.trim() || !roomSchool.trim()) {
      Alert.alert('Missing info', 'Please enter room number, capacity, and school.');
      return;
    }

    const capacity = Number(roomCapacity);
    if (!capacity || capacity <= 0) {
      Alert.alert('Invalid capacity', 'Capacity must be a positive number.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('rooms')
      .insert([
        {
          trip_id: currentTrip.id,
          room_number: roomNumber.trim(),
          capacity,
          room_type: roomType,
          school: roomSchool.trim(),
        },
      ])
      .select('id, room_number, capacity, room_type, school')
      .single();
    setLoading(false);

    if (error || !data) {
      Alert.alert('Error', JSON.stringify(error ?? 'Unable to add room.'));
      return;
    }

    setRooms((prev) => [...prev, data]);
    setRoomNumber('');
    setRoomCapacity('1');
    setRoomType('Single');
    setRoomSchool('');
    if (currentTrip) {
      await loadStats(currentTrip.id);
    }
  };

  if (showGuestList) {
    return <AdvisorGuestListScreen onBack={() => setShowGuestList(false)} tripId={currentTrip?.id ?? null} />;
  }

  if (showAssignmentManager) {
    return <AdvisorAssignmentScreen onBack={() => setShowAssignmentManager(false)} tripId={currentTrip?.id ?? null} />;
  }

  if (showRoomManager && currentTrip) {
    return (
      <KeyboardAvoidingView style={styles.keyboardAvoidingContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, styles.pageContent]}>
            <TouchableOpacity style={styles.backButton} onPress={() => setShowRoomManager(false)}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Manage Rooms</Text>
            <Text style={styles.subtitle}>{`Trip: ${currentTrip.name}`}</Text>
            <Text style={styles.subtitle}>{`Hotel: ${currentTrip.hotel_name}`}</Text>
            <Text style={styles.subtitle}>{`Code: ${currentTrip.trip_code}`}</Text>

            <TextInput
              style={styles.input}
              placeholder="Room Number"
              placeholderTextColor="#94A3B8"
              value={roomNumber}
              onChangeText={setRoomNumber}
            />
            <TextInput
              style={styles.input}
              placeholder="Capacity"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={roomCapacity}
              onChangeText={setRoomCapacity}
            />
            <Text style={styles.subtitle}>Room Type</Text>
            <View style={styles.roomTypeRow}>
              {['Single', 'Double', 'Quad'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={roomType === type ? [styles.roomTypeButton, styles.roomTypeSelected] : styles.roomTypeButton}
                  onPress={() => setRoomType(type as 'Single' | 'Double' | 'Quad')}
                >
                  <Text style={roomType === type ? [styles.roomTypeText, styles.roomTypeSelectedText] : styles.roomTypeText}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="School"
              placeholderTextColor="#94A3B8"
              value={roomSchool}
              onChangeText={setRoomSchool}
            />
            <TouchableOpacity style={styles.button} onPress={handleAddRoom} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Add Room'}</Text>
            </TouchableOpacity>
            {rooms.length > 0 && (
              <View style={styles.roomList}>
                <Text style={styles.sectionTitle}>Rooms Added</Text>
                {rooms.map((room) => (
                  <View key={room.id} style={styles.roomRow}>
                    <Text style={styles.guestName}>{room.room_number}</Text>
                    <Text style={styles.normalText}>{`${room.school} • ${room.room_type} • Capacity ${room.capacity}`}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    );
  }

  if (showMessages) {
    return <MessagesScreen onBack={() => setShowMessages(false)} role="advisor" tripId={currentTrip!.id} />;
  }

  if (tripCreated && currentTrip) {
    return (
      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, styles.pageContent]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{currentTrip.name}</Text>
        <Text style={styles.subtitle}>{currentTrip.hotel_name}</Text>

        {stats && (
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{stats.totalGuests}</Text>
              <Text style={styles.statLabel}>Total Guests</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{stats.assigned}</Text>
              <Text style={styles.statLabel}>Assigned</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{stats.unassigned}</Text>
              <Text style={styles.statLabel}>Unassigned</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{stats.roomsAdded}</Text>
              <Text style={styles.statLabel}>Rooms Added</Text>
            </View>
          </View>
        )}

        <View style={styles.buttonsGrid}>
          <TouchableOpacity style={styles.gridButton} onPress={() => setShowRoomManager(true)}>
            <Text style={styles.gridButtonText}>Manage Rooms</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.gridButton} onPress={() => setShowGuestList(true)}>
            <Text style={styles.gridButtonText}>View Guests</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.gridButton} onPress={() => setShowAssignmentManager(true)}>
            <Text style={styles.gridButtonText}>Assign Rooms</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.gridButton} onPress={() => setShowMessages(true)}>
            <Text style={styles.gridButtonText}>Messages</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => Alert.alert('Trip Code', currentTrip.trip_code)}>
          <Text style={styles.secondaryButtonText}>Share Trip Code</Text>
        </TouchableOpacity>

        {stats?.hasAssignments && (
          <TouchableOpacity style={styles.button} onPress={async () => {
            const { error } = await supabase
              .from('trips')
              .update({ locked_at: new Date().toISOString() })
              .eq('id', currentTrip.id);
            if (error) {
              Alert.alert('Error', JSON.stringify(error));
            } else {
              Alert.alert('Locked', 'Trip assignments have been locked.');
              await loadStats(currentTrip.id); // Refresh stats if needed
            }
          }}>
            <Text style={styles.buttonText}>Lock Assignments</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.keyboardAvoidingContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, styles.pageContent]}>
          <Text style={styles.title}>Create Trip</Text>
          <Text style={styles.subtitle}>Enter trip details below.</Text>
          <TextInput
            style={styles.input}
            placeholder="Trip Name"
            placeholderTextColor="#94A3B8"
            value={tripName}
            onChangeText={setTripName}
          />
          <TextInput
            style={styles.input}
            placeholder="Hotel Name"
            placeholderTextColor="#94A3B8"
            value={hotelName}
            onChangeText={setHotelName}
          />
          <TouchableOpacity style={styles.button} onPress={handleCreate} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

function AdvisorGuestListScreen({ onBack, tripId }: { onBack: () => void; tripId: number | null }) {
  const [tripCode, setTripCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [tripInfo, setTripInfo] = useState<TripInfo | null>(null);
  const [guests, setGuests] = useState<GuestInfo[]>([]);

  const loadGuests = async (id: number) => {
    setLoading(true);
    const [{ data: trip, error: tripError }, { data: guestRows, error: guestError }] = await Promise.all([
      supabase.from('trips').select('id, name, hotel_name').eq('id', id).single(),
      supabase.from('guests').select('id, legal_name, school, arrival_window').eq('trip_id', id).order('legal_name', { ascending: true }),
    ]);

    setLoading(false);

    if (tripError || guestError) {
      Alert.alert('Error', JSON.stringify(tripError || guestError));
      return;
    }

    if (!trip) {
      Alert.alert('Trip not found', 'Trip not found');
      return;
    }

    setTripInfo(trip);
    setGuests((guestRows ?? []).map((guest) => ({
      ...guest,
      is_chaperone: false,
      roommate_request_id: null,
    })));
  };

  useEffect(() => {
    if (tripId) {
      loadGuests(tripId);
    }
  }, [tripId]);

  const handleLoadGuests = async () => {
    const code = tripCode.trim();
    if (!code) {
      Alert.alert('Missing code', 'Please enter a trip code.');
      return;
    }

    setLoading(true);
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, name, hotel_name')
      .eq('trip_code', code)
      .maybeSingle();

    if (tripError) {
      setLoading(false);
      Alert.alert('Error', JSON.stringify(tripError));
      return;
    }

    if (!trip) {
      setLoading(false);
      Alert.alert('Trip not found', 'Trip not found - check your code');
      return;
    }

    await loadGuests(trip.id);
  };

  return (
    <KeyboardAvoidingView style={styles.keyboardAvoidingContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Guest List</Text>
          {!tripId && (
            <>
              <Text style={styles.subtitle}>Enter a trip code to load guests.</Text>
              <TextInput
                style={styles.input}
                placeholder="Trip Code"
                placeholderTextColor="#94A3B8"
                value={tripCode}
                onChangeText={setTripCode}
              />
              <TouchableOpacity style={styles.button} onPress={handleLoadGuests} disabled={loading}>
                <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Load Guests'}</Text>
              </TouchableOpacity>
            </>
          )}
          {tripInfo ? (
            <ScrollView style={styles.guestListContainer} contentContainerStyle={styles.guestListContent}>
              <Text style={styles.subtitle}>{`Trip: ${tripInfo.name}`}</Text>
              <Text style={styles.subtitle}>{`Hotel: ${tripInfo.hotel_name}`}</Text>
              {guests.length === 0 ? (
                <Text style={styles.normalText}>No guests have checked in yet.</Text>
              ) : (
                guests.map((guest) => (
                  <View key={guest.id} style={styles.guestRow}>
                    <Text style={styles.guestName}>{guest.legal_name}</Text>
                    <Text style={styles.normalText}>{guest.school}</Text>
                    <Text style={styles.normalText}>{guest.arrival_window}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          ) : null}
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

function AdvisorAssignmentScreen({ onBack, tripId }: { onBack: () => void; tripId: number | null }) {
  const [tripCode, setTripCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [tripInfo, setTripInfo] = useState<TripInfo | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [guests, setGuests] = useState<GuestInfo[]>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [unassignedGuestIds, setUnassignedGuestIds] = useState<number[]>([]);

  const calculateUnassigned = (updatedAssignments: Array<{ guest_id: number; room_id: number }>, guestRows: Array<{ id: number }>) => {
    const assignedIds = new Set(updatedAssignments.map((assignment) => assignment.guest_id));
    return guestRows.filter((guest) => !assignedIds.has(guest.id)).map((guest) => guest.id);
  };

  const loadTripData = async (id: number) => {
    setLoading(true);
    const [{ data: trip, error: tripError }, { data: roomRows, error: roomError }, { data: guestRows, error: guestError }, { data: assignmentRows, error: assignmentError }] = await Promise.all([
      supabase.from('trips').select('id, name, hotel_name').eq('id', id).single(),
      supabase.from('rooms').select('id, room_number, capacity, room_type, school').eq('trip_id', id).order('room_number', { ascending: true }),
      supabase.from('guests').select('id, legal_name, school, arrival_window, is_chaperone, roommate_request_id').eq('trip_id', id).order('legal_name', { ascending: true }),
      supabase.from('assignments').select('guest_id, room_id').eq('trip_id', id),
    ]);

    setLoading(false);

    if (tripError || roomError || guestError || assignmentError) {
      Alert.alert('Error', JSON.stringify(tripError || roomError || guestError || assignmentError));
      return;
    }

    if (!trip) {
      Alert.alert('Trip not found', 'Trip not found');
      return;
    }

    const assignmentList = assignmentRows ?? [];
    setTripInfo(trip);
    setRooms(roomRows ?? []);
    setGuests((guestRows ?? []).map((guest) => ({
      ...guest,
      is_chaperone: false,
      roommate_request_id: null,
    })));
    setAssignments(assignmentList.map((assignment) => ({ guest_id: assignment.guest_id, room_id: assignment.room_id })));
    setUnassignedGuestIds(calculateUnassigned(assignmentList, guestRows ?? []));
  };

  useEffect(() => {
    if (tripId) {
      loadTripData(tripId);
    }
  }, [tripId]);

  const handleLoadAssignmentData = async () => {
    const code = tripCode.trim();
    if (!code) {
      Alert.alert('Missing code', 'Please enter a trip code.');
      return;
    }

    setLoading(true);
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, name, hotel_name')
      .eq('trip_code', code)
      .maybeSingle();

    if (tripError) {
      setLoading(false);
      Alert.alert('Error', JSON.stringify(tripError));
      return;
    }

    if (!trip) {
      setLoading(false);
      Alert.alert('Trip not found', 'Trip not found - check your code');
      return;
    }

    await loadTripData(trip.id);
  };

  const handleAutoAssign = () => {
    if (!tripInfo) {
      Alert.alert('No trip loaded', 'Load a trip before auto-assigning.');
      return;
    }

    setAutoAssigning(true);
    const result = autoAssignGuests(guests, rooms);
    setAssignments(result.assignments);
    setUnassignedGuestIds(result.unassignedGuestIds);
    setAutoAssigning(false);
  };

  const handleSaveAssignments = async () => {
    if (!tripInfo) {
      Alert.alert('No trip loaded', 'Load a trip before saving assignments.');
      return;
    }

    const payload = assignments.map((assignment) => ({
      trip_id: tripInfo.id,
      guest_id: assignment.guest_id,
      room_id: assignment.room_id,
    }));

    const { error } = await supabase.from('assignments').upsert(payload, { onConflict: 'guest_id' });

    if (error) {
      Alert.alert('Error saving assignments', JSON.stringify(error));
      return;
    }

    Alert.alert('Saved', 'Assignments saved successfully.');
  };

  const handleLockAssignments = async () => {
    if (!tripInfo) {
      Alert.alert('No trip loaded', 'Load a trip before locking assignments.');
      return;
    }

    const { error } = await supabase
      .from('trips')
      .update({ locked_at: new Date().toISOString() })
      .eq('id', tripInfo.id);

    if (error) {
      Alert.alert('Error locking assignments', JSON.stringify(error));
      return;
    }

    Alert.alert('Locked', 'Trip assignments have been locked.');
  };

  const assignmentMap = new Map<number, Array<{ id: number; legal_name: string }>>();
  assignments.forEach((assignment) => {
    const guest = guests.find((g) => g.id === assignment.guest_id);
    if (!guest) return;
    const list = assignmentMap.get(assignment.room_id) ?? [];
    list.push({ id: guest.id, legal_name: guest.legal_name });
    assignmentMap.set(assignment.room_id, list);
  });

  return (
    <KeyboardAvoidingView style={styles.keyboardAvoidingContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, styles.contentContainer]}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Assignment Manager</Text>
      {!tripId && (
        <>
          <Text style={styles.subtitle}>Load a trip code to review rooms and guest assignments.</Text>
          <TextInput
            style={styles.input}
            placeholder="Trip Code"
            placeholderTextColor="#94A3B8"
            value={tripCode}
            onChangeText={setTripCode}
          />
          <TouchableOpacity style={styles.button} onPress={handleLoadAssignmentData} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Load Trip'}</Text>
          </TouchableOpacity>
        </>
      )}

      {tripInfo ? (
        <View style={styles.assignmentPanel}>
          <Text style={styles.subtitle}>{`Trip: ${tripInfo.name}`}</Text>
          <Text style={styles.subtitle}>{`Hotel: ${tripInfo.hotel_name}`}</Text>

          <TouchableOpacity style={styles.button} onPress={handleAutoAssign} disabled={autoAssigning || rooms.length === 0 || guests.length === 0}>
            <Text style={styles.buttonText}>{autoAssigning ? 'Assigning...' : 'Auto Assign Guests'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={handleSaveAssignments} disabled={assignments.length === 0}>
            <Text style={styles.buttonText}>Save Assignments</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleLockAssignments}>
            <Text style={styles.secondaryButtonText}>Lock Assignments</Text>
          </TouchableOpacity>

          {rooms.length > 0 ? (
            <View style={styles.roomList}>
              <Text style={styles.sectionTitle}>Assignments by Room</Text>
              {rooms.map((room) => (
                <View key={room.id} style={styles.roomRow}>
                  <Text style={styles.guestName}>{`${room.room_number} (${room.room_type})`}</Text>
                  <Text style={styles.normalText}>{`${room.school} • Cap ${room.capacity}`}</Text>
                  {assignmentMap.get(room.id)?.length ? (
                    assignmentMap.get(room.id)?.map((guest) => (
                      <Text key={guest.id} style={styles.normalText}>{`• ${guest.legal_name}`}</Text>
                    ))
                  ) : (
                    <Text style={styles.normalText}>No guests assigned</Text>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.normalText}>No rooms available for this trip.</Text>
          )}

          <View style={styles.guestListContainer}>
            <Text style={styles.sectionTitle}>Unassigned Guests</Text>
            {unassignedGuestIds.length === 0 ? (
              <Text style={styles.normalText}>All guests are assigned.</Text>
            ) : (
              guests
                .filter((guest) => unassignedGuestIds.includes(guest.id))
                .map((guest) => (
                  <View key={guest.id} style={styles.guestRow}>
                    <Text style={styles.guestName}>{guest.legal_name}</Text>
                    <Text style={styles.normalText}>{guest.school}</Text>
                    <Text style={styles.normalText}>{guest.arrival_window}</Text>
                  </View>
                ))
            )}
          </View>
        </View>
      ) : null}
    </ScrollView>
  </TouchableWithoutFeedback>
</KeyboardAvoidingView>
  );
}

function MyRoomScreen({
  guestId,
  trip,
  onBack,
}: {
  guestId: number;
  trip: { id: number; name: string; hotel_name: string };
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [assignment, setAssignment] = useState<{
    room_number: string | null;
    room_type: string | null;
    room_id: number | null;
  } | null>(null);
  const [guestSchool, setGuestSchool] = useState<string>('');
  const [availableRooms, setAvailableRooms] = useState<RoomOption[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);

  const loadAssignment = async () => {
    setLoading(true);

    const [guestRes, assignmentRes, roomsRes, assignmentListRes] = await Promise.all([
      supabase.from('guests').select('school').eq('id', guestId).maybeSingle(),
      supabase.from('assignments').select('room_id').eq('guest_id', guestId).maybeSingle(),
      supabase.from('rooms').select('id, room_number, room_type, capacity, school').eq('trip_id', trip.id),
      supabase.from('assignments').select('guest_id, room_id').eq('trip_id', trip.id),
    ]);

    setLoading(false);

    if (guestRes.error || assignmentRes.error || roomsRes.error || assignmentListRes.error) {
      Alert.alert('Error', JSON.stringify(guestRes.error || assignmentRes.error || roomsRes.error || assignmentListRes.error));
      return;
    }

    const guestData = guestRes.data;
    if (!guestData) {
      Alert.alert('Error', 'Guest not found');
      return;
    }

    setGuestSchool(guestData.school ?? '');

    const roomCounts = new Map<number, number>();
    (assignmentListRes.data ?? []).forEach((row) => {
      if (row.room_id) {
        roomCounts.set(row.room_id, (roomCounts.get(row.room_id) ?? 0) + 1);
      }
    });

    const rooms = roomsRes.data ?? [];
    const assignmentData = assignmentRes.data;
    if (assignmentData?.room_id) {
      const room = rooms.find((roomItem) => roomItem.id === assignmentData.room_id);
      setAssignment({
        room_number: room?.room_number ?? null,
        room_type: room?.room_type ?? null,
        room_id: assignmentData.room_id,
      });
      setAvailableRooms([]);
    } else {
      setAssignment(null);
      const available = rooms
        .filter((room) => room.school === guestData.school)
        .filter((room) => (room.capacity - (roomCounts.get(room.id) ?? 0)) > 0)
        .map((room) => ({
          ...room,
          occupants: roomCounts.get(room.id) ?? 0,
        }));
      setAvailableRooms(available);
      setSelectedRoomId(available.length > 0 ? available[0].id : null);
    }
  };

  const handleAssignRoom = async () => {
    if (!selectedRoomId) {
      Alert.alert('Choose a room', 'Please select an available room.');
      return;
    }

    setAssigning(true);
    const { error } = await supabase
      .from('assignments')
      .upsert(
        [{
          trip_id: trip.id,
          guest_id: guestId,
          room_id: selectedRoomId,
        }],
        { onConflict: 'guest_id' },
      );
    setAssigning(false);

    if (error) {
      Alert.alert('Error', JSON.stringify(error));
      return;
    }

    await loadAssignment();
    Alert.alert('Room assigned', 'Your room has been assigned.');
  };

  const digitalKey = assignment?.room_number
    ? `KEY-${trip.id}-${guestId}-${assignment.room_number.replace(/\s+/g, '')}`
    : null;

  return (
    <KeyboardAvoidingView style={styles.keyboardAvoidingContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, styles.pageContent]}>
          <Text style={styles.title}>My Room</Text>
          {loading ? (
            <Text style={styles.subtitle}>Loading room details...</Text>
          ) : assignment && assignment.room_number ? (
            <>
              <Text style={styles.bigBlueText}>{assignment.room_number}</Text>
              <Text style={styles.subtitle}>{trip.hotel_name}</Text>
              {assignment.room_type ? <Text style={styles.normalText}>{assignment.room_type}</Text> : null}
              <Text style={[styles.subtitle, { marginTop: 16 }]}>Digital Key</Text>
              <View style={styles.roomRow}>
                <Text style={styles.normalText}>{digitalKey}</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.bigText}>Room Pending</Text>
              <Text style={styles.subtitle}>Your advisor will assign your room soon.</Text>
              <Text style={styles.subtitle}>{trip.hotel_name}</Text>
              {availableRooms.length > 0 ? (
                <>
                  <Text style={[styles.subtitle, { marginTop: 24 }]}>Available rooms for your school</Text>
                  {availableRooms.map((room) => (
                    <TouchableOpacity
                      key={room.id}
                      style={room.id === selectedRoomId ? [styles.roomRow, { borderColor: '#1A56A0', borderWidth: 2 }] : styles.roomRow}
                      onPress={() => setSelectedRoomId(room.id)}
                    >
                      <Text style={styles.guestName}>{room.room_number}</Text>
                      <Text style={styles.normalText}>{`${room.room_type} • ${room.school}`}</Text>
                      <Text style={styles.normalText}>{`Capacity ${room.capacity} • ${room.occupants} occupied`}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={styles.button} onPress={handleAssignRoom} disabled={assigning || !selectedRoomId}>
                    <Text style={styles.buttonText}>{assigning ? 'Assigning...' : 'Self-Assign Room'}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.normalText}>No available rooms for your school yet.</Text>
              )}
            </>
          )}
          <TouchableOpacity style={styles.button} onPress={onBack}>
            <Text style={styles.buttonText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

function RoommateRequestScreen({ onBack, guestId, tripId }: { onBack: () => void; guestId: number; tripId: number }) {
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
      Alert.alert('Error', JSON.stringify(guestsError || meError));
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
      Alert.alert('Error', JSON.stringify(error));
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
      Alert.alert('Error', JSON.stringify(error));
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
                    <Text style={[styles.normalText, { color: '#10B981' }]}>Confirmed Roommate</Text>
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

function MessagesScreen({ onBack, role, tripId, guestId }: { onBack: () => void; role: 'advisor' | 'student'; tripId: number; guestId?: number }) {
  const [threads, setThreads] = useState<ThreadType[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadType | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [senderName, setSenderName] = useState('');

  const loadThreads = async () => {
    const [schoolsRes, roomsRes] = await Promise.all([
      supabase.from('guests').select('school').eq('trip_id', tripId),
      supabase.from('rooms').select('id, room_number').eq('trip_id', tripId),
    ]);

    const schools = [...new Set(schoolsRes.data?.map(g => g.school) ?? [])];
    const rooms = roomsRes.data ?? [];

    let userSchool = '';
    let userRoomId = null;

    if (role === 'student' && guestId) {
      const [guestRes, assignRes] = await Promise.all([
        supabase.from('guests').select('legal_name, school').eq('id', guestId).single(),
        supabase.from('assignments').select('room_id').eq('guest_id', guestId).maybeSingle(),
      ]);
      setSenderName(guestRes.data?.legal_name ?? 'Student');
      userSchool = guestRes.data?.school ?? '';
      userRoomId = assignRes.data?.room_id ?? null;
    } else {
      setSenderName('Advisor');
    }

    const threadList: Array<{ id: string; name: string; canPost: boolean }> = [
      { id: `everyone-${tripId}`, name: 'Everyone', canPost: role === 'advisor' },
    ];

    if (role === 'advisor') {
      schools.forEach(school => {
        threadList.push({ id: `school-${school}-${tripId}`, name: `${school} School`, canPost: true });
      });
      rooms.forEach(room => {
        threadList.push({ id: `room-${room.id}`, name: room.room_number, canPost: true });
      });
    } else {
      if (userSchool) {
        threadList.push({ id: `school-${userSchool}-${tripId}`, name: `${userSchool} School`, canPost: false });
      }
      if (userRoomId) {
        const room = rooms.find(r => r.id === userRoomId);
        if (room) {
          threadList.push({ id: `room-${room.id}`, name: room.room_number, canPost: true });
        }
      }
    }

    setThreads(threadList);
    if (threadList.length > 0) {
      setSelectedThread(threadList[0]);
    }
  };

  const loadMessages = async () => {
    if (!selectedThread) return;
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_name, sender_role, content, created_at')
      .eq('thread_id', selectedThread.id)
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      return;
    }
    setMessages(data ?? []);
  };

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    if (selectedThread) {
      loadMessages();
    }
  }, [selectedThread]);

  useEffect(() => {
    if (selectedThread) {
      const interval = setInterval(loadMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedThread]);

  const handleSend = async () => {
    if (!selectedThread || !newMessage.trim() || !selectedThread.canPost) return;

    setSending(true);
    const { error } = await supabase
      .from('messages')
      .insert({
        thread_id: selectedThread.id,
        sender_name: senderName,
        sender_role: role,
        content: newMessage.trim(),
        trip_id: tripId,
      });

    setSending(false);
    if (error) {
      Alert.alert('Error', JSON.stringify(error));
      return;
    }
    setNewMessage('');
    loadMessages();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Messages</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.threadSelector}>
        {threads.map((thread) => (
          <TouchableOpacity
            key={thread.id}
            style={selectedThread?.id === thread.id ? [styles.threadTab, styles.threadTabSelected] : styles.threadTab}
            onPress={() => setSelectedThread(thread)}
          >
            <Text style={selectedThread?.id === thread.id ? [styles.threadTabText, styles.threadTabTextSelected] : styles.threadTabText}>
              {thread.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.messagesContainer} contentContainerStyle={styles.messagesContent}>
        {messages.map((msg) => (
          <View key={msg.id} style={styles.messageRow}>
            <Text style={styles.messageSender}>{msg.sender_name} ({msg.sender_role})</Text>
            <Text style={styles.messageContent}>{msg.content}</Text>
            <Text style={styles.messageTime}>{new Date(msg.created_at).toLocaleString()}</Text>
          </View>
        ))}
      </ScrollView>

      {selectedThread?.canPost && (
        <View style={styles.messageInputContainer}>
          <TextInput
            style={styles.messageInput}
            placeholder="Type a message..."
            placeholderTextColor="#94A3B8"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={sending || !newMessage.trim()}>
            <Text style={styles.sendButtonText}>{sending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function StudentScreen({ onBack }: { onBack: () => void }) {
  const [tripCode, setTripCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [joinedTrip, setJoinedTrip] = useState<{ id: number; name: string; hotel_name: string } | null>(null);
  const [legalName, setLegalName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [arrivalWindow, setArrivalWindow] = useState<'12-2 PM' | '2-4 PM' | '4-6 PM' | '6-8 PM' | ''>('');
  const [isChaperone, setIsChaperone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guestId, setGuestId] = useState<number | null>(null);
  const [submittedTrip, setSubmittedTrip] = useState<{ id: number; name: string; hotel_name: string } | null>(null);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [showRoomScreen, setShowRoomScreen] = useState(false);
  const [showRoommateRequest, setShowRoommateRequest] = useState(false);
  const [showMessages, setShowMessages] = useState(false);

  const arrivalOptions = ['12-2 PM', '2-4 PM', '4-6 PM', '6-8 PM'] as const;

  const handleJoin = async () => {
    const code = tripCode.trim();
    if (!code) {
      Alert.alert('Missing code', 'Please enter a trip code.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('trips')
      .select('id, name, hotel_name')
      .eq('trip_code', code)
      .maybeSingle();
    setLoading(false);

    if (error) {
      Alert.alert('Error', JSON.stringify(error));
      return;
    }

    if (!data) {
      Alert.alert('Trip not found', 'Trip not found - check your code');
      return;
    }

    Alert.alert(
      'Is this your trip?',
      `${data.name}\n${data.hotel_name}`,
      [
        { text: 'No' },
        { text: 'Yes', onPress: () => setJoinedTrip(data) },
      ],
    );
  };

  const handleSubmit = async () => {
    if (!joinedTrip) {
      return;
    }

    if (!legalName.trim() || !email.trim() || !phoneNumber.trim() || !schoolName.trim() || !arrivalWindow) {
      Alert.alert('Missing info', 'Please complete all fields before submitting.');
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase
      .from('guests')
      .insert([
        {
          trip_id: joinedTrip.id,
          legal_name: legalName.trim(),
          email: email.trim(),
          phone: phoneNumber.trim(),
          school: schoolName.trim(),
          arrival_window: arrivalWindow,
          is_chaperone: isChaperone,
        },
      ])
      .select('id')
      .single();
    setSubmitting(false);

    if (error) {
      Alert.alert('Error', JSON.stringify(error));
      return;
    }

    Alert.alert('Success', "You're all set! Your advisor will assign your room soon");
    setGuestId(data?.id ?? null);
    setSubmittedTrip(joinedTrip);
    setSubmissionComplete(true);
    setTripCode('');
    setJoinedTrip(null);
    setLegalName('');
    setEmail('');
    setPhoneNumber('');
    setSchoolName('');
    setArrivalWindow('');
    setIsChaperone(false);
  };

  if (showRoomScreen && guestId && submittedTrip) {
    return <MyRoomScreen guestId={guestId} trip={submittedTrip} onBack={() => setShowRoomScreen(false)} />;
  }

  if (showRoommateRequest && guestId && submittedTrip) {
    return <RoommateRequestScreen guestId={guestId} tripId={submittedTrip.id} onBack={() => setShowRoommateRequest(false)} />;
  }

  if (showMessages && guestId && submittedTrip) {
    return <MessagesScreen onBack={() => setShowMessages(false)} role="student" tripId={submittedTrip.id} guestId={guestId} />;
  }

  if (submissionComplete) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>You're all set!</Text>
        <Text style={styles.subtitle}>Your advisor will assign your room soon.</Text>
        <TouchableOpacity style={styles.button} onPress={() => setShowRoommateRequest(true)}>
          <Text style={styles.buttonText}>Request Roommate</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => setShowRoomScreen(true)}>
          <Text style={styles.buttonText}>View My Room</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => setShowMessages(true)}>
          <Text style={styles.buttonText}>Messages</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (joinedTrip) {
    return (
      <KeyboardAvoidingView style={styles.keyboardAvoidingContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, styles.pageContent]}>
            <Text style={styles.title}>Check-In Form</Text>
            <Text style={styles.subtitle}>{`Trip: ${joinedTrip.name} - ${joinedTrip.hotel_name}`}</Text>
            <TextInput
              style={styles.input}
              placeholder="Legal Name"
              placeholderTextColor="#94A3B8"
              value={legalName}
              onChangeText={setLegalName}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />
            <TextInput
              style={styles.input}
              placeholder="School Name"
              placeholderTextColor="#94A3B8"
              value={schoolName}
              onChangeText={setSchoolName}
            />
            <Text style={[styles.subtitle, { marginBottom: 16 }]}>Select your arrival window</Text>
            <View style={styles.optionRow}>
              {arrivalOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={
                    arrivalWindow === option
                      ? [styles.optionButton, styles.optionButtonSelected]
                      : styles.optionButton
                  }
                  onPress={() => setArrivalWindow(option)}
                >
                  <Text
                    style={
                      arrivalWindow === option
                        ? [styles.optionButtonText, styles.optionButtonTextSelected]
                        : styles.optionButtonText
                    }
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={isChaperone ? [styles.toggleButton, styles.toggleButtonSelected] : styles.toggleButton}
                onPress={() => setIsChaperone((prev) => !prev)}
              >
                <Text style={styles.toggleText}>I am a chaperone</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
              <Text style={styles.buttonText}>{submitting ? 'Submitting...' : 'Submit'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.keyboardAvoidingContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <Text style={styles.title}>Join Trip</Text>
          <Text style={styles.subtitle}>Enter the 6-digit trip code.</Text>
          <TextInput
            style={styles.input}
            placeholder="Trip Code"
            placeholderTextColor="#94A3B8"
            value={tripCode}
            onChangeText={setTripCode}
          />
          <TouchableOpacity style={styles.button} onPress={handleJoin} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Joining...' : 'Join Trip'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

function StaffScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [tripCode, setTripCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [tripInfo, setTripInfo] = useState<{ id: number; name: string; hotel_name: string; trip_code: string } | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [assignmentCounts, setAssignmentCounts] = useState(new Map() as AssignmentCountMap);
  const [guestCount, setGuestCount] = useState(null as number | null);

  const handleLogin = () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing credentials', 'Please enter email and password.');
      return;
    }
    setLoggedIn(true);
  };

  const loadTripDashboard = async () => {
    const code = tripCode.trim();
    if (!code) {
      Alert.alert('Missing code', 'Please enter a trip code.');
      return;
    }

    setLoading(true);
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, name, hotel_name, trip_code')
      .eq('trip_code', code)
      .maybeSingle();

    if (tripError) {
      setLoading(false);
      Alert.alert('Error', JSON.stringify(tripError));
      return;
    }

    if (!trip) {
      setLoading(false);
      Alert.alert('Trip not found', 'Trip not found - check your code');
      return;
    }

    const [{ data: roomsForTrip, error: roomError2 }, { data: assignmentsData, error: assignError }, { data: guestsForTrip, error: guestError2 }] = await Promise.all([
      supabase.from('rooms').select('id, room_number, room_type, capacity, school').eq('trip_id', trip.id).order('room_number', { ascending: true }),
      supabase.from('assignments').select('room_id').eq('trip_id', trip.id),
      supabase.from('guests').select('id').eq('trip_id', trip.id),
    ]);

    setLoading(false);

    if (roomError2 || assignError || guestError2) {
      Alert.alert('Error', JSON.stringify(roomError2 || assignError || guestError2));
      return;
    }

    const counts = new Map<number, number>();
    (assignmentsData ?? []).forEach((row) => {
      if (row.room_id) {
        counts.set(row.room_id, (counts.get(row.room_id) ?? 0) + 1);
      }
    });

    setTripInfo(trip);
    setRooms(roomsForTrip ?? []);
    setAssignmentCounts(counts);
    setGuestCount(guestsForTrip?.length ?? 0);
  };

  if (!loggedIn) {
    return (
      <KeyboardAvoidingView style={styles.keyboardAvoidingContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.container}>
            <Text style={styles.title}>Hotel Dashboard</Text>
            <Text style={styles.subtitle}>Sign in to manage hotel check-in.</Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#94A3B8"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity style={styles.button} onPress={handleLogin}>
              <Text style={styles.buttonText}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.keyboardAvoidingContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, styles.pageContent]}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Hotel Dashboard</Text>
          <Text style={styles.subtitle}>Search a trip by code and review room occupancy.</Text>
          <TextInput
            style={styles.input}
            placeholder="Trip Code"
            placeholderTextColor="#94A3B8"
            value={tripCode}
            onChangeText={setTripCode}
          />
          <TouchableOpacity style={styles.button} onPress={loadTripDashboard} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Load Trip'}</Text>
          </TouchableOpacity>
          {tripInfo ? (
            <View style={styles.roomList}>
              <Text style={styles.sectionTitle}>{`${tripInfo.name} - ${tripInfo.hotel_name}`}</Text>
              <Text style={styles.normalText}>{`Trip Code: ${tripInfo.trip_code}`}</Text>
              <Text style={styles.normalText}>{`Guest count: ${guestCount ?? 0}`}</Text>
              {rooms.map((room) => (
                <View key={room.id} style={styles.roomRow}>
                  <Text style={styles.guestName}>{room.room_number}</Text>
                  <Text style={styles.normalText}>{`${room.school} • ${room.room_type}`}</Text>
                  <Text style={styles.normalText}>{`Capacity ${room.capacity} • ${assignmentCounts.get(room.id) ?? 0} occupied`}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setLoggedIn(false)}>
            <Text style={styles.secondaryButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

export default function App() {
const [screen, setScreen] = useState<Screen>('home');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const role = session.user.user_metadata?.role;
        if (role === 'Advisor') setScreen('advisor');
        else if (role === 'Student') setScreen('student');
        else if (role === 'Hotel Staff') setScreen('staff');
      }
      setLoading(false);
    });

    // Listen for login/logout changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const role = session.user.user_metadata?.role;
        if (role === 'Advisor') setScreen('advisor');
        else if (role === 'Student') setScreen('student');
        else if (role === 'Hotel Staff') setScreen('staff');
      } else {
        setScreen('home');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;
  if (screen === 'advisor') {
    return <AdvisorScreen onBack={() => setScreen('home')} />;
  }

  if (screen === 'student') {
    return <StudentScreen onBack={() => setScreen('home')} />;
  }

  if (screen === 'staff') {
    return <StaffScreen onBack={() => setScreen('home')} />;
  }
if (screen === 'login') {
  return <LoginScreen navigation={{ navigate: (s: string) => setScreen(s as Screen) }} />;
}
if (screen === 'signup') {
  return <SignupScreen navigation={{ navigate: (s: string) => setScreen(s as Screen) }} />;
}
  return <HomeScreen onSelect={(selectedScreen) => {
  if (selectedScreen === 'advisor' || selectedScreen === 'staff') {
    setScreen('login' as Screen);
  } else {
    setScreen(selectedScreen);
  }
}} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: 60,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  keyboardAvoidingContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: '#1A56A0',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#333333',
    textAlign: 'center',
    marginBottom: 32,
  },
  buttonsContainer: {
    width: '100%',
  },
  button: {
    backgroundColor: '#1A56A0',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    width: '100%',
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    marginBottom: 16,
  },
  backButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  backText: {
    color: '#1A56A0',
    fontSize: 16,
    fontWeight: '600',
  },
  pageContent: {
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A56A0',
    marginTop: 24,
    marginBottom: 12,
  },
  roomManager: {
    marginTop: 24,
    width: '100%',
  },
  roomTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  roomTypeButton: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 12,
    marginRight: 8,
    alignItems: 'center',
  },
  roomTypeSelected: {
    backgroundColor: '#1A56A0',
  },
  roomTypeText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  roomTypeSelectedText: {
    color: '#ffffff',
  },
  roomList: {
    marginTop: 16,
    width: '100%',
  },
  roomRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  secondaryButton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryButtonText: {
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '600',
  },
  guestListContainer: {
    width: '100%',
    marginTop: 16,
  },
  guestListContent: {
    paddingBottom: 24,
  },
  assignmentPanel: {
    marginTop: 16,
    width: '100%',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  guestRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  guestName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  optionButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    marginRight: 8,
    alignItems: 'center',
  },
  optionButtonSelected: {
    backgroundColor: '#1A56A0',
  },
  optionButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  optionButtonTextSelected: {
    color: '#ffffff',
  },
  toggleRow: {
    marginBottom: 24,
  },
  toggleButton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  toggleButtonSelected: {
    backgroundColor: '#1A56A0',
  },
  toggleText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
  },
  bigText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  bigBlueText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1A56A0',
    textAlign: 'center',
    marginBottom: 16,
  },
  normalText: {
    fontSize: 16,
    color: '#333333',
    marginBottom: 8,
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A56A0',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  buttonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  gridButton: {
    width: '48%',
    backgroundColor: '#1A56A0',
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  gridButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  threadSelector: {
    maxHeight: 50,
    marginBottom: 16,
  },
  threadTab: {
    backgroundColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  threadTabSelected: {
    backgroundColor: '#1A56A0',
  },
  threadTabText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  threadTabTextSelected: {
    color: '#ffffff',
  },
  messagesContainer: {
    flex: 1,
    width: '100%',
  },
  messagesContent: {
    paddingBottom: 16,
  },
  messageRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  messageSender: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A56A0',
    marginBottom: 4,
  },
  messageContent: {
    fontSize: 16,
    color: '#111827',
    marginBottom: 4,
  },
  messageTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  messageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  messageInput: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: '#111827',
    marginRight: 8,
    maxHeight: 80,
  },
  sendButton: {
    backgroundColor: '#1A56A0',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
