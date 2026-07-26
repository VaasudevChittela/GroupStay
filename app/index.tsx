import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GroupStay</Text>
      <Text style={styles.subtitle}>Hotel check-in for groups</Text>

      <View style={styles.buttonsContainer}>
        <Pressable style={styles.button} onPress={() => router.push('/create-trip')}>
          <Text style={styles.buttonText}>I'm an Advisor</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => router.push('/join-trip')}>
          <Text style={styles.buttonText}>I'm a Student</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => router.push('/login')}>
          <Text style={styles.buttonText}>I'm Hotel Staff</Text>
        </Pressable>
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
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: '#1A56A0',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#333333',
    textAlign: 'center',
    marginBottom: 32,
  },
  buttonsContainer: {
    width: '100%',
    gap: 16,
  },
  button: {
    backgroundColor: '#1A56A0',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});