import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TextInput, View, Pressable, TouchableOpacity } from 'react-native';
import { Alert } from '../lib/alert';
import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface LoginScreenProps {
  navigation: any;
}

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Login failed', error.message);
      return;
    }

    Alert.alert('Logged in', 'Welcome back to GroupStay!');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>GroupStay</Text>

      <View style={styles.form}>
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
        <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Logging In...' : 'Log In'}</Text>
        </Pressable>
        <TouchableOpacity onPress={() => navigation.navigate('signup')}>
          <Text style={styles.linkText}>Sign Up</Text>
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