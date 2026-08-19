import { useColorScheme } from 'react-native';

export type Palette = {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  tint: string;
  tintSoft: string;
  onTint: string;
  success: string;
  successSoft: string;
  info: string;
  infoSoft: string;
  warning: string;
  warningSoft: string;
  orange: string;
  orangeSoft: string;
  danger: string;
  dangerSoft: string;
  neutral: string;
  neutralSoft: string;
};

export const lightPalette: Palette = {
  background: '#F2F4F7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E5E9F0',
  text: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  tint: '#1A56A0',
  tintSoft: '#E3EDF9',
  onTint: '#FFFFFF',
  success: '#16A34A',
  successSoft: '#DCFCE7',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  warning: '#CA8A04',
  warningSoft: '#FEF9C3',
  orange: '#EA580C',
  orangeSoft: '#FFEDD5',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  neutral: '#64748B',
  neutralSoft: '#F1F5F9',
};

export const darkPalette: Palette = {
  background: '#0B1220',
  surface: '#151E30',
  surfaceRaised: '#1C2740',
  border: '#26324B',
  text: '#F1F5F9',
  textSecondary: '#A7B4C8',
  textTertiary: '#64748B',
  tint: '#5B96E0',
  tintSoft: '#1A2C4A',
  onTint: '#0B1220',
  success: '#4ADE80',
  successSoft: '#143523',
  info: '#60A5FA',
  infoSoft: '#16294A',
  warning: '#FACC15',
  warningSoft: '#3A3210',
  orange: '#FB923C',
  orangeSoft: '#3D2410',
  danger: '#F87171',
  dangerSoft: '#3E1717',
  neutral: '#94A3B8',
  neutralSoft: '#1E293B',
};

export function useTheme(): { colors: Palette; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { colors: isDark ? darkPalette : lightPalette, isDark };
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 22 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
