import { useEffect, useState } from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { confirmAction, errorMessage, showAlert } from '../lib/alert';
import { notifyGuests } from '../lib/notify';
import { formatDeadline } from '../lib/format';
import { DEFAULT_SLIP_TEXT, CoAdvisor, Profile, Trip, TRIP_COLUMNS } from '../lib/types';
import { BackButton, Page, SmallButton } from '../components/ui';
import { styles } from '../styles';
import { colors } from '../lib/theme';


// Deadline picker starts at 9 PM, three days before check-in.
function defaultDeadline(trip: Trip) {
  const base = trip.check_in ? new Date(`${trip.check_in}T21:00:00`) : new Date();
  base.setDate(base.getDate() - 3);
  return base;
}

export default function TripSettingsScreen({ trip: initialTrip, profile, onBack }: { trip: Trip; profile: Profile; onBack: () => void }) {
  const [trip, setTrip] = useState(initialTrip);
  const [deadline, setDeadline] = useState<Date>(initialTrip.lock_deadline ? new Date(initialTrip.lock_deadline) : defaultDeadline(initialTrip));
  const [hotelEmail, setHotelEmail] = useState(initialTrip.hotel_email ?? '');
  const [slipText, setSlipText] = useState(initialTrip.permission_slip_text ?? DEFAULT_SLIP_TEXT);
  const [team, setTeam] = useState<CoAdvisor[]>([]);
  const [newAdvisor, setNewAdvisor] = useState('');
  const [busy, setBusy] = useState(false);
  const isOwner = trip.advisor_id === profile.id;

  const load = async () => {
    const [{ data: tripRow }, { data: teamRows }] = await Promise.all([
      supabase.from('trips').select(TRIP_COLUMNS).eq('id', initialTrip.id).maybeSingle(),
      supabase.from('trip_advisors').select('id, trip_id, email, created_at').eq('trip_id', initialTrip.id).order('created_at', { ascending: true }),
    ]);
    if (tripRow) setTrip(tripRow as Trip);
    setTeam((teamRows ?? []) as CoAdvisor[]);
  };

  useEffect(() => {
    load();
  }, []);

  const update = async (values: Partial<Trip>) => {
    setBusy(true);
    const { error } = await supabase.from('trips').update(values).eq('id', trip.id);
    setBusy(false);
    if (error) {
      showAlert('Could not save', errorMessage(error));
      return false;
    }
    await load();
    return true;
  };

  const toggleChaperones = async (separate: boolean) => {
    if (separate) {
      // Warn if rooms already mix chaperones and students.
      const [{ data: guests }, { data: assignments }] = await Promise.all([
        supabase.from('guests').select('id, is_chaperone').eq('trip_id', trip.id),
        supabase.from('assignments').select('guest_id, room_id').eq('trip_id', trip.id),
      ]);
      const chaperone = new Map((guests ?? []).map((g) => [g.id, g.is_chaperone]));
      const kinds = new Map<number, Set<boolean>>();
      (assignments ?? []).forEach((a) => kinds.set(a.room_id, (kinds.get(a.room_id) ?? new Set()).add(Boolean(chaperone.get(a.guest_id)))));
      const mixed = [...kinds.values()].filter((set) => set.size > 1).length;
      if (mixed && !(await confirmAction('Some rooms are mixed', `${mixed} room${mixed === 1 ? ' has' : 's have'} both chaperones and students. The rule only applies to new room changes; move people in Assign Rooms to fix them.`, 'Turn On'))) {
        return;
      }
    }
    await update({ separate_chaperones: separate });
  };

  const stepDeadline = (days: number, minutes: number) =>
    setDeadline((prev) => new Date(prev.getTime() + days * 86400000 + minutes * 60000));

  const saveDeadline = async () => {
    if (deadline.getTime() <= Date.now()) {
      showAlert('Pick a future time', 'The deadline has to be in the future.');
      return;
    }
    if (await update({ lock_deadline: deadline.toISOString() })) {
      const { data: guests } = await supabase.from('guests').select('id').eq('trip_id', trip.id);
      await notifyGuests(trip.id, (guests ?? []).map((g) => g.id), 'Room-pick deadline', `Pick your room by ${formatDeadline(deadline.toISOString())}. Rooms lock automatically after that.`, 'rooms');
      showAlert('Deadline set', `Rooms lock automatically ${formatDeadline(deadline.toISOString())}, and students were told.`);
    }
  };

  const saveSlipText = async () => {
    if (await update({ permission_slip_text: slipText.trim() || null })) {
      showAlert('Saved', 'Parents will see this text when they sign.');
    }
  };

  const saveHotelEmail = async () => {
    if (await update({ hotel_email: hotelEmail.trim().toLowerCase() || null })) {
      showAlert('Saved', 'Hotel staff who log in with this email will see the trip.');
    }
  };

  const addAdvisor = async () => {
    const email = newAdvisor.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      showAlert('Check the email', 'Enter the co-advisor’s email address.');
      return;
    }
    if (team.some((a) => a.email.toLowerCase() === email) || email === profile.email.toLowerCase()) {
      showAlert('Already on the team', `${email} can already manage this trip.`);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('trip_advisors').insert([{ trip_id: trip.id, email }]);
    setBusy(false);
    if (error) {
      showAlert('Could not add', errorMessage(error));
      return;
    }
    setNewAdvisor('');
    showAlert('Co-advisor added', `When ${email} logs in as an advisor, this trip shows up under My Trips.`);
    await load();
  };

  const removeAdvisor = async (advisor: CoAdvisor) => {
    if (!(await confirmAction('Remove co-advisor?', `${advisor.email} won't be able to see or manage this trip.`, 'Remove'))) return;
    await supabase.from('trip_advisors').delete().eq('id', advisor.id);
    await load();
  };

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Trip Settings</Text>
      <Text style={styles.pageSubtitle}>{trip.name}</Text>

      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Chaperones room separately</Text>
            <Text style={styles.mutedText}>When on, chaperones only share rooms with other chaperones, never with students.</Text>
          </View>
          <Switch value={trip.separate_chaperones} onValueChange={toggleChaperones} disabled={busy} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Room-pick deadline</Text>
        <Text style={styles.mutedText}>
          {trip.locked_at
            ? 'Rooms are already locked.'
            : trip.lock_deadline
              ? `Rooms lock automatically ${formatDeadline(trip.lock_deadline)} and the manifest goes to the hotel.`
              : 'Set a time and rooms lock automatically, even if you forget.'}
        </Text>
        {!trip.locked_at && (
          <>
            <Text style={[styles.bigBlueText, { fontSize: 22, marginTop: 8 }]}>{formatDeadline(deadline.toISOString())}</Text>
            <View style={[styles.actionRow, { justifyContent: 'center', marginBottom: 12 }]}>
              <SmallButton text="− Day" secondary onPress={() => stepDeadline(-1, 0)} />
              <SmallButton text="+ Day" secondary onPress={() => stepDeadline(1, 0)} />
              <SmallButton text="− 1 hr" secondary onPress={() => stepDeadline(0, -60)} />
              <SmallButton text="+ 1 hr" secondary onPress={() => stepDeadline(0, 60)} />
            </View>
            <TouchableOpacity style={styles.button} onPress={saveDeadline} disabled={busy}>
              <Text style={styles.buttonText}>{trip.lock_deadline ? 'Update Deadline' : 'Set Deadline'}</Text>
            </TouchableOpacity>
            {trip.lock_deadline && (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => update({ lock_deadline: null })} disabled={busy}>
                <Text style={styles.secondaryButtonText}>Remove Deadline</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Permission slip</Text>
        <Text style={styles.mutedText}>Parents read this and sign with their name in the app. You can see who signed on the Roster.</Text>
        <TextInput
          style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
          multiline
          value={slipText}
          onChangeText={setSlipText}
          placeholderTextColor={colors.faint}
        />
        {slipText.trim() !== (trip.permission_slip_text ?? DEFAULT_SLIP_TEXT) && (
          <TouchableOpacity style={styles.button} onPress={saveSlipText} disabled={busy}>
            <Text style={styles.buttonText}>Save Slip Text</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hotel contact email</Text>
        <Text style={styles.mutedText}>Hotel staff who log in with this email see the trip, the manifest, and arrival time.</Text>
        <TextInput
          style={styles.input}
          placeholder="frontdesk@hotel.com"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          keyboardType="email-address"
          value={hotelEmail}
          onChangeText={setHotelEmail}
        />
        {hotelEmail.trim().toLowerCase() !== (trip.hotel_email ?? '') && (
          <TouchableOpacity style={styles.button} onPress={saveHotelEmail} disabled={busy}>
            <Text style={styles.buttonText}>Save Hotel Email</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Advisors</Text>
        <Text style={styles.cardText}>{isOwner ? `• You (${profile.email}), trip owner` : '• Trip owner'}</Text>
        {team.map((advisor) => (
          <View key={advisor.id} style={[styles.rowBetween, { marginBottom: 6 }]}>
            <Text style={[styles.cardText, { flex: 1 }]}>{`• ${advisor.email}${advisor.email.toLowerCase() === profile.email.toLowerCase() ? ' (you)' : ''}`}</Text>
            {isOwner && <SmallButton text="Remove" secondary onPress={() => removeAdvisor(advisor)} />}
          </View>
        ))}
        {isOwner ? (
          <>
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Co-advisor's email"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              keyboardType="email-address"
              value={newAdvisor}
              onChangeText={setNewAdvisor}
            />
            <TouchableOpacity style={styles.button} onPress={addAdvisor} disabled={busy}>
              <Text style={styles.buttonText}>Add Co-Advisor</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.mutedText}>Only the trip owner can add or remove advisors.</Text>
        )}
      </View>
    </Page>
  );
}
