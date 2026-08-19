import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '../../lib/theme';
import {
  HotelLocationInput,
  Org,
  Profile,
  claimChapter,
  claimHotel,
  fullAddress,
  joinTripAsStudent,
  listOrgs,
} from '../../lib/session';
import { Card, Field, PrimaryButton, SecondaryButton, SectionTitle } from '../../components/ui';

const ARRIVAL_WINDOWS = ['12-2 PM', '2-4 PM', '4-6 PM', '6-8 PM'];

/**
 * Shown once, right after signup: attach the account to the organization whose
 * data it is allowed to see. Every write here goes through a SECURITY DEFINER
 * function, so the client cannot point itself at another hotel or chapter.
 */
export default function OrgSetupScreen({
  profile,
  onDone,
  onSignOut,
}: {
  profile: Profile;
  onDone: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {profile.role === 'hotel_staff' && (
            <OrgPicker
              table="hotels"
              title="Select your property"
              blurb="You will only ever see rooms, guests and reservations for the hotel you join here."
              createLabel="Create a new property"
              namePlaceholder="Hotel name"
              busy={busy}
              setBusy={setBusy}
              onClaim={(name, code, location) => claimHotel(name, code, location)}
              onDone={onDone}
              withLocation
            />
          )}

          {profile.role === 'chapter_assignor' && (
            <OrgPicker
              table="chapters"
              title="Select your chapter"
              blurb="You will only see students and assignments belonging to this chapter."
              createLabel="Create a new chapter"
              namePlaceholder="Chapter name (e.g. Lincoln HS DECA)"
              busy={busy}
              setBusy={setBusy}
              onClaim={(name, code) => claimChapter(name, code)}
              onDone={onDone}
            />
          )}

          {profile.role === 'student' && (
            <StudentJoin profile={profile} busy={busy} setBusy={setBusy} onDone={onDone} />
          )}

          <SecondaryButton title="Sign out" onPress={onSignOut} style={{ marginTop: spacing.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function OrgPicker({
  table,
  title,
  blurb,
  createLabel,
  namePlaceholder,
  busy,
  setBusy,
  onClaim,
  onDone,
  withLocation,
}: {
  table: 'hotels' | 'chapters';
  title: string;
  blurb: string;
  createLabel: string;
  namePlaceholder: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onClaim: (name: string, code?: string, location?: HotelLocationInput) => Promise<string | null>;
  onDone: () => Promise<void>;
  /** Hotels capture an address so staff can see which site they're working in. */
  withLocation?: boolean;
}) {
  const { colors } = useTheme();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postal, setPostal] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    listOrgs(table).then(setOrgs);
  }, [table]);

  const join = async (orgName: string, code?: string) => {
    setBusy(true);
    const error = await onClaim(orgName, code, {
      address,
      city,
      region,
      postal_code: postal,
      phone,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Could not join', error);
      return;
    }
    await onDone();
  };

  return (
    <>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.blurb, { color: colors.textSecondary }]}>{blurb}</Text>

      {orgs.length > 0 && !creating && (
        <>
          <SectionTitle>Existing</SectionTitle>
          {orgs.map((org) => (
            <TouchableOpacity
              key={org.id}
              onPress={() => join(org.name, org.code)}
              disabled={busy}
              activeOpacity={0.75}
            >
              <Card style={{ marginBottom: spacing.sm }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{org.name}</Text>
                {withLocation && fullAddress(org) ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{fullAddress(org)}</Text>
                ) : null}
                <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 2 }}>Code {org.code}</Text>
              </Card>
            </TouchableOpacity>
          ))}
        </>
      )}

      {creating ? (
        <>
          <SectionTitle>New</SectionTitle>
          <Field placeholder={namePlaceholder} value={name} onChangeText={setName} autoCapitalize="words" />
          {withLocation ? (
            <>
              <Field placeholder="Street address" value={address} onChangeText={setAddress} autoCapitalize="words" />
              <Field placeholder="City" value={city} onChangeText={setCity} autoCapitalize="words" />
              <Field placeholder="State / region" value={region} onChangeText={setRegion} autoCapitalize="characters" />
              <Field placeholder="Postal code" value={postal} onChangeText={setPostal} />
              <Field placeholder="Front desk phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </>
          ) : null}
          <PrimaryButton
            title="Create and join"
            disabled={busy || !name.trim()}
            onPress={() => join(name.trim())}
          />
          <SecondaryButton title="Back to list" onPress={() => setCreating(false)} style={{ marginTop: spacing.sm }} />
        </>
      ) : (
        <SecondaryButton title={createLabel} onPress={() => setCreating(true)} style={{ marginTop: spacing.md }} />
      )}
    </>
  );
}

function StudentJoin({
  profile,
  busy,
  setBusy,
  onDone,
}: {
  profile: Profile;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onDone: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [tripCode, setTripCode] = useState('');
  const [legalName, setLegalName] = useState(profile.full_name ?? '');
  const [phone, setPhone] = useState('');
  const [school, setSchool] = useState('');
  const [arrival, setArrival] = useState<string>('');
  const [isChaperone, setIsChaperone] = useState(false);

  const submit = async () => {
    if (!tripCode.trim() || !legalName.trim()) {
      Alert.alert('Missing details', 'Enter your trip code and legal name.');
      return;
    }
    setBusy(true);
    const { error } = await joinTripAsStudent({
      tripCode: tripCode.trim(),
      legalName: legalName.trim(),
      email: profile.email ?? undefined,
      phone: phone.trim() || undefined,
      school: school.trim() || undefined,
      arrivalWindow: arrival || undefined,
      isChaperone,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Could not join trip', error);
      return;
    }
    await onDone();
  };

  return (
    <>
      <Text style={[styles.title, { color: colors.text }]}>Join your trip</Text>
      <Text style={[styles.blurb, { color: colors.textSecondary }]}>
        Enter the code from your chapter advisor. You will only see your own reservation and the people assigned to
        your room.
      </Text>

      <Field placeholder="Trip code" value={tripCode} onChangeText={setTripCode} autoCapitalize="characters" />
      <Field placeholder="Legal name (as on your ID)" value={legalName} onChangeText={setLegalName} autoCapitalize="words" />
      <Field placeholder="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field placeholder="School / chapter" value={school} onChangeText={setSchool} autoCapitalize="words" />

      <Text style={[styles.label, { color: colors.textSecondary }]}>ARRIVAL WINDOW</Text>
      <View style={styles.chipRow}>
        {ARRIVAL_WINDOWS.map((window) => {
          const selected = arrival === window;
          return (
            <TouchableOpacity
              key={window}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.tint : colors.neutralSoft,
                  borderColor: selected ? colors.tint : colors.border,
                },
              ]}
              onPress={() => setArrival(window)}
            >
              <Text style={{ color: selected ? colors.onTint : colors.text, fontWeight: '600', fontSize: 13 }}>
                {window}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.checkRow,
          { borderColor: isChaperone ? colors.tint : colors.border, backgroundColor: isChaperone ? colors.tintSoft : colors.surface },
        ]}
        onPress={() => setIsChaperone((v) => !v)}
        activeOpacity={0.8}
      >
        <View style={[styles.checkbox, { borderColor: isChaperone ? colors.tint : colors.border, backgroundColor: isChaperone ? colors.tint : 'transparent' }]} />
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>I am a chaperone</Text>
      </TouchableOpacity>

      <PrimaryButton title="Join trip" onPress={submit} disabled={busy} style={{ marginTop: spacing.lg }} />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, marginBottom: 6 },
  blurb: { fontSize: 15, lineHeight: 21, marginBottom: spacing.lg },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginTop: spacing.md, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2 },
});
