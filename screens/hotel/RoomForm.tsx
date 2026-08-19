import React, { useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '../../lib/theme';
import {
  HotelRoom,
  ROOM_STATUSES,
  ROOM_STATUS_META,
  ROOM_TYPES,
  ROOM_TYPE_DEFAULT_CAPACITY,
  RoomStatus,
  RoomType,
  TripSummary,
} from '../../lib/hotelTypes';
import { createRoom, updateRoom } from '../../lib/hotel';
import { pickAndUploadRoomPhoto } from '../../lib/storage';
import { ChipSelect, Field, PrimaryButton, SecondaryButton, statusColors } from '../../components/ui';
import { PlusIcon } from '../../components/icons';

/**
 * Add or edit a room. Picking a room type (Double, Quadruple, …) pre-fills
 * a sensible max-guest count, which staff can still override.
 */
export default function RoomForm({
  trip,
  room,
  existingRooms = [],
  onClose,
  onSaved,
}: {
  trip: TripSummary;
  room: HotelRoom | null; // null = adding new
  /** Rooms already in this block, used to reject a duplicate room number. */
  existingRooms?: { id: string; room_number: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const editing = room != null;

  const initialType = (ROOM_TYPES as readonly string[]).includes(room?.room_type ?? '')
    ? (room!.room_type as RoomType)
    : room
      ? 'Custom'
      : null;

  const [roomNumber, setRoomNumber] = useState(room?.room_number ?? '');
  const [roomType, setRoomType] = useState<RoomType | null>(initialType);
  const [customType, setCustomType] = useState(initialType === 'Custom' ? room?.room_type ?? '' : '');
  const [maxGuests, setMaxGuests] = useState(String(room?.max_guests ?? room?.capacity ?? ''));
  const [floor, setFloor] = useState(room?.floor ?? '');
  const [school, setSchool] = useState(room?.school ?? '');
  const [notes, setNotes] = useState(room?.notes ?? '');
  const [status, setStatus] = useState<RoomStatus>(room?.status ?? 'available');
  const [photos, setPhotos] = useState<string[]>(room?.photos ?? []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const chooseType = (type: RoomType) => {
    setRoomType(type);
    // Pre-fill max guests from the bed setup; staff can still override it.
    if (type !== 'Custom') setMaxGuests(String(ROOM_TYPE_DEFAULT_CAPACITY[type]));
  };

  const addPhoto = async () => {
    setUploading(true);
    const { url, error } = await pickAndUploadRoomPhoto(trip.id);
    setUploading(false);
    if (error) Alert.alert('Photo upload', error);
    if (url) setPhotos((prev) => [...prev, url]);
  };

  const handleSave = async () => {
    if (!roomNumber.trim()) {
      Alert.alert('Missing info', 'Please enter a room number.');
      return;
    }
    if (!roomType) {
      Alert.alert('Missing info', 'Please choose a room type — e.g. Double or Quadruple.');
      return;
    }
    const resolvedType = roomType === 'Custom' ? customType.trim() : roomType;
    if (!resolvedType) {
      Alert.alert('Missing info', 'Please describe the custom room type.');
      return;
    }
    const duplicate = existingRooms.find(
      (r) => r.id !== room?.id && r.room_number.trim().toLowerCase() === roomNumber.trim().toLowerCase(),
    );
    if (duplicate) {
      Alert.alert('Duplicate room', `Room ${roomNumber.trim()} is already in this block.`);
      return;
    }

    const guests = Number(maxGuests);
    if (!Number.isInteger(guests) || guests <= 0) {
      Alert.alert('Invalid capacity', 'Max guests must be a positive whole number.');
      return;
    }

    setSaving(true);
    const payload = {
      room_number: roomNumber.trim(),
      room_type: resolvedType,
      capacity: guests,
      max_guests: guests,
      floor: floor.trim() || null,
      school: school.trim() || '',
      notes: notes.trim() || null,
      photos,
      status,
    };
    const result = editing ? await updateRoom(room!.id, payload) : await createRoom(trip.id, payload);
    setSaving(false);

    if (result.error) {
      Alert.alert('Error', result.error);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: colors.tint, fontSize: 16, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.title, { color: colors.text }]}>{editing ? `Edit Room ${room!.room_number}` : 'Add Room'}</Text>
              <View style={{ width: 52 }} />
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>ROOM NUMBER</Text>
            <Field placeholder="e.g. 204" value={roomNumber} onChangeText={setRoomNumber} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>ROOM TYPE — WHAT KIND OF BEDS?</Text>
            <ChipSelect options={ROOM_TYPES} value={roomType} onChange={chooseType} />
            {roomType === 'Custom' && (
              <Field placeholder="Describe the room (e.g. 2 Twin + Sofa Bed)" value={customType} onChangeText={setCustomType} />
            )}

            <Text style={[styles.label, { color: colors.textSecondary }]}>MAX GUESTS</Text>
            <Field placeholder="e.g. 4" value={maxGuests} onChangeText={setMaxGuests} keyboardType="numeric" />

            <Text style={[styles.label, { color: colors.textSecondary }]}>FLOOR (OPTIONAL)</Text>
            <Field placeholder="e.g. 2" value={floor} onChangeText={setFloor} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>RESERVED FOR SCHOOL / GROUP (OPTIONAL)</Text>
            <Field placeholder="e.g. Lincoln High DECA" value={school} onChangeText={setSchool} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>NOTES (OPTIONAL)</Text>
            <Field placeholder="e.g. Near elevator, connects to 206" value={notes} onChangeText={setNotes} multiline />

            <Text style={[styles.label, { color: colors.textSecondary }]}>STATUS</Text>
            <ChipSelect
              options={ROOM_STATUSES}
              value={status}
              onChange={setStatus}
              labels={Object.fromEntries(
                ROOM_STATUSES.map((s) => [s, ROOM_STATUS_META[s].label]),
              ) as Record<RoomStatus, string>}
              dots={Object.fromEntries(
                ROOM_STATUSES.map((s) => [s, statusColors(colors, s).fg]),
              ) as Record<RoomStatus, string>}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>PHOTOS</Text>
            <View style={styles.photoRow}>
              {photos.map((url) => (
                <View key={url}>
                  <Image source={{ uri: url }} style={styles.photo} />
                  <TouchableOpacity
                    style={[styles.photoRemove, { backgroundColor: colors.danger }]}
                    onPress={() => setPhotos((prev) => prev.filter((p) => p !== url))}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.addPhoto, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={addPhoto}
                disabled={uploading}
              >
                {uploading ? (
                  <Text style={{ fontSize: 20, color: colors.textTertiary }}>…</Text>
                ) : (
                  <PlusIcon size={22} color={colors.textTertiary} />
                )}
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary }}>
                  {uploading ? 'Uploading' : 'Add photo'}
                </Text>
              </TouchableOpacity>
            </View>

            <PrimaryButton
              title={saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Room'}
              onPress={handleSave}
              disabled={saving}
              style={{ marginTop: spacing.lg }}
            />
            <SecondaryButton title="Cancel" onPress={onClose} style={{ marginTop: spacing.sm }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  photo: { width: 84, height: 63, borderRadius: radius.sm },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    width: 84,
    height: 63,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
