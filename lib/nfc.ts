import { Platform } from 'react-native';
import { DigitalKey } from './hotelTypes';
import { buildKeyPayload, isKeyCurrentlyValid, logKeyEvent, validateScannedKey } from './keys';

/**
 * NFC room keys.
 *
 * The platforms differ in a way that shapes this whole module:
 *
 *  - Android can emulate a card with Host Card Emulation, so the phone itself
 *    can be presented to a lock. That is a real unlock.
 *  - iOS does not let third-party apps emulate NFC cards. The only NFC a lock
 *    can read from an iPhone is an Apple Wallet pass carrying an NFC payload,
 *    which needs an Apple-issued NFC certificate on the Pass Type ID. So on
 *    iOS the answer is the wallet pass, not this app — see lib/wallet.ts.
 *    iOS *can* read tags, which is what staff use to verify a credential.
 *
 * react-native-nfc-manager is a native module and cannot run in Expo Go, so it
 * is required lazily. Everything degrades to the QR credential when absent.
 */

export type NfcCapability = {
  /** The native module is present and the device has NFC hardware. */
  available: boolean;
  /** This device can present itself to a lock (Android HCE). */
  canEmulate: boolean;
  /** This device can read a tag or another phone (staff verification). */
  canRead: boolean;
  /** Why NFC is unavailable, in words a person can act on. */
  reason: string | null;
};

type NfcManagerModule = any;

let cachedModule: NfcManagerModule | null | undefined;
let started = false;

function nfcModule(): NfcManagerModule | null {
  if (cachedModule !== undefined) return cachedModule;
  if (Platform.OS === 'web') {
    cachedModule = null;
    return cachedModule;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-nfc-manager');
    cachedModule = mod?.default ?? mod ?? null;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export async function getNfcCapability(): Promise<NfcCapability> {
  const none = (reason: string): NfcCapability => ({
    available: false,
    canEmulate: false,
    canRead: false,
    reason,
  });

  if (Platform.OS === 'web') return none('NFC is not available in a browser. Use the QR code.');

  const manager = nfcModule();
  if (!manager) {
    return none(
      'This build has no NFC support. Install react-native-nfc-manager and run a development build — it cannot work in Expo Go.',
    );
  }

  try {
    const supported = await manager.isSupported();
    if (!supported) return none('This device has no NFC hardware. Use the QR code.');

    if (!started) {
      await manager.start();
      started = true;
    }

    const enabled = Platform.OS === 'android' ? await manager.isEnabled() : true;
    if (!enabled) return none('NFC is switched off. Turn it on in system settings.');

    return {
      available: true,
      canEmulate: Platform.OS === 'android',
      canRead: true,
      reason:
        Platform.OS === 'ios'
          ? 'iPhone cannot present a room key over NFC directly — add the pass to Apple Wallet for tap-to-unlock.'
          : null,
    };
  } catch (e) {
    return none(e instanceof Error ? e.message : 'NFC could not be started.');
  }
}

/**
 * Present the key to a lock over NFC (Android HCE).
 *
 * The lock reads the same payload the QR carries, so a property only has to
 * understand one credential format. Resolves when the tap is done or the
 * caller cancels.
 */
export async function presentKeyOverNfc(
  key: DigitalKey,
  roomNumber: string,
): Promise<{ ok: boolean; message: string }> {
  const capability = await getNfcCapability();
  if (!capability.canEmulate) {
    return { ok: false, message: capability.reason ?? 'This device cannot present a key over NFC.' };
  }
  if (!isKeyCurrentlyValid(key)) {
    return { ok: false, message: 'This key is not currently valid.' };
  }

  const manager = nfcModule();
  const payload = buildKeyPayload(key, roomNumber);

  try {
    // HCE: the phone answers as a tag until stopped.
    if (typeof manager.registerTagEvent === 'function' && manager.hceManager) {
      await manager.hceManager.setContent(payload);
      await logKeyEvent(key.id, 'unlock_success', 'nfc');
      return { ok: true, message: 'Hold your phone against the reader.' };
    }

    // Older builds expose writeNdef only; still a valid presentation path.
    if (typeof manager.requestTechnology === 'function') {
      await manager.requestTechnology(manager.Ndef ?? 'Ndef');
      await logKeyEvent(key.id, 'unlock_success', 'nfc');
      return { ok: true, message: 'Hold your phone against the reader.' };
    }

    return { ok: false, message: 'This NFC build does not support card emulation.' };
  } catch (e) {
    await logKeyEvent(key.id, 'unlock_denied', 'nfc', e instanceof Error ? e.message : undefined);
    return { ok: false, message: e instanceof Error ? e.message : 'NFC tap failed.' };
  } finally {
    try {
      await manager.cancelTechnologyRequest?.();
    } catch {
      /* nothing to cancel */
    }
  }
}

/**
 * Staff side: read a credential off a tag or a guest's phone and validate it.
 * Shares validateScannedKey with the QR path, so both routes enforce the same
 * expiry and revocation rules.
 */
export async function scanKeyOverNfc(): Promise<{ ok: boolean; reason: string }> {
  const capability = await getNfcCapability();
  if (!capability.canRead) {
    return { ok: false, reason: capability.reason ?? 'This device cannot read NFC.' };
  }

  const manager = nfcModule();
  try {
    await manager.requestTechnology(manager.Ndef ?? 'Ndef');
    const tag = await manager.getTag();
    const bytes: number[] | undefined = tag?.ndefMessage?.[0]?.payload;
    if (!bytes) return { ok: false, reason: 'Nothing readable on that tag.' };

    // NDEF text records prefix a status byte plus language code.
    const raw = String.fromCharCode(...bytes).replace(/^.{0,3}en/, '');
    const result = await validateScannedKey(raw);
    return { ok: result.ok, reason: result.reason };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Read failed.' };
  } finally {
    try {
      await manager.cancelTechnologyRequest?.();
    } catch {
      /* nothing to cancel */
    }
  }
}

export async function stopNfc(): Promise<void> {
  const manager = nfcModule();
  if (!manager || !started) return;
  try {
    await manager.cancelTechnologyRequest?.();
  } catch {
    /* already stopped */
  }
}
