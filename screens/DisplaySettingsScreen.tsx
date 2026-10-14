import { useState } from 'react';
import { Text, View } from 'react-native';
import { appearance, setAppearance, TextSize, ThemeMode } from '../lib/theme';
import { BackButton, OptionPicker, Page } from '../components/ui';
import { styles } from '../styles';

const MODES = ['system', 'light', 'dark'] as const;
const SIZES = ['normal', 'large', 'xlarge'] as const;

export default function DisplaySettingsScreen({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<ThemeMode>(appearance.mode);
  const [size, setSize] = useState<TextSize>(appearance.textSize);

  const update = (nextMode: ThemeMode, nextSize: TextSize) => {
    setMode(nextMode);
    setSize(nextSize);
    setAppearance(nextMode, nextSize);
  };

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Display</Text>
      <Text style={styles.pageSubtitle}>Changes apply right away and are remembered on this device.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Theme</Text>
        <Text style={styles.mutedText}>"Match device" follows your phone or computer's light/dark setting.</Text>
        <OptionPicker options={MODES} value={mode} onChange={(m) => update(m, size)} labels={{ system: 'Match device', light: 'Light', dark: 'Dark' }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Text size</Text>
        <Text style={styles.mutedText}>Makes text bigger everywhere in the app.</Text>
        <OptionPicker options={SIZES} value={size} onChange={(s) => update(mode, s)} labels={{ normal: 'Normal', large: 'Large', xlarge: 'Extra large' }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Preview</Text>
        <Text style={styles.cardTitle}>Room 1203 is ready</Text>
        <Text style={styles.cardText}>Head to the front desk at the Hilton Orlando to pick up your key.</Text>
      </View>
    </Page>
  );
}
