import { ReactNode } from 'react';
import { ImageBackground, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles';
import { colors, fs } from '../lib/theme';

export type IconName = keyof typeof Ionicons.glyphMap;

// Scrollable screen. `hero` (usually a <Hero />) spans the full width above the content.
export function Page({ children, hero }: { children: ReactNode; hero?: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.keyboardAvoidingContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scrollView} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {hero}
        <View style={[styles.page, hero ? { paddingTop: 20 } : null]}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function BackButton({ onPress, label = 'Back', light }: { onPress: () => void; label?: string; light?: boolean }) {
  const color = light ? colors.white : colors.primary;
  return (
    <TouchableOpacity style={styles.topBackButton} onPress={onPress} accessibilityRole="button">
      <Ionicons name="chevron-back" size={18} color={color} />
      <Text style={[styles.backText, { color }]}>{label.replace(/^‹\s*/, '')}</Text>
    </TouchableOpacity>
  );
}

// Full-width photo header with a dark gradient so white text stays readable.
export function Hero({
  image,
  eyebrow,
  title,
  subtitle,
  onBack,
  backLabel,
  height = 240,
  children,
}: {
  image: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  height?: number;
  children?: ReactNode;
}) {
  return (
    <ImageBackground source={{ uri: image }} style={{ minHeight: height, width: '100%', backgroundColor: '#0B1220' }} resizeMode="cover">
      <LinearGradient
        colors={['rgba(11,18,32,0.35)', 'rgba(11,18,32,0.55)', 'rgba(11,18,32,0.88)']}
        style={{ flex: 1, minHeight: height, justifyContent: 'space-between' }}
      >
        <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 28, paddingBottom: 26, flex: 1, justifyContent: 'space-between' }}>
          <View>{onBack ? <BackButton onPress={onBack} label={backLabel} light /> : null}</View>
          <View>
            {eyebrow ? (
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: fs(12), fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
                {eyebrow}
              </Text>
            ) : null}
            <Text style={{ color: colors.white, fontSize: fs(30), fontWeight: '800', letterSpacing: -0.5 }}>{title}</Text>
            {subtitle ? <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fs(15), marginTop: 6, lineHeight: fs(21) }}>{subtitle}</Text> : null}
            {children}
          </View>
        </View>
      </LinearGradient>
    </ImageBackground>
  );
}

// Dashboard tile: icon, label, and an optional count bubble.
export function Tile({ icon, label, onPress, count, tint = colors.primary }: { icon: IconName; label: string; onPress: () => void; count?: number; tint?: string }) {
  return (
    <TouchableOpacity style={styles.gridButton} onPress={onPress} activeOpacity={0.8}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: `${tint}18`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={22} color={tint} />
        </View>
        {count ? (
          <View style={{ minWidth: 24, height: 24, borderRadius: 12, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text style={{ color: colors.white, fontSize: fs(12), fontWeight: '800' }}>{count}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.gridButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

type Tone = 'neutral' | 'green' | 'amber' | 'blue';

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: Tone }) {
  const box = tone === 'green' ? styles.badgeGreen : tone === 'amber' ? styles.badgeAmber : tone === 'blue' ? styles.badgeBlue : null;
  const label = tone === 'green' ? styles.badgeGreenText : tone === 'amber' ? styles.badgeAmberText : tone === 'blue' ? styles.badgeBlueText : null;
  return (
    <View style={[styles.badge, box]}>
      <Text style={[styles.badgeText, label]}>{text}</Text>
    </View>
  );
}

export function OptionPicker<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T | '' | null;
  onChange: (value: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <View style={styles.optionRow}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <TouchableOpacity
            key={option}
            style={selected ? [styles.optionButton, styles.optionButtonSelected] : styles.optionButton}
            onPress={() => onChange(option)}
          >
            <Text style={selected ? [styles.optionButtonText, styles.optionButtonTextSelected] : styles.optionButtonText}>
              {labels?.[option] ?? option}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function SmallButton({
  text,
  onPress,
  secondary,
  disabled,
}: {
  text: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[secondary ? styles.smallSecondaryButton : styles.smallButton, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={secondary ? styles.smallSecondaryButtonText : styles.smallButtonText}>{text}</Text>
    </TouchableOpacity>
  );
}

