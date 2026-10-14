import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertRequest, subscribeToAlerts } from '../lib/alert';
import { colors, fs, themed } from '../lib/theme';

export default function AlertHost() {
  const [queue, setQueue] = useState<AlertRequest[]>([]);

  useEffect(() => subscribeToAlerts((alert) => setQueue((prev) => [...prev, alert])), []);

  const styles = getStyles();
  const current = queue[0];
  if (!current) return null;

  const close = (onPress?: () => void) => {
    setQueue((prev) => prev.slice(1));
    onPress?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(current.buttons.find((b) => b.style === 'cancel')?.onPress)}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          <View style={styles.buttonRow}>
            {current.buttons.map((button) => (
              <Pressable
                key={button.text}
                style={[
                  styles.button,
                  button.style === 'cancel' && styles.cancelButton,
                  button.style === 'destructive' && styles.destructiveButton,
                ]}
                onPress={() => close(button.onPress)}
              >
                <Text style={[styles.buttonText, button.style === 'cancel' && styles.cancelText]}>{button.text}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = themed(() =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    box: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.card,
      borderRadius: 22,
      padding: 24,
    },
    title: {
      fontSize: fs(20),
      fontWeight: '800',
      color: colors.ink,
      marginBottom: 8,
      textAlign: 'center',
    },
    message: {
      fontSize: fs(16),
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
      lineHeight: fs(22),
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 16,
    },
    button: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.cardAlt,
    },
    destructiveButton: {
      backgroundColor: colors.danger,
    },
    buttonText: {
      color: colors.white,
      fontSize: fs(16),
      fontWeight: '700',
    },
    cancelText: {
      color: colors.ink,
    },
  }),
);
