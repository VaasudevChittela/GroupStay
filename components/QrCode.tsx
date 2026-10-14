import { useMemo } from 'react';
import { View } from 'react-native';
import { makeQr } from '../lib/qr';

// Draws a QR code with plain Views (one per horizontal run of dark modules), so it works on
// web and phones without an SVG library. Always dark-on-white so phones can scan it.
export default function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const rows = useMemo(() => {
    const grid = makeQr(value);
    return grid.map((row) => {
      const runs: Array<{ start: number; length: number }> = [];
      row.forEach((dark, x) => {
        if (!dark) return;
        const last = runs[runs.length - 1];
        if (last && last.start + last.length === x) last.length++;
        else runs.push({ start: x, length: 1 });
      });
      return runs;
    });
  }, [value]);

  const quiet = 4; // blank border required around the code
  const cell = size / (rows.length + quiet * 2);
  return (
    <View style={{ width: size, height: size, backgroundColor: '#FFFFFF', padding: cell * quiet, borderRadius: 12 }}>
      {rows.map((runs, y) => (
        <View key={y} style={{ height: cell, flexDirection: 'row' }}>
          {runs.map((run) => (
            <View
              key={run.start}
              style={{ position: 'absolute', left: run.start * cell, width: run.length * cell + 0.5, height: cell + 0.5, backgroundColor: '#000000' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
