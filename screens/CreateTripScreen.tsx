import { StatusBar } from 'expo-status-bar';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { notify } from '../lib/notify';
import { Profile, Trip, TRIP_COLUMNS } from '../lib/types';
import { colors, fs, themed } from '../lib/theme';
import HotelSearch, { HotelChoice } from '../components/HotelSearch';


const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const adjustDate = (date: Date, amount: number, unit: 'day' | 'month' | 'year') => {
  const next = new Date(date);
  if (unit === 'day') {
    next.setDate(next.getDate() + amount);
  } else if (unit === 'month') {
    next.setMonth(next.getMonth() + amount);
  } else {
    next.setFullYear(next.getFullYear() + amount);
  }
  return next;
};

const generateTripCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

interface DatePickerFieldProps {
  label: string;
  date: Date | null;
  onChange: (date: Date) => void;
  startFrom?: Date | null;
}

function DatePickerField({ label, date, onChange, startFrom }: DatePickerFieldProps) {
  const styles = getStyles();
  const [visible, setVisible] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(date || new Date());

  useEffect(() => {
    if (date) {
      setTempDate(date);
    }
  }, [date]);

  return (
    <>
      <Pressable
        style={styles.dateField}
        onPress={() => {
          if (!date && startFrom) setTempDate(adjustDate(startFrom, 1, 'day'));
          setVisible(true);
        }}
      >
        <Text style={styles.dateLabel}>{label}</Text>
        <Text style={styles.dateValue}>{date ? formatDate(date) : 'Select date'}</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalLabel}>{label}</Text>
            <Text style={styles.modalDate}>{formatDate(tempDate)}</Text>

            <View style={styles.modalRow}>
              <Pressable style={styles.modalButton} onPress={() => setTempDate((prev) => adjustDate(prev, -1, 'day'))}>
                <Text style={styles.modalButtonText}>- Day</Text>
              </Pressable>
              <Pressable style={styles.modalButton} onPress={() => setTempDate((prev) => adjustDate(prev, 1, 'day'))}>
                <Text style={styles.modalButtonText}>+ Day</Text>
              </Pressable>
            </View>
            <View style={styles.modalRow}>
              <Pressable style={styles.modalButton} onPress={() => setTempDate((prev) => adjustDate(prev, -1, 'month'))}>
                <Text style={styles.modalButtonText}>- Month</Text>
              </Pressable>
              <Pressable style={styles.modalButton} onPress={() => setTempDate((prev) => adjustDate(prev, 1, 'month'))}>
                <Text style={styles.modalButtonText}>+ Month</Text>
              </Pressable>
            </View>
            <View style={styles.modalRow}>
              <Pressable style={styles.modalButton} onPress={() => setTempDate((prev) => adjustDate(prev, -1, 'year'))}>
                <Text style={styles.modalButtonText}>- Year</Text>
              </Pressable>
              <Pressable style={styles.modalButton} onPress={() => setTempDate((prev) => adjustDate(prev, 1, 'year'))}>
                <Text style={styles.modalButtonText}>+ Year</Text>
              </Pressable>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalActionButton, styles.modalCancel]} onPress={() => setVisible(false)}>
                <Text style={[styles.modalActionText, styles.modalCancelText]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalActionButton, styles.modalConfirm]}
                onPress={() => {
                  onChange(tempDate);
                  setVisible(false);
                }}
              >
                <Text style={styles.modalActionText}>Set Date</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

interface CreateTripScreenProps {
  profile: Profile;
  onBack?: () => void;
  onTripCreated?: (trip: Trip) => void;
}

export default function CreateTripScreen({ profile, onBack, onTripCreated }: CreateTripScreenProps) {
  const styles = getStyles();
  const [tripName, setTripName] = useState('');
  const [hotel, setHotel] = useState<HotelChoice | null>(null);
  const [hotelEmail, setHotelEmail] = useState('');
  const [school, setSchool] = useState(profile.school);
  const [headcount, setHeadcount] = useState('');
  const [checkInDate, setCheckInDate] = useState<Date | null>(null);
  const [checkOutDate, setCheckOutDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreateTrip = async () => {
    const count = Number(headcount);
    if (!tripName.trim() || !hotel || !school.trim() || !checkInDate || !checkOutDate) {
      showAlert('Missing fields', 'Please fill in the trip name, pick a hotel, and add the school and dates.');
      return;
    }
    if (!count || count <= 0) {
      showAlert('Missing headcount', 'Enter how many people are going.');
      return;
    }
    if (checkOutDate < checkInDate) {
      showAlert('Check your dates', 'Check-out must be after check-in.');
      return;
    }

    setLoading(true);
    // Retry a few times in the unlikely case the random code is already taken.
    let data: Trip | null = null;
    let error: unknown = null;
    for (let attempt = 0; attempt < 3 && !data; attempt++) {
      const result = await supabase.from('trips').insert([
        {
          name: tripName.trim(),
          hotel_name: hotel.name,
          hotel_address: hotel.address || null,
          hotel_email: hotelEmail.trim().toLowerCase() || null,
          school: school.trim(),
          headcount: count,
          check_in: formatDate(checkInDate),
          check_out: formatDate(checkOutDate),
          trip_code: generateTripCode(),
          advisor_id: profile.id,
          status: 'active',
        },
      ]).select(TRIP_COLUMNS).single();
      data = result.data as Trip | null;
      error = result.error;
      if (result.error && (result.error as { code?: string }).code !== '23505') break;
    }
    setLoading(false);

    if (error || !data) {
      showAlert('Create trip failed', errorMessage(error ?? 'Unable to create trip.'));
      return;
    }

    // Tell the hotel. Staff whose login email matches hotel_email see this trip on their dashboard.
    await notify(
      data.id,
      'staff',
      'New trip booked',
      `${data.school} – ${data.name} (${count} guests, ${data.check_in} to ${data.check_out}). Please add your room inventory.`,
    );

    showAlert('Trip Created', `Your trip code is ${data.trip_code}. Share it with your ${data.school} students.`);
    setTripName('');
    setHotel(null);
    setHotelEmail('');
    setHeadcount('');
    setCheckInDate(null);
    setCheckOutDate(null);
    onTripCreated?.(data);
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {onBack && (
        <Pressable style={styles.topBackButton} onPress={onBack}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
      )}
      <Text style={styles.title}>Create Trip</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Trip Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter trip name"
          placeholderTextColor={colors.faint}
          value={tripName}
          onChangeText={setTripName}
        />
      </View>

      <View style={[styles.field, styles.autocompleteField]}>
        <Text style={styles.label}>Hotel</Text>
        <HotelSearch value={hotel} onChange={setHotel} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Hotel contact email (they get notified)</Text>
        <TextInput
          style={styles.input}
          placeholder="frontdesk@hotel.com"
          placeholderTextColor={colors.faint}
          keyboardType="email-address"
          autoCapitalize="none"
          value={hotelEmail}
          onChangeText={setHotelEmail}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>School (this trip's code only works for this school)</Text>
        <TextInput
          style={styles.input}
          placeholder="School name"
          placeholderTextColor={colors.faint}
          value={school}
          onChangeText={setSchool}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Headcount</Text>
        <TextInput
          style={styles.input}
          placeholder="How many people are going"
          placeholderTextColor={colors.faint}
          keyboardType="numeric"
          value={headcount}
          onChangeText={setHeadcount}
        />
      </View>

      <DatePickerField label="Check-in date" date={checkInDate} onChange={setCheckInDate} />
      <DatePickerField label="Check-out date" date={checkOutDate} onChange={setCheckOutDate} startFrom={checkInDate} />

      <Pressable style={styles.button} onPress={handleCreateTrip} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Trip'}</Text>
      </Pressable>

      {onBack && (
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      )}

      <StatusBar style="auto" />
    </ScrollView>
  );
}

const getStyles = themed(() =>
  StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 40,
    backgroundColor: colors.bg,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  topBackButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    marginBottom: 8,
  },
  title: {
    fontSize: fs(30),
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  field: {
    marginBottom: 16,
  },
  autocompleteField: {
    zIndex: 10,
  },
  autocompleteContainer: {
    flex: 0,
  },
  autocompleteList: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
  },
  autocompleteRow: {
    padding: 13,
    minHeight: 44,
  },
  autocompleteDescription: {
    color: colors.text,
  },
  label: {
    color: colors.text,
    marginBottom: 8,
    fontSize: fs(14),
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  inputText: {
    color: colors.muted,
    fontSize: fs(16),
  },
  dateField: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  dateLabel: {
    color: colors.text,
    marginBottom: 8,
    fontSize: fs(14),
    fontWeight: '600',
  },
  dateValue: {
    color: colors.ink,
    fontSize: fs(16),
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#0B1220',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  buttonText: {
    color: colors.white,
    fontSize: fs(16),
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
  },
  modalLabel: {
    fontSize: fs(18),
    color: colors.ink,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalDate: {
    fontSize: fs(20),
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  modalButton: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalActionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancel: {
    backgroundColor: colors.cardAlt,
    marginRight: 8,
  },
  modalConfirm: {
    backgroundColor: colors.primary,
  },
  modalActionText: {
    color: colors.white,
    fontWeight: '700',
  },
  modalCancelText: {
    color: colors.ink,
  },
  backButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  backText: {
    color: colors.primary,
    fontSize: fs(16),
    fontWeight: '600',
  },
}),
);
