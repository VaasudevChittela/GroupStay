import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Palette, spacing, useTheme } from './lib/theme';
import { AppRole, useSession } from './lib/session';
import { setDemoMode } from './lib/demo';
import { SUPABASE_ENABLED } from './lib/config';
import { SecondaryButton } from './components/ui';
import AuthScreen from './screens/auth/AuthScreen';
import OrgSetupScreen from './screens/auth/OrgSetupScreen';
import HotelWorkspace from './screens/hotel/HotelWorkspace';
import ChapterApp from './screens/chapter/ChapterApp';
import StudentApp from './screens/guest/StudentApp';
import DemoApp from './screens/demo/DemoApp';

// Backend is off (lib/config.ts) — every data call resolves from local fixtures.
if (!SUPABASE_ENABLED) setDemoMode(true);

/**
 * With SUPABASE_ENABLED false the app opens straight into the workspace on
 * sample data: no sign-in, no network, nothing to set up.
 *
 * With it true, routing is driven entirely by the signed-in user's role — and
 * that same role is what Postgres checks on every query (see
 * supabase/migrations/0002_rbac.sql), so rendering the wrong screen would be a
 * cosmetic bug, not a data leak.
 *
 * The pre-RBAC anonymous screens are kept, unwired, in legacy/App.legacy.tsx.
 */
function Root() {
  if (!SUPABASE_ENABLED) return <LocalAuthRoot />;
  return <AuthenticatedRoot />;
}

/**
 * The sign-in flow with no backend behind it. The real AuthScreen is used as-is;
 * it just reports the chosen role instead of calling Supabase, and the workspace
 * runs on sample data. Sign out returns here.
 */
function LocalAuthRoot() {
  const [role, setRole] = React.useState<Exclude<AppRole, 'admin'> | null>(null);

  if (!role) {
    return <AuthScreen onLocalAuth={(picked) => setRole(picked === 'admin' ? 'hotel_staff' : picked)} />;
  }
  return <DemoApp signedInAs={role} onSignOut={() => setRole(null)} />;
}

function AuthenticatedRoot() {
  const { colors } = useTheme();
  const session = useSession();

  if (session.loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!session.userId) return <AuthScreen />;

  if (session.error || !session.profile) {
    return <AccountProblem colors={colors} message={session.error} onSignOut={session.signOut} />;
  }

  // Signed in, but not yet attached to a hotel / chapter / trip.
  if (session.needsOrg) {
    return <OrgSetupScreen profile={session.profile} onDone={session.refresh} onSignOut={session.signOut} />;
  }

  const setup = <OrgSetupScreen profile={session.profile} onDone={session.refresh} onSignOut={session.signOut} />;

  switch (session.profile.role) {
    case 'hotel_staff':
    case 'admin':
      return session.hotel ? (
        <HotelWorkspace
          profile={session.profile}
          hotel={session.hotel}
          onSignOut={session.signOut}
          onHotelUpdated={session.refresh}
        />
      ) : (
        setup
      );

    case 'chapter_assignor':
      return session.chapter ? (
        <ChapterApp profile={session.profile} chapter={session.chapter} onSignOut={session.signOut} />
      ) : (
        setup
      );

    case 'student':
      return <StudentApp profile={session.profile} onSignOut={session.signOut} />;

    default:
      return <AuthScreen />;
  }
}

function AccountProblem({
  colors,
  message,
  onSignOut,
}: {
  colors: Palette;
  message: string | null;
  onSignOut: () => Promise<void>;
}) {
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <Text style={[styles.errorTitle, { color: colors.text }]}>Can’t load your account</Text>
      <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
        {message ??
          'This account has no profile row yet. If the database migrations have not been run, see SETUP.md.'}
      </Text>
      <SecondaryButton title="Sign out" onPress={onSignOut} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Root />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorTitle: { fontSize: 22, fontWeight: '800', marginBottom: spacing.sm, textAlign: 'center' },
  errorBody: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: spacing.lg },
});
