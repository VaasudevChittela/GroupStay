import { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { Guest, GUEST_DETAILS_COLUMNS } from '../lib/types';
import { BackButton, Page } from '../components/ui';
import { styles } from '../styles';
import { colors } from '../lib/theme';

// Emergency contact and medical notes. Only the student, their advisors, and their trip's
// chaperones can see these; the hotel and other students can't.
export default function MyInfoScreen({ me, onBack }: { me: Guest; onBack: () => void }) {
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [medical, setMedical] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('guest_details')
      .select(GUEST_DETAILS_COLUMNS)
      .eq('guest_id', me.id)
      .maybeSingle()
      .then(({ data }) => {
        setName(data?.emergency_name ?? '');
        setRelationship(data?.emergency_relationship ?? '');
        setPhone(data?.emergency_phone ?? '');
        setMedical(data?.medical_notes ?? '');
        setParentEmail(data?.parent_email ?? '');
        setLoading(false);
      });
  }, [me.id]);

  const save = async () => {
    if (!name.trim() || !phone.trim()) {
      showAlert('Emergency contact needed', 'Add a name and phone number for someone we can call in an emergency.');
      return;
    }
    const parent = parentEmail.trim().toLowerCase();
    if (parent && !/^\S+@\S+\.\S+$/.test(parent)) {
      showAlert('Check the parent email', 'Enter a valid email address, or leave it blank.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('guest_details').upsert(
      [
        {
          guest_id: me.id,
          trip_id: me.trip_id,
          emergency_name: name.trim(),
          emergency_relationship: relationship.trim() || null,
          emergency_phone: phone.trim(),
          medical_notes: medical.trim() || null,
          parent_email: parent || null,
        },
      ],
      { onConflict: 'guest_id' },
    );
    setSaving(false);
    if (error) {
      showAlert('Could not save', errorMessage(error));
      return;
    }
    showAlert('Saved', 'Your advisors and chaperones can see this if they need it.');
    onBack();
  };

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>My Info</Text>
      <Text style={styles.pageSubtitle}>Only your advisors and chaperones can see this. The hotel and other students can't.</Text>
      {loading ? (
        <Text style={styles.normalText}>Loading...</Text>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Emergency contact</Text>
            <TextInput style={styles.input} placeholder="Name" placeholderTextColor={colors.faint} value={name} onChangeText={setName} />
            <TextInput
              style={styles.input}
              placeholder="Relationship (e.g. Mother)"
              placeholderTextColor={colors.faint}
              value={relationship}
              onChangeText={setRelationship}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor={colors.faint}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Medical notes (optional)</Text>
            <Text style={styles.mutedText}>Allergies, medications, or anything a chaperone should know.</Text>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
              placeholder="e.g. Peanut allergy, carries an EpiPen"
              placeholderTextColor={colors.faint}
              multiline
              value={medical}
              onChangeText={setMedical}
            />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Parent or guardian</Text>
            <Text style={styles.mutedText}>They can log in with this email to follow your trip and sign your permission slip.</Text>
            <TextInput
              style={styles.input}
              placeholder="parent@email.com"
              placeholderTextColor={colors.faint}
              keyboardType="email-address"
              autoCapitalize="none"
              value={parentEmail}
              onChangeText={setParentEmail}
            />
          </View>
          <TouchableOpacity style={styles.button} onPress={save} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </>
      )}
    </Page>
  );
}
