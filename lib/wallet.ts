import { Linking, Platform } from 'react-native';
import { supabaseUrl, supabaseAnonKey } from './supabaseConfig';
import { DigitalKey } from './hotelTypes';
import { markWalletAdded } from './keys';

/**
 * Wallet passes must be generated and signed server-side:
 *  - Apple Wallet needs a .pkpass signed with an Apple Pass Type ID certificate.
 *  - Google Wallet needs a JWT signed with a Google Cloud service-account key.
 * The `wallet-pass` Supabase Edge Function (supabase/functions/wallet-pass)
 * does both. Deploy it and the buttons below light up end-to-end; until then
 * they explain what's missing instead of failing silently.
 */
const PASS_ENDPOINT = `${supabaseUrl}/functions/v1/wallet-pass`;

export type WalletPassContext = {
  hotelName: string;
  guestName: string;
  roomNumber: string;
  confirmation: string;
  checkIn: string;
  checkOut: string;
};

const passUrl = (platform: 'apple' | 'google', key: DigitalKey, ctx: WalletPassContext) => {
  const params = new URLSearchParams({
    platform,
    serial: key.pass_serial,
    token: key.key_token,
    hotel: ctx.hotelName,
    guest: ctx.guestName,
    room: ctx.roomNumber,
    confirmation: ctx.confirmation,
    checkIn: ctx.checkIn,
    checkOut: ctx.checkOut,
    apikey: supabaseAnonKey,
  });
  return `${PASS_ENDPOINT}?${params.toString()}`;
};

export type WalletResult = { ok: true } | { ok: false; reason: 'not_deployed' | 'failed'; message: string };

async function openPass(platform: 'apple' | 'google', key: DigitalKey, ctx: WalletPassContext): Promise<WalletResult> {
  const url = passUrl(platform, key, ctx);
  try {
    // Probe first so a missing function gives a friendly message, not a dead browser tab.
    const head = await fetch(url, { method: 'HEAD' });
    if (head.status === 404 || head.status === 403) {
      return {
        ok: false,
        reason: 'not_deployed',
        message:
          'The wallet pass server is not deployed yet. Deploy the "wallet-pass" Supabase Edge Function (see supabase/functions/wallet-pass/README.md) to enable Apple & Google Wallet.',
      };
    }
  } catch {
    return { ok: false, reason: 'failed', message: 'Could not reach the pass server. Check your connection.' };
  }

  const supported = await Linking.canOpenURL(url);
  if (!supported) return { ok: false, reason: 'failed', message: 'Unable to open the wallet pass link.' };
  await Linking.openURL(url);
  await markWalletAdded(key.id);
  return { ok: true };
}

export const addToAppleWallet = (key: DigitalKey, ctx: WalletPassContext) => openPass('apple', key, ctx);
export const addToGoogleWallet = (key: DigitalKey, ctx: WalletPassContext) => openPass('google', key, ctx);

/** Which wallet button to feature first on this device. */
export const preferredWallet = (): 'apple' | 'google' =>
  Platform.OS === 'ios' ? 'apple' : 'google';
