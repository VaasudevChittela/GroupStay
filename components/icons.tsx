import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type IconProps = { size?: number; color: string; strokeWidth?: number };

const base = (size?: number) => ({ width: size ?? 22, height: size ?? 22, viewBox: '0 0 24 24' });

export function DashboardIcon({ size, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Rect x="3" y="3" width="7.5" height="7.5" rx="1.6" stroke={color} strokeWidth={strokeWidth} />
      <Rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" stroke={color} strokeWidth={strokeWidth} />
      <Rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" stroke={color} strokeWidth={strokeWidth} />
      <Rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function BedIcon({ size, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Path d="M3 18v-8m0 0V7m0 3h18v8m0-8a3 3 0 0 0-3-3h-6v3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="7" cy="12.5" r="1.9" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function GuestsIcon({ size, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Circle cx="9" cy="8" r="3.2" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M16 5.4a3.2 3.2 0 0 1 0 5.2M17.5 14.6a5.5 5.5 0 0 1 3 4.9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function PersonIcon({ size = 15, color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Circle cx="12" cy="8" r="3.4" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M5.5 20a6.5 6.5 0 0 1 13 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function KeyIcon({ size = 15, color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Circle cx="8" cy="12" r="4" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 12h9m-3 0v3.2m-2.6-3.2v2.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function LockIcon({ size = 15, color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function CleaningIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Path d="M12 3v8M8.5 11h7l1.5 10H7l1.5-10Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M7.6 15.5h8.8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function AlertIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Path d="M12 4.5 21 20H3l9-15.5Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M12 10v4.2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx="12" cy="17.2" r="0.9" fill={color} />
    </Svg>
  );
}

export function ClockIcon({ size = 20, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 7.2V12l3.2 2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SearchIcon({ size = 28, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth={strokeWidth} />
      <Path d="m15.4 15.4 4.6 4.6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function BuildingIcon({ size = 28, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Rect x="4" y="3.5" width="16" height="17" rx="1.8" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8.5 7.5h2m3 0h2m-7 4h2m3 0h2m-7 4h2m3 0h2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function CheckIcon({ size = 28, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={strokeWidth} />
      <Path d="m8.2 12.3 2.6 2.6 5-5.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PlusIcon({ size = 16, color, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Path d="M12 5.5v13M5.5 12h13" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function SettingsIcon({ size = 18, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg {...base(size)} fill="none">
      <Circle cx="12" cy="12" r="3.2" stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M12 3.2v2m0 13.6v2M20.8 12h-2M5.2 12h-2m14.4-6.2-1.4 1.4M7.8 16.2l-1.4 1.4m0-11.8 1.4 1.4m8.4 8.4 1.4 1.4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
