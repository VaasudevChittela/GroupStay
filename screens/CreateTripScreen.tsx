import { StatusBar } from 'expo-status-bar';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '../lib/alert';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
}

function DatePickerField({ label, date, onChange }: DatePickerFieldProps) {
  const [visible, setVisible] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(date || new Date());

  useEffect(() => {
    if (date) {
      setTempDate(date);
    }
  }, [date]);

  return (
    <>
      <Pressable style={styles.dateField} onPress={() => setVisible(true)}>
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
                <Text style={styles.modalActionText}>Cancel</Text>
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

export default function CreateTripScreen() {
  const [tripName, setTripName] = useState('');
  const [hotelName, setHotelName] = useState('');
  const [checkInDate, setCheckInDate] = useState<Date | null>(null);
  const [checkOutDate, setCheckOutDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreateTrip = async () => {
    if (!tripName || !hotelName || !checkInDate || !checkOutDate) {
      Alert.alert('Missing fields', 'Please fill in all trip details before creating the trip.');
      return;
    }

    const tripCode = generateTripCode();
    setLoading(true);
    const { error } = await supabase.from('trips').insert([
      {
        trip_name: tripName,
        hotel_name: hotelName,
        check_in: formatDate(checkInDate),
        check_out: formatDate(checkOutDate),
        trip_code: tripCode,
      },
    ]);
    setLoading(false);

    if (error) {
      Alert.alert('Create trip failed', error.message);
      return;
    }

    Alert.alert('Trip Created', `Your trip code is ${tripCode}. Share this with your students.`);
    setTripName('');
    setHotelName('');
    setCheckInDate(null);
    setCheckOutDate(null);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Trip</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Trip Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter trip name"
          placeholderTextColor="#94A3B8"
          value={tripName}
          onChangeText={setTripName}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Hotel Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter hotel name"
          placeholderTextColor="#94A3B8"
          value={hotelName}
          onChangeText={setHotelName}
        />
      </View>

      <DatePickerField label="Check-in date" date={checkInDate} onChange={setCheckInDate} />
      <DatePickerField label="Check-out date" date={checkOutDate} onChange={setCheckOutDate} />

      <Pressable style={styles.button} onPress={handleCreateTrip} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Trip'}</Text>
      </Pressable>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A56A0',
    marginBottom: 24,
    textAlign: 'center',
  },
  field: {
    marginBottom: 16,
  },
  label: {
    color: '#334155',
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  inputText: {
    color: '#64748B',
    fontSize: 16,
  },
  dateField: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  dateLabel: {
    color: '#334155',
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  dateValue: {
    color: '#0F172A',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#1A56A0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
  },
  modalLabel: {
    fontSize: 18,
    color: '#0F172A',
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalDate: {
    fontSize: 20,
    color: '#1A56A0',
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
    backgroundColor: '#E0E7FF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#1A56A0',
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
    backgroundColor: '#E2E8F0',
    marginRight: 8,
  },
  modalConfirm: {
    backgroundColor: '#1A56A0',
  },
  modalActionText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});