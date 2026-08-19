import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TextInput, View, Pressable, TouchableOpacity } from 'react-native';
import { Alert } from '../lib/alert';
import { useState } from 'react';
import { supabase } from '../lib/supabase';

const roles = ['Advisor', 'Student', 'Hotel Staff'] as const;

type Role = (typeof roles)[number];

interface SignupScreenProps {
  navigation: any;
}

export default function SignupScreen({ navigation }: SignupScreenProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('Student');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!fullName || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields to sign up.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
        },
      },
    });
    setLoading(false);

    if (error) {
      Alert.alert('Sign up failed', error.message);
      return;
    }

    Alert.alert('Sign up successful', 'Please check your email for confirmation instructions.');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>GroupStay</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor="#9CA3AF"
          value={fullName}
          onChangeText={setFullName}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#9CA3AF"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <View style={styles.roleContainer}>
          {roles.map((option) => {
            const selected = option === role;
            return (
              <Pressable
                key={option}
                style={[styles.roleOption, selected && styles.roleOptionSelected]}
                onPress={() => setRole(option)}
              >
                <Text style={[styles.roleText, selected && styles.roleTextSelected]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable style={styles.button} onPress={handleSignUp} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Signing Up...' : 'Sign Up'}</Text>
        </Pressable>
        <TouchableOpacity onPress={() => navigation.navigate('login')}>
          <Text style={styles.linkText}>Back to Log In</Text>
        </TouchableOpacity>
      </View>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 24,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1A56A0',
    textAlign: 'center',
    marginBottom: 32,
  },
  form: {
    width: '100%',
    gap: 16,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  roleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
  },
  roleOptionSelected: {
    backgroundColor: '#1A56A0',
    borderColor: '#1A56A0',
  },
  roleText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '500',
  },
  roleTextSelected: {
    color: '#ffffff',
  },
  button: {
    backgroundColor: '#1A56A0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    color: '#1A56A0',
    textAlign: 'center',
    fontSize: 15,
    marginTop: 16,
  },
});