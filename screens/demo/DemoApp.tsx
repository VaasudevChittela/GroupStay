import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, useTheme } from '../../lib/theme';
import { AppRole, Profile, ROLE_LABEL } from '../../lib/session';
import { DEMO_CHAPTER, DEMO_HOTEL, DEMO_STUDENT_GUEST_ID } from '../../lib/demo';
import HotelWorkspace from '../hotel/HotelWorkspace';
import ChapterApp from '../chapter/ChapterApp';
import StudentApp from '../guest/StudentApp';

const ROLES: { id: Exclude<AppRole, 'admin'>; label: string }[] = [
  { id: 'hotel_staff', label: 'Hotel' },
  { id: 'chapter_assignor', label: 'Assignor' },
  { id: 'student', label: 'Student' },
];

/**
 * Demo shell. Same screens the real app uses — the data layer just serves
 * fixtures instead of Supabase — with a role switcher on top so the three
 * experiences can be compared without three accounts.
 */
export default function DemoApp({
  signedInAs,
  onSignOut,
}: {
  /** Role the user signed in as. Omit to show the free role switcher instead. */
  signedInAs?: Exclude<AppRole, 'admin'>;
  onSignOut?: () => void;
}) {
  const { colors } = useTheme();
  const [switched, setSwitched] = useState<Exclude<AppRole, 'admin'>>('hotel_staff');
  const role = signedInAs ?? switched;
  const setRole = setSwitched;

  const profile: Profile = {
    id: 'demo-user',
    role,
    full_name: role === 'student' ? 'Sarah Johnson' : role === 'hotel_staff' ? 'Front Desk' : 'Ms. Reyes',
    email: 'demo@groupstay.app',
    hotel_id: DEMO_HOTEL.id,
    chapter_id: DEMO_CHAPTER.id,
    guest_id: DEMO_STUDENT_GUEST_ID,
  };

  const signOut = async () => onSignOut?.();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.bar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.barTitle, { color: colors.text }]}>
            {signedInAs ? `Signed in as ${ROLE_LABEL[signedInAs]}` : 'GroupStay'}
          </Text>
          <Text style={[styles.barSub, { color: colors.textTertiary }]}>Sample data · changes are not saved</Text>
        </View>
        {signedInAs ? null : (
        <View style={[styles.switcher, { backgroundColor: colors.neutralSoft, borderColor: colors.border }]}>
          {ROLES.map((r) => {
            const active = role === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={[styles.switchItem, active && { backgroundColor: colors.tint }]}
                onPress={() => setRole(r.id)}
                activeOpacity={0.8}
              >
                <Text style={{ color: active ? colors.onTint : colors.textSecondary, fontWeight: '700', fontSize: 12 }}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        )}
        {onSignOut ? (
          <TouchableOpacity onPress={onSignOut} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 14, marginLeft: spacing.md }}>
              Sign out
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.fill}>
        {role === 'hotel_staff' && (
          <HotelWorkspace key="hotel" profile={profile} hotel={DEMO_HOTEL} onSignOut={signOut} />
        )}
        {role === 'chapter_assignor' && (
          <ChapterApp key="chapter" profile={profile} chapter={DEMO_CHAPTER} onSignOut={signOut} />
        )}
        {role === 'student' && <StudentApp key="student" profile={profile} onSignOut={signOut} hideBack />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barTitle: { fontSize: 13, fontWeight: '800' },
  barSub: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  switcher: { flexDirection: 'row', borderRadius: 999, borderWidth: 1, padding: 2 },
  switchItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
});
