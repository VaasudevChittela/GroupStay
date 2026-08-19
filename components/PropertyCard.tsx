import React, { useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../lib/alert';
import { radius, spacing, useTheme } from '../lib/theme';
import { Org, fullAddress, updateHotelLocation } from '../lib/session';
import { Card, Field, PrimaryButton, SecondaryButton } from './ui';
import { BuildingIcon } from './icons';

/**
 * Which property am I working in? Chains run several sites and a group block
 * can move between them, so staff get the name, full address and front desk
 * number up front — and can correct them without leaving the dashboard.
 */
export default function PropertyCard({
  hotel,
  onUpdated,
}: {
  hotel: Org;
  onUpdated?: () => Promise<void> | void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [address, setAddress] = useState(hotel.address ?? '');
  const [city, setCity] = useState(hotel.city ?? '');
  const [region, setRegion] = useState(hotel.region ?? '');
  const [postal, setPostal] = useState(hotel.postal_code ?? '');
  const [phone, setPhone] = useState(hotel.phone ?? '');

  const location = fullAddress(hotel);

  const save = async () => {
    setBusy(true);
    const error = await updateHotelLocation(hotel.id, {
      address,
      city,
      region,
      postal_code: postal,
      phone,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Could not save', error);
      return;
    }
    setEditing(false);
    await onUpdated?.();
  };

  if (editing) {
    return (
      <Card style={{ marginBottom: spacing.md }}>
        <Text style={[styles.label, { color: colors.textTertiary }]}>PROPERTY DETAILS</Text>
        <Field placeholder="Street address" value={address} onChangeText={setAddress} autoCapitalize="words" />
        <Field placeholder="City" value={city} onChangeText={setCity} autoCapitalize="words" />
        <Field placeholder="State / region" value={region} onChangeText={setRegion} autoCapitalize="characters" />
        <Field placeholder="Postal code" value={postal} onChangeText={setPostal} />
        <Field placeholder="Front desk phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <PrimaryButton title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />
        <SecondaryButton title="Cancel" onPress={() => setEditing(false)} style={{ marginTop: spacing.sm }} />
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: colors.tintSoft }]}>
          <BuildingIcon size={20} color={colors.tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]}>{hotel.name}</Text>
          <Text style={[styles.line, { color: colors.textSecondary }]}>
            {location ?? 'No address on file yet'}
          </Text>
          {hotel.phone ? (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${hotel.phone}`)}>
              <Text style={[styles.line, { color: colors.tint, fontWeight: '700' }]}>{hotel.phone}</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.code, { color: colors.textTertiary }]}>Property code {hotel.code}</Text>
        </View>
        <TouchableOpacity onPress={() => setEditing(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 14 }}>Edit</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  badge: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  line: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  code: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: spacing.md },
});
