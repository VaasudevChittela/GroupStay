import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Palette, radius, spacing, useTheme } from '../lib/theme';
import { ROOM_STATUS_META, RoomStatus } from '../lib/hotelTypes';

export function statusColors(colors: Palette, status: RoomStatus): { fg: string; bg: string } {
  switch (status) {
    case 'available':
      return { fg: colors.success, bg: colors.successSoft };
    case 'occupied':
      return { fg: colors.info, bg: colors.infoSoft };
    case 'reserved':
      return { fg: colors.warning, bg: colors.warningSoft };
    case 'cleaning':
      return { fg: colors.orange, bg: colors.orangeSoft };
    case 'maintenance':
      return { fg: colors.danger, bg: colors.dangerSoft };
    case 'out_of_service':
      return { fg: colors.neutral, bg: colors.neutralSoft };
  }
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: spacing.lg,
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        },
        style as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
}

export function StatusBadge({ status }: { status: RoomStatus }) {
  const { colors } = useTheme();
  const { fg, bg } = statusColors(colors, status);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={[styles.badgeText, { color: fg }]}>{ROOM_STATUS_META[status].label}</Text>
    </View>
  );
}

export function Pill({ label, color, background }: { label: string; color: string; background: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{children}</Text>
      {right}
    </View>
  );
}

export function Stat({ value, label, accent }: { value: string | number; label: string; accent?: string }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, paddingVertical: spacing.md, alignItems: 'center' }}>
      <Text style={[styles.statValue, { color: accent ?? colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </Card>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  destructive,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const bg = destructive ? colors.danger : colors.tint;
  return (
    <TouchableOpacity
      style={[styles.primaryButton, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[styles.primaryButtonText, { color: destructive ? '#FFFFFF' : colors.onTint }]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  title,
  onPress,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.primaryButton,
        { backgroundColor: colors.neutralSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[styles.primaryButtonText, { color: colors.text }]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Field({
  placeholder,
  value,
  onChangeText,
  keyboardType,
  multiline,
  autoCapitalize,
  secureTextEntry,
}: {
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      style={[
        styles.field,
        {
          backgroundColor: colors.neutralSoft,
          borderColor: colors.border,
          color: colors.text,
          minHeight: multiline ? 80 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        },
      ]}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType ?? 'default'}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      secureTextEntry={secureTextEntry}
      autoCorrect={secureTextEntry ? false : undefined}
    />
  );
}

/** iOS-style segmented / chip selector. Wraps when options overflow. */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  labels,
  dots,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
  /** Optional leading status dot colour per option. */
  dots?: Partial<Record<T, string>>;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const selected = option === value;
        const dot = dots?.[option];
        return (
          <TouchableOpacity
            key={option}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.tint : colors.neutralSoft,
                borderColor: selected ? colors.tint : colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
              },
            ]}
            onPress={() => onChange(option)}
            activeOpacity={0.7}
          >
            {dot ? <View style={[styles.dot, { backgroundColor: selected ? colors.onTint : dot }]} /> : null}
            <Text style={[styles.chipText, { color: selected ? colors.onTint : colors.text }]}>
              {labels?.[option] ?? option}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      {icon ? (
        <View style={[styles.emptyIcon, { borderColor: colors.border, backgroundColor: colors.surface }]}>{icon}</View>
      ) : null}
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  primaryButton: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700' },
  field: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
