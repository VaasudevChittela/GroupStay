import { useState } from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { notify } from '../lib/notify';
import { formatDateRange } from '../lib/format';
import { colors } from '../lib/theme';
import { DEFAULT_SLIP_TEXT, Guest, PermissionSlip, Profile, Trip } from '../lib/types';
import { BackButton, Badge, Page } from '../components/ui';
import { styles } from '../styles';

// Digital permission slip: the parent reads the advisor's text, types their full name, and signs.
export default function PermissionSlipScreen({
  child,
  trip,
  slip,
  parent,
  onBack,
}: {
  child: Guest;
  trip: Trip;
  slip: PermissionSlip | null;
  parent: Profile;
  onBack: () => void;
}) {
  const [name, setName] = useState(parent.full_name);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const sign = async () => {
    if (!name.trim() || !agreed) {
      showAlert('Almost there', 'Type your full name and confirm you are the parent or legal guardian.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('permission_slips')
      .insert([{ guest_id: child.id, trip_id: trip.id, signed_name: name.trim(), signed_email: parent.email }]);
    setSaving(false);
    if (error) {
      showAlert('Could not sign', errorMessage(error));
      return;
    }
    await notify(trip.id, 'advisor', 'Permission slip signed', `${name.trim()} signed for ${child.legal_name}.`, null, 'roster');
    showAlert('Signed', `Thanks! ${child.legal_name}'s advisor can see the signed slip.`);
    onBack();
  };

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Permission Slip</Text>
      <Text style={styles.pageSubtitle}>{`${child.legal_name} · ${trip.name}\n${trip.hotel_name} · ${formatDateRange(trip.check_in, trip.check_out)}`}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Agreement</Text>
        <Text style={styles.cardText}>{trip.permission_slip_text || DEFAULT_SLIP_TEXT}</Text>
      </View>

      {slip ? (
        <View style={styles.card}>
          <Badge text="Signed" tone="green" />
          <Text style={styles.cardText}>{`Signed by ${slip.signed_name} (${slip.signed_email})`}</Text>
          <Text style={styles.mutedText}>{new Date(slip.signed_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Sign with your full name</Text>
          <TextInput style={styles.input} placeholder="Full legal name" placeholderTextColor={colors.faint} value={name} onChangeText={setName} />
          <View style={[styles.switchRow, { marginBottom: 14 }]}>
            <Text style={[styles.cardText, { flex: 1 }]}>{`I am ${child.legal_name}'s parent or legal guardian and I agree to the above.`}</Text>
            <Switch value={agreed} onValueChange={setAgreed} />
          </View>
          <TouchableOpacity style={styles.button} onPress={sign} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? 'Signing...' : 'Sign Permission Slip'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </Page>
  );
}
