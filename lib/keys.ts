import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { DEMO_KEYS, DEMO_WRITE_MESSAGE, isDemoMode } from './demo';
import { DigitalKey } from './hotelTypes';
import { checkoutExpiry } from './dates';

type Result<T> = { data: T; error: null } | { data: null; error: string };

const err = (e: unknown): string =>
  typeof e === 'string' ? e : e instanceof Error ? e.message : JSON.stringify(e);

const randomHex = (bytes: number): string => {
  const arr = Crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Issue (or re-activate) the digital key for a guest's stay.
 * One active key per guest+room; re-issuing returns the existing key so a
 * guest re-opening the app never accidentally invalidates their pass.
 */
export async function issueKey(params: {
  tripId: string;
  guestId: string;
  roomId: string;
  checkOut: string; // ISO date — key auto-expires at noon on checkout day
  sharedBy?: string;
}): Promise<Result<DigitalKey>> {
  const { tripId, guestId, roomId, checkOut, sharedBy } = params;

  const { data: existing } = await supabase
    .from('digital_keys')
    .select('*')
    .eq('guest_id', guestId)
    .eq('room_id', roomId)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) return { data: existing as DigitalKey, error: null };

  const key = {
    trip_id: tripId,
    guest_id: guestId,
    room_id: roomId,
    key_token: randomHex(24),
    pass_serial: `GSKEY-${tripId}-${guestId}-${randomHex(4).toUpperCase()}`,
    status: 'active',
    valid_from: new Date().toISOString(),
    valid_until: checkoutExpiry(checkOut),
    activated_at: new Date().toISOString(),
    shared_by: sharedBy ?? null,
  };

  const { data, error } = await supabase.from('digital_keys').insert([key]).select('*').single();
  if (error || !data) return { data: null, error: err(error ?? 'Unable to issue key') };

  await logKeyEvent(data.id, 'issued');
  return { data: data as DigitalKey, error: null };
}

/** Staff action: instantly kill a key. */
export async function revokeKey(keyId: string, reason?: string): Promise<string | null> {
  const { error } = await supabase
    .from('digital_keys')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: reason ?? null })
    .eq('id', keyId);
  if (error) return err(error);
  await logKeyEvent(keyId, 'revoked', undefined, reason);
  return null;
}

/** Expire every active key a guest holds — called at checkout. */
export async function expireKeysForReservation(guestId: string): Promise<void> {
  const { data } = await supabase
    .from('digital_keys')
    .select('id')
    .eq('guest_id', guestId)
    .eq('status', 'active');

  await supabase
    .from('digital_keys')
    .update({ status: 'expired' })
    .eq('guest_id', guestId)
    .eq('status', 'active');

  await Promise.all((data ?? []).map((k) => logKeyEvent(k.id, 'expired')));
}

/** When a guest changes rooms, their key (and wallet pass) follows them. */
export async function moveKeysToRoom(guestId: string, roomId: string): Promise<void> {
  const { data } = await supabase
    .from('digital_keys')
    .select('id')
    .eq('guest_id', guestId)
    .eq('status', 'active');

  await supabase
    .from('digital_keys')
    .update({ room_id: roomId })
    .eq('guest_id', guestId)
    .eq('status', 'active');

  await Promise.all((data ?? []).map((k) => logKeyEvent(k.id, 'room_changed')));
}

/** Share room access with a roommate / family member on the same trip. */
/**
 * Share a key with a roommate. This goes through the share_room_key function
 * rather than inserting directly: a student has no INSERT rights on
 * digital_keys, and the function re-checks server-side that the target is
 * genuinely assigned to the caller's room before minting anything.
 */
export async function shareKey(params: { targetGuestId: string }): Promise<Result<string | null>> {
  if (isDemoMode()) return { data: null, error: DEMO_WRITE_MESSAGE };

  const { data, error } = await supabase.rpc('share_room_key', { p_target_guest: params.targetGuestId });
  if (error) return { data: null, error: err(error) };
  const keyId = (data as string) ?? null;
  if (keyId) await logKeyEvent(keyId, 'shared');
  return { data: keyId, error: null };
}

export async function getActiveKeyForGuest(guestId: string): Promise<DigitalKey | null> {
  if (isDemoMode()) return DEMO_KEYS.find((k) => k.guest_id === guestId && k.status === 'active') ?? null;

  const { data } = await supabase
    .from('digital_keys')
    .select('*')
    .eq('guest_id', guestId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as DigitalKey) ?? null;
}

export async function markWalletAdded(keyId: string): Promise<void> {
  if (isDemoMode()) return;

  await supabase
    .from('digital_keys')
    .update({ wallet_added_at: new Date().toISOString() })
    .eq('id', keyId);
  await logKeyEvent(keyId, 'wallet_added');
}

export async function logKeyEvent(
  keyId: string,
  event: 'issued' | 'activated' | 'unlock_success' | 'unlock_denied' | 'revoked' | 'expired' | 'wallet_added' | 'shared' | 'room_changed',
  method?: 'nfc' | 'ble' | 'qr',
  detail?: string,
): Promise<void> {
  await supabase.from('key_events').insert([{ key_id: keyId, event, method: method ?? null, detail: detail ?? null }]);
}

// ---------------------------------------------------------------------------
// Key credential payload — what the QR code / NFC / BLE credential carries.
// The token is opaque; the lock (or staff scanner) validates it server-side.
// ---------------------------------------------------------------------------

export type KeyPayload = {
  v: 1;
  typ: 'groupstay.roomkey';
  tok: string;
  sn: string;
  room: string;
  exp: string;
};

export function buildKeyPayload(key: DigitalKey, roomNumber: string): string {
  const payload: KeyPayload = {
    v: 1,
    typ: 'groupstay.roomkey',
    tok: key.key_token,
    sn: key.pass_serial,
    room: roomNumber,
    exp: key.valid_until,
  };
  return JSON.stringify(payload);
}

export function isKeyCurrentlyValid(key: DigitalKey): boolean {
  if (key.status !== 'active') return false;
  const now = Date.now();
  return now >= new Date(key.valid_from).getTime() && now <= new Date(key.valid_until).getTime();
}

/**
 * Validate a scanned credential — used by the staff "scan" flow and by a
 * smart-lock bridge. Works offline for signature/shape checks; goes online
 * to confirm the key hasn't been revoked.
 */
export async function validateScannedKey(raw: string): Promise<{ ok: boolean; reason: string; key?: DigitalKey }> {
  let payload: KeyPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'Not a GroupStay key' };
  }
  if (payload.typ !== 'groupstay.roomkey' || !payload.tok) {
    return { ok: false, reason: 'Not a GroupStay key' };
  }
  if (new Date(payload.exp).getTime() < Date.now()) {
    return { ok: false, reason: 'Key expired' };
  }

  const { data } = await supabase
    .from('digital_keys')
    .select('*')
    .eq('key_token', payload.tok)
    .maybeSingle();

  if (!data) return { ok: false, reason: 'Key not found' };
  const key = data as DigitalKey;

  if (!isKeyCurrentlyValid(key)) {
    await logKeyEvent(key.id, 'unlock_denied', 'qr', `status=${key.status}`);
    return { ok: false, reason: key.status === 'revoked' ? 'Key revoked' : 'Key expired', key };
  }

  await supabase.from('digital_keys').update({ last_unlock_at: new Date().toISOString() }).eq('id', key.id);
  await logKeyEvent(key.id, 'unlock_success', 'qr');
  return { ok: true, reason: 'Unlocked', key };
}
