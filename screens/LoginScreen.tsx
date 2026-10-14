import { StatusBar } from 'expo-status-bar';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { supabase, isDemoMode } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { DEMO_ACCOUNTS } from '../lib/demoSeed';
import { Role } from '../lib/types';
import { colors, photos } from '../lib/theme';
import { Hero, Page } from '../components/ui';
import { styles } from '../styles';

interface LoginScreenProps {
  roleHint?: Role | null;
  // Set when the app was opened from a trip invite link.
  joinCode?: string | null;
  onSignup: () => void;
  onBack: () => void;
}

export default function LoginScreen({ roleHint, joinCode, onSignup, onBack }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Missing fields', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      showAlert('Login failed', errorMessage(error));
    }
    // On success App.tsx hears the auth change and opens the right dashboard.
  };

  const who = roleHint === 'Hotel Staff' ? 'hotel staff' : roleHint === 'Advisor' ? 'an advisor' : roleHint ? `a ${roleHint.toLowerCase()}` : '';

  return (
    <Page hero={<Hero image={photos.friends} eyebrow="GroupStay" title="Welcome back" subtitle={joinCode ? `Log in or sign up to join trip ${joinCode}.` : who ? `Log in as ${who}.` : 'Log in to your trip.'} onBack={onBack} height={260} />}>
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@school.org"
          placeholderTextColor={colors.faint}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.faint}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
        />
        <TouchableOpacity style={[styles.button, { marginTop: 4 }]} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Logging In...' : 'Log In'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSignup} style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Text style={styles.mutedText}>
            No account? <Text style={styles.backText}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>

      {isDemoMode && (
        <View style={[styles.card, { backgroundColor: colors.primarySoft, shadowOpacity: 0 }]}>
          <Text style={styles.label}>Demo mode: tap an account to fill it in</Text>
          <View style={styles.actionRow}>
            {DEMO_ACCOUNTS.map((account) => (
              <TouchableOpacity
                key={account.email}
                style={{ backgroundColor: colors.card, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 }}
                onPress={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
              >
                <Text style={{ color: colors.primaryDark, fontWeight: '700', fontSize: 13 }}>{account.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <StatusBar style="light" />
    </Page>
  );
}
