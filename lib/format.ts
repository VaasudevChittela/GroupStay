// '14:30' -> '2:30 PM'
export function formatTime(value: string | null | undefined) {
  if (!value) return 'Not set';
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${`${m}`.padStart(2, '0')} ${suffix}`;
}

// '2026-11-14' -> 'Nov 14'
export function formatDay(value: string | null | undefined) {
  if (!value) return '';
  const [y, mo, d] = value.split('-').map(Number);
  const date = new Date(y, (mo ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDateRange(checkIn: string | null | undefined, checkOut: string | null | undefined) {
  if (!checkIn && !checkOut) return '';
  if (!checkOut) return formatDay(checkIn);
  return `${formatDay(checkIn)} – ${formatDay(checkOut)}`;
}

export function timeAgo(value: string | null | undefined) {
  if (!value) return '';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Steps an 'HH:MM' value by a number of minutes, wrapping around midnight.
export function stepTime(value: string | null, minutes: number) {
  const [h, m] = (value ?? '12:00').split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${`${Math.floor(total / 60)}`.padStart(2, '0')}:${`${total % 60}`.padStart(2, '0')}`;
}

export function formatDeadline(iso: string | null) {
  if (!iso) return 'No deadline';
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
