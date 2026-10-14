// Rooming manifest export: a CSV file and a printable page (print or "Save as PDF").
// The hotel version leaves out phone numbers, emergency contacts, and medical notes.

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { formatDateRange, formatTime } from './format';
import { Guest, GUEST_COLUMNS, GUEST_DETAILS_COLUMNS, GuestDetails, Room, ROOM_COLUMNS, Trip } from './types';

type Audience = 'hotel' | 'advisor';

type ManifestRow = {
  room: string;
  roomType: string;
  name: string;
  role: string;
  gender: string;
  checkedIn: string;
  phone: string;
  email: string;
  emergency: string;
  medical: string;
};

async function loadRows(trip: Trip, audience: Audience): Promise<ManifestRow[]> {
  const [{ data: rooms }, { data: guests }, { data: assignments }, { data: details }] = await Promise.all([
    supabase.from('rooms').select(ROOM_COLUMNS).eq('trip_id', trip.id).order('room_number', { ascending: true }),
    supabase.from('guests').select(GUEST_COLUMNS).eq('trip_id', trip.id).order('legal_name', { ascending: true }),
    supabase.from('assignments').select('guest_id, room_id').eq('trip_id', trip.id),
    audience === 'advisor'
      ? supabase.from('guest_details').select(GUEST_DETAILS_COLUMNS).eq('trip_id', trip.id)
      : Promise.resolve({ data: [] as GuestDetails[] }),
  ]);
  const roomById = new Map(((rooms ?? []) as Room[]).map((room) => [room.id, room]));
  const roomOf = new Map((assignments ?? []).map((a) => [a.guest_id, a.room_id]));
  const detailsOf = new Map(((details ?? []) as GuestDetails[]).map((d) => [d.guest_id, d]));

  return ((guests ?? []) as Guest[])
    .map((guest) => {
      const room = roomById.get(roomOf.get(guest.id) ?? -1);
      const d = detailsOf.get(guest.id);
      return {
        room: room?.room_number ?? 'No room',
        roomType: room ? `${room.room_type}${room.gender ? `, ${room.gender}` : ''}` : '',
        name: guest.legal_name,
        role: guest.is_chaperone ? 'Chaperone' : 'Student',
        gender: guest.gender ?? '',
        checkedIn: guest.checked_in_at ? 'Yes' : '',
        phone: guest.phone ?? '',
        email: guest.email ?? '',
        emergency: d?.emergency_name ? `${d.emergency_name}${d.emergency_relationship ? ` (${d.emergency_relationship})` : ''} ${d.emergency_phone ?? ''}`.trim() : '',
        medical: d?.medical_notes ?? '',
      };
    })
    .sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }) || a.name.localeCompare(b.name));
}

function columns(audience: Audience): Array<[keyof ManifestRow, string]> {
  const base: Array<[keyof ManifestRow, string]> = [
    ['room', 'Room'],
    ['roomType', 'Room type'],
    ['name', 'Name'],
    ['role', 'Role'],
    ['gender', 'Gender'],
    ['checkedIn', 'Checked in'],
  ];
  return audience === 'hotel'
    ? base
    : [...base, ['phone', 'Phone'], ['email', 'Email'], ['emergency', 'Emergency contact'], ['medical', 'Medical notes']];
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const htmlCell = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function fileName(trip: Trip, ext: string) {
  return `${(trip.school ?? trip.name).replace(/[^a-z0-9]+/gi, '-')}-rooming-list.${ext}`;
}

export async function exportManifestCsv(trip: Trip, audience: Audience) {
  const rows = await loadRows(trip, audience);
  const cols = columns(audience);
  const csv = [cols.map(([, label]) => label).join(','), ...rows.map((row) => cols.map(([key]) => csvCell(row[key])).join(','))].join('\n');
  await saveCsv(fileName(trip, 'csv'), csv);
}

// Builds a CSV from a header row and data rows.
export function toCsv(rows: string[][]) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

// Downloads a CSV on web, or opens the share sheet on phones.
export async function saveCsv(name: string, csv: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const path = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(path, csv);
  await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: name });
}

export async function printManifest(trip: Trip, audience: Audience) {
  const rows = await loadRows(trip, audience);
  const cols = columns(audience);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${htmlCell(fileName(trip, 'pdf'))}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111827; padding: 24px; }
  h1 { color: #2F5BEA; margin: 0 0 4px; font-size: 22px; }
  p { margin: 0 0 16px; color: #374151; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #D1D5DB; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #EFF6FF; }
</style></head><body>
<h1>${htmlCell(`${trip.school ?? ''} rooming list`)}</h1>
<p>${htmlCell(`${trip.name} · ${trip.hotel_name} · ${formatDateRange(trip.check_in, trip.check_out)} · arrives ${formatTime(trip.arrival_time)} · ${rows.length} guests`)}</p>
<table><thead><tr>${cols.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead>
<tbody>${rows.map((row) => `<tr>${cols.map(([key]) => `<td>${htmlCell(row[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>
</body></html>`;

  if (Platform.OS === 'web') {
    // Print from a hidden frame so only the list prints, not the app.
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    frame.contentDocument?.open();
    frame.contentDocument?.write(html);
    frame.contentDocument?.close();
    setTimeout(() => {
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
    }, 250);
    return;
  }
  await Print.printAsync({ html });
}
