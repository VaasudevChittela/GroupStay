import { StatusBar } from 'expo-status-bar';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { Gender, GENDERS, Role, ROLES } from '../lib/types';
import { colors, photos } from '../lib/theme';
import { Hero, OptionPicker, Page } from '../components/ui';
import { styles } from '../styles';

interface SignupScreenProps {
  roleHint?: Role | null;
  onLogin: () => void;
}

export default function SignupScreen({ roleHint, onLogin }: SignupScreenProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [school, setSchool] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [role, setRole] = useState<Role>(roleHint ?? 'Student');
  const [loading, setLoading] = useState(false);

  const isStudentTier = role === 'Student' || role === 'Chaperone';
  const needsSchool = role !== 'Hotel Staff' && role !== 'Parent';

  const handleSignUp = async () => {
    if (!fullName.trim() || !email.trim() || !password) {
      showAlert('Missing fields', 'Please enter your name, email, and password.');
      return;
    }
    if (needsSchool && !school.trim()) {
      showAlert('Missing school', 'Please enter your school.');
      return;
    }
    if (isStudentTier && (!phone.trim() || !gender)) {
      showAlert('Missing fields', 'Students and chaperones need a phone number and gender for room matching.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role,
          phone: phone.trim(),
          gender,
          school: needsSchool ? school.trim() : '',
        },
      },
    });
    setLoading(false);

    if (error) {
      // A paused free-tier Supabase project answers with a 521 / network error here.
      showAlert('Sign up failed', errorMessage(error));
      return;
    }

    if (!data.session) {
      showAlert('Check your email', 'Confirm your email address, then log in.');
      onLogin();
    }
    // With a session, App.tsx opens the right dashboard automatically.
  };

  return (
    <Page hero={<Hero image={photos.friends} eyebrow="GroupStay" title="Create your account" subtitle="It takes a minute. Your advisor gives you the trip code." onBack={onLogin} backLabel="Log In" height={260} />}>
      <View style={styles.card}>
        <Text style={styles.label}>I am a…</Text>
        <OptionPicker options={ROLES} value={role} onChange={setRole} />

        <Text style={styles.label}>About you</Text>
        <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={colors.faint} value={fullName} onChangeText={setFullName} />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.faint}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password (6+ characters)"
          placeholderTextColor={colors.faint}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder={isStudentTier ? 'Phone number' : 'Phone number (optional)'}
          placeholderTextColor={colors.faint}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        {needsSchool && (
          <TextInput style={styles.input} placeholder="School" placeholderTextColor={colors.faint} value={school} onChangeText={setSchool} />
        )}
        {isStudentTier && (
          <>
            <Text style={styles.label}>Gender (used to match rooms)</Text>
            <OptionPicker options={GENDERS} value={gender} onChange={setGender} />
          </>
        )}

        <TouchableOpacity style={[styles.button, { marginTop: 4 }]} onPress={handleSignUp} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Signing Up...' : 'Create Account'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onLogin} style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Text style={styles.mutedText}>
            Already have an account? <Text style={styles.backText}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </View>

      <StatusBar style="light" />
    </Page>
  );
}
