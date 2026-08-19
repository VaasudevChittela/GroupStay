/**
 * Date helpers with no dependencies, so every layer can use them without
 * creating an import cycle.
 */

export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
};

/** Default checkout for a walk-in: today would expire the key the same day. */
export const tomorrowISO = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
};

export const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const [y, m, day] = iso.split('T')[0].split('-').map(Number);
  if (!y || !m || !day) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${day}`;
};

export const nightsBetween = (checkIn: string | null, checkOut: string | null): number | null => {
  if (!checkIn || !checkOut) return null;
  const a = new Date(checkIn.split('T')[0]);
  const b = new Date(checkOut.split('T')[0]);
  const nights = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Number.isFinite(nights) ? Math.max(nights, 0) : null;
};

/**
 * When a key should stop working: 12:00 on the checkout date, in the device's
 * own timezone. Writing this as a literal "…T12:00:00Z" pinned expiry to noon
 * UTC — 04:00 on the US west coast — so keys died overnight, before the guest
 * had even woken up on their last morning.
 */
export const checkoutExpiry = (checkOutDate: string): string => {
  const [y, m, d] = (checkOutDate ?? '').split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return new Date().toISOString();
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
};
