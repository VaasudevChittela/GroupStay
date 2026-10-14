import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, fs, themed } from '../lib/theme';

export type HotelChoice = { name: string; address: string };

type PhotonFeature = {
  properties: {
    osm_id: number;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  };
};

// Hotel lookup using OpenStreetMap's free Photon search (no API key, works in browsers).
// Google Places can't be used right now: the Google Cloud project has billing turned off.
async function searchHotels(query: string, signal: AbortSignal): Promise<HotelChoice[]> {
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}` +
    '&osm_tag=tourism:hotel&osm_tag=tourism:motel&osm_tag=tourism:hostel&limit=8&lang=en';
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Hotel search failed (${response.status})`);
  const json: { features: PhotonFeature[] } = await response.json();
  const seen = new Set<string>();
  return json.features
    .filter((feature) => feature.properties.name)
    .map((feature) => {
      const p = feature.properties;
      const street = [p.housenumber, p.street].filter(Boolean).join(' ');
      return { name: p.name as string, address: [street, p.city, p.state, p.country].filter(Boolean).join(', ') };
    })
    .filter((hotel) => {
      const key = `${hotel.name}|${hotel.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export default function HotelSearch({ value, onChange }: { value: HotelChoice | null; onChange: (hotel: HotelChoice | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HotelChoice[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle');
  const abortRef = useRef<AbortController | null>(null);
  const styles = getStyles();

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus('searching');
      try {
        setResults(await searchHotels(text, controller.signal));
        setStatus('idle');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setStatus('error');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  if (value) {
    return (
      <View style={styles.selected}>
        <View style={{ flex: 1 }}>
          <Text style={styles.selectedName}>{value.name}</Text>
          {value.address ? <Text style={styles.selectedAddress}>{value.address}</Text> : null}
        </View>
        <TouchableOpacity
          onPress={() => {
            onChange(null);
            setQuery(value.name);
          }}
        >
          <Text style={styles.change}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <TextInput
        style={styles.input}
        placeholder="Search hotels by name and city (e.g. Hilton Orlando)"
        placeholderTextColor={colors.faint}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />
      {status === 'searching' && <Text style={styles.hint}>Searching…</Text>}
      {status === 'error' && <Text style={styles.hint}>Hotel search isn't reachable. You can still use the name as typed.</Text>}
      {results.length > 0 && (
        <View style={styles.list}>
          {results.map((hotel) => (
            <TouchableOpacity key={`${hotel.name}|${hotel.address}`} style={styles.row} onPress={() => onChange(hotel)}>
              <Text style={styles.rowName}>{hotel.name}</Text>
              <Text style={styles.rowAddress}>{hotel.address}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {query.trim().length >= 3 && status !== 'searching' && (
        <TouchableOpacity style={styles.manual} onPress={() => onChange({ name: query.trim(), address: '' })}>
          <Text style={styles.manualText}>{results.length ? `Not listed? Use "${query.trim()}" as typed` : `No matches. Use "${query.trim()}" as typed`}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const getStyles = themed(() =>
  StyleSheet.create({
    input: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 16,
      fontSize: fs(16),
      color: colors.ink,
    },
    hint: {
      color: colors.muted,
      fontSize: fs(14),
      marginTop: 6,
    },
    list: {
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      marginTop: 6,
      overflow: 'hidden',
    },
    row: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      backgroundColor: colors.card,
    },
    rowName: {
      fontSize: fs(16),
      fontWeight: '600',
      color: colors.ink,
    },
    rowAddress: {
      fontSize: fs(13),
      color: colors.muted,
      marginTop: 2,
    },
    manual: {
      paddingVertical: 10,
    },
    manualText: {
      color: colors.primary,
      fontSize: fs(14),
      fontWeight: '600',
    },
    selected: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
    },
    selectedName: {
      fontSize: fs(16),
      fontWeight: '700',
      color: colors.ink,
    },
    selectedAddress: {
      fontSize: fs(13),
      color: colors.text,
      marginTop: 2,
    },
    change: {
      color: colors.primary,
      fontWeight: '700',
    },
  }),
);
