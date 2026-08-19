import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../lib/alert';
import QRCode from 'react-native-qrcode-svg';
import { radius, spacing, useTheme } from '../lib/theme';
import { DigitalKey } from '../lib/hotelTypes';
import { buildKeyPayload, isKeyCurrentlyValid } from '../lib/keys';
import { formatDate } from '../lib/hotel';
import { NfcCapability, getNfcCapability, presentKeyOverNfc } from '../lib/nfc';
import {
  WalletPassContext,
  addToAppleWallet,
  addToGoogleWallet,
  preferredWallet,
} from '../lib/wallet';

/**
 * The e-room key: styled like an airline boarding pass. Dark ticket body,
 * perforated divider, QR credential, and Apple/Google Wallet actions.
 * Works offline once rendered — the QR payload is embedded in the key itself.
 */
export default function KeyCard({
  keyData,
  hotelName,
  guestName,
  roomNumber,
  confirmation,
  checkIn,
  checkOut,
  sharedByName,
}: {
  keyData: DigitalKey;
  hotelName: string;
  guestName: string;
  roomNumber: string;
  confirmation: string;
  checkIn: string | null;
  checkOut: string | null;
  sharedByName?: string | null;
}) {
  const { colors, isDark } = useTheme();
  const [walletBusy, setWalletBusy] = useState<'apple' | 'google' | null>(null);
  const [nfc, setNfc] = useState<NfcCapability | null>(null);
  const [tapping, setTapping] = useState(false);

  useEffect(() => {
    getNfcCapability().then(setNfc);
  }, []);
  // Re-render each minute so the card flips to Expired on its own.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const valid = isKeyCurrentlyValid(keyData);
  const expired = keyData.status === 'expired' || (keyData.status === 'active' && !valid);
  const revoked = keyData.status === 'revoked';

  const payload = useMemo(() => buildKeyPayload(keyData, roomNumber), [keyData, roomNumber]);

  const ticketBg = isDark ? '#1C2740' : '#12294B';
  const ticketMuted = 'rgba(255,255,255,0.55)';
  const statusColor = valid ? '#4ADE80' : revoked ? '#F87171' : '#FACC15';
  const statusLabel = valid ? 'ACTIVE' : revoked ? 'REVOKED' : 'EXPIRED';

  const walletCtx: WalletPassContext = {
    hotelName,
    guestName,
    roomNumber,
    confirmation,
    checkIn: checkIn ?? '',
    checkOut: checkOut ?? '',
  };

  const handleWallet = async (platform: 'apple' | 'google') => {
    setWalletBusy(platform);
    const result = platform === 'apple' ? await addToAppleWallet(keyData, walletCtx) : await addToGoogleWallet(keyData, walletCtx);
    setWalletBusy(null);
    if (!result.ok) {
      Alert.alert(platform === 'apple' ? 'Apple Wallet' : 'Google Wallet', result.message);
    }
  };

  const featured = preferredWallet();

  return (
    <View>
      <View style={[styles.ticket, { backgroundColor: ticketBg, opacity: valid ? 1 : 0.85 }]}>
        {/* Header: hotel + status */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hotelLabel}>{hotelName.toUpperCase()}</Text>
            <Text style={styles.passType}>DIGITAL ROOM KEY</Text>
          </View>
          <View style={[styles.statusChip, { borderColor: statusColor }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Big room number, like a boarding pass gate */}
        <View style={styles.mainRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: ticketMuted }]}>GUEST</Text>
            <Text style={styles.guestName} numberOfLines={1}>{guestName}</Text>
            {sharedByName ? (
              <Text style={[styles.sharedBy, { color: ticketMuted }]}>Shared by {sharedByName}</Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.fieldLabel, { color: ticketMuted }]}>ROOM</Text>
            <Text style={styles.roomNumber}>{roomNumber}</Text>
          </View>
        </View>

        <View style={styles.datesRow}>
          <View>
            <Text style={[styles.fieldLabel, { color: ticketMuted }]}>CHECK-IN</Text>
            <Text style={styles.dateValue}>{formatDate(checkIn)}</Text>
          </View>
          <View style={styles.datesDivider} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.fieldLabel, { color: ticketMuted }]}>CHECK-OUT</Text>
            <Text style={styles.dateValue}>{formatDate(checkOut)}</Text>
          </View>
        </View>

        {/* Perforated divider with side notches */}
        <View style={styles.perforationRow}>
          <View style={[styles.notch, { backgroundColor: colors.background, left: -12 }]} />
          <View style={styles.dashedLine} />
          <View style={[styles.notch, { backgroundColor: colors.background, right: -12 }]} />
        </View>

        {/* QR credential */}
        <View style={styles.qrSection}>
          <View style={[styles.qrBox, !valid && styles.qrDisabled]}>
            <QRCode value={payload} size={148} backgroundColor="#FFFFFF" color="#0F172A" />
            {!valid && (
              <View style={styles.qrOverlay}>
                <Text style={styles.qrOverlayText}>{statusLabel}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.qrHint, { color: ticketMuted }]}>
            {valid
              ? nfc?.canEmulate
                ? 'Scan at the door, or tap your phone on the reader'
                : 'Scan this at the door reader'
              : revoked
                ? 'This key was revoked by hotel staff'
                : 'This key expired at checkout'}
          </Text>
          <Text style={[styles.serial, { color: ticketMuted }]}>
            {keyData.pass_serial} · Conf {confirmation}
          </Text>
        </View>
      </View>

      {/* Tap to unlock — Android only; iPhones present the key from Wallet. */}
      {valid && nfc?.canEmulate ? (
        <TouchableOpacity
          style={[styles.nfcButton, { backgroundColor: colors.tint }]}
          disabled={tapping}
          activeOpacity={0.85}
          onPress={async () => {
            setTapping(true);
            const result = await presentKeyOverNfc(keyData, roomNumber);
            setTapping(false);
            Alert.alert(result.ok ? 'Ready to unlock' : 'NFC unavailable', result.message);
          }}
        >
          <Text style={[styles.nfcText, { color: colors.onTint }]}>
            {tapping ? 'Hold against the reader…' : 'Tap to unlock'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {valid && nfc && !nfc.canEmulate && nfc.reason ? (
        <Text style={[styles.nfcNote, { color: colors.textTertiary }]}>{nfc.reason}</Text>
      ) : null}

      {/* Wallet buttons */}
      <View style={styles.walletRow}>
        {(featured === 'apple' ? (['apple', 'google'] as const) : (['google', 'apple'] as const)).map((platform) => (
          <TouchableOpacity
            key={platform}
            style={[
              styles.walletButton,
              platform === 'apple'
                ? { backgroundColor: '#000000', borderColor: '#000000' }
                : { backgroundColor: isDark ? '#FFFFFF' : '#1F1F1F', borderColor: isDark ? '#FFFFFF' : '#1F1F1F' },
            ]}
            onPress={() => handleWallet(platform)}
            disabled={walletBusy !== null || !valid}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.walletButtonText,
                { color: platform === 'apple' ? '#FFFFFF' : isDark ? '#111111' : '#FFFFFF', opacity: valid ? 1 : 0.5 },
              ]}
            >
              {walletBusy === platform
                ? 'Opening…'
                : platform === 'apple'
                  ? 'Add to Apple Wallet'
                  : 'Add to Google Wallet'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {keyData.wallet_added_at && (
        <Text style={[styles.walletAdded, { color: colors.textSecondary }]}>
          Added to wallet {formatDate(keyData.wallet_added_at)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.xl },
  hotelLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  passType: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700', letterSpacing: 2, marginTop: 3 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  mainRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.lg },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  guestName: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  sharedBy: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  roomNumber: { color: '#FFFFFF', fontSize: 40, fontWeight: '800', letterSpacing: -1, lineHeight: 44 },
  datesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datesDivider: { flex: 1, height: 1, marginHorizontal: spacing.md, backgroundColor: 'rgba(255,255,255,0.22)' },
  dateValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  perforationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xl,
    marginHorizontal: -spacing.xl,
    paddingHorizontal: spacing.xl,
    position: 'relative',
  },
  notch: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    top: -12,
  },
  dashedLine: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.25)',
  },
  qrSection: { alignItems: 'center' },
  qrBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: 12,
  },
  qrDisabled: { opacity: 0.9 },
  qrOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  qrOverlayText: { color: '#DC2626', fontSize: 22, fontWeight: '900', letterSpacing: 2, transform: [{ rotate: '-14deg' }] },
  qrHint: { fontSize: 12, fontWeight: '600', marginTop: spacing.md, textAlign: 'center', paddingHorizontal: 12 },
  serial: { fontSize: 11, fontWeight: '600', marginTop: 6, letterSpacing: 0.5 },
  walletRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  walletButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  walletButtonText: { fontSize: 14, fontWeight: '700' },
  nfcButton: {
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  nfcText: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  nfcNote: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: spacing.md },
  walletAdded: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: spacing.sm },
});
