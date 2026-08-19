import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import { DEMO_WRITE_MESSAGE, isDemoMode } from './demo';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Minimal base64 → bytes decoder (avoids pulling in another dependency). */
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]);
    const d = B64.indexOf(clean[i + 3]);
    bytes[p++] = (a << 2) | (b >> 4);
    if (c >= 0) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.subarray(0, p);
}

/**
 * Pick a photo from the library and upload it to the `room-photos` bucket.
 * Returns the public URL, or null if the user cancelled.
 */
export async function pickAndUploadRoomPhoto(tripId: string): Promise<{ url: string | null; error: string | null }> {
  if (isDemoMode()) return { url: null, error: DEMO_WRITE_MESSAGE };

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { url: null, error: 'Photo library access is needed to add room photos.' };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    base64: true,
    allowsEditing: true,
    aspect: [4, 3],
  });

  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset?.base64) {
    return { url: null, error: null };
  }

  const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${tripId}/${Date.now()}.${ext === 'png' ? 'png' : 'jpg'}`;

  const { error } = await supabase.storage
    .from('room-photos')
    .upload(path, base64ToBytes(asset.base64), { contentType, upsert: false });

  if (error) return { url: null, error: error.message };

  const { data } = supabase.storage.from('room-photos').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
