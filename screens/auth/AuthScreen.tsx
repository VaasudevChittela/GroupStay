import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { AppRole, ROLE_LABEL } from '../../lib/session';
import { Field, PrimaryButton } from '../../components/ui';

const SIGNUP_ROLES: AppRole[] = ['student', 'chapter_assignor', 'hotel_staff'];

const ROLE_BLURB: Record<AppRole, string> = {
  student: 'See your own reservation, room and digital key.',
  chapter_assignor: 'Manage your chapter’s students and their room assignments.',
  hotel_staff: 'Run your property’s rooms, check-ins and keys.',
  admin: 'Full access.',
};

/**
 * Single entry point for authentication. Every role signs in here — what the
 * account can reach afterwards is decided by the database, not by this screen.
 */
export default function AuthScreen({ onLocalAuth }: { onLocalAuth?: (role: AppRole) => void } = {}) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AppRole>('student');
  const [busy, setBusy] = useState(false);
  // Inline status beats Alert here: react-native-web's Alert is a no-op, and
  // even on native an auth error belongs next to the form, not in a popup.
  const [status, setStatus] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const submit = async () => {
    setStatus(null);

    // No backend configured — authenticate locally against the sample data so
    // the sign-in flow is still walkable end to end.
    if (onLocalAuth) {
      if (!email.trim() || !password) {
        setStatus({ kind: 'error', text: 'Enter an email and password to continue.' });
        return;
      }
      onLocalAuth(role);
      return;
    }

    if (!email.trim() || !password) {
      setStatus({ kind: 'error', text: 'Enter your email and password.' });
      return;
    }
    if (mode === 'signup' && !fullName.trim()) {
      setStatus({ kind: 'error', text: 'Enter your full name.' });
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setStatus({ kind: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    setBusy(true);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setBusy(false);
      if (error) setStatus({ kind: 'error', text: error.message });
      // On success the auth listener in useSession swaps the screen for us.
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), role: ROLE_LABEL[role] } },
    });
    setBusy(false);

    if (error) {
      setStatus({ kind: 'error', text: error.message });
      return;
    }

    if (data.session) {
      // Signed in immediately — routing happens automatically.
      setStatus({ kind: 'info', text: 'Account created. Setting things up…' });
      return;
    }

    // Email confirmation is switched on for this project.
    setMode('signin');
    setPassword('');
    setStatus({
      kind: 'info',
      text: `We sent a confirmation link to ${email.trim()}. Confirm it, then sign in here.`,
    });
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.wordmark, { color: colors.tint }]}>GroupStay</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            Room management and digital keys for group travel
          </Text>

          {onLocalAuth ? (
            <View style={[styles.localNote, { backgroundColor: colors.neutralSoft, borderColor: colors.border }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
                No backend configured, so any email and password will sign you in. Pick the role you want to see.
              </Text>
            </View>
          ) : null}

          <View style={[styles.segment, { backgroundColor: colors.neutralSoft, borderColor: colors.border }]}>
            {(['signin', 'signup'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.segmentItem, mode === m && { backgroundColor: colors.surface }]}
                onPress={() => {
                  setMode(m);
                  setStatus(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: mode === m ? colors.text : colors.textSecondary, fontWeight: '700', fontSize: 14 }}>
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'signup' && (
            <Field placeholder="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
          )}
          <Field
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />

          {(mode === 'signup' || onLocalAuth) && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>I AM A</Text>
              {SIGNUP_ROLES.map((option) => {
                const selected = option === role;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.roleCard,
                      {
                        backgroundColor: selected ? colors.tintSoft : colors.surface,
                        borderColor: selected ? colors.tint : colors.border,
                      },
                    ]}
                    onPress={() => setRole(option)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.radio, { borderColor: selected ? colors.tint : colors.border }]}>
                      {selected ? <View style={[styles.radioDot, { backgroundColor: colors.tint }]} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{ROLE_LABEL[option]}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                        {ROLE_BLURB[option]}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {status && (
            <View
              style={[
                styles.status,
                {
                  backgroundColor: status.kind === 'error' ? colors.dangerSoft : colors.tintSoft,
                  borderColor: status.kind === 'error' ? colors.danger : colors.tint,
                },
              ]}
            >
              <Text style={{ color: status.kind === 'error' ? colors.danger : colors.tint, fontSize: 14, fontWeight: '600' }}>
                {status.text}
              </Text>
            </View>
          )}

          <PrimaryButton
            title={busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            onPress={submit}
            disabled={busy}
            style={{ marginTop: spacing.lg }}
          />

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  wordmark: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' },
  tagline: { fontSize: 15, textAlign: 'center', marginTop: 6, marginBottom: spacing.xl },
  segment: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    marginBottom: spacing.lg,
  },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginTop: spacing.md, marginBottom: spacing.sm },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  status: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  localNote: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
