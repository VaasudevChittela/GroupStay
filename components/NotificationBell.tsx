import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '../lib/theme';
import {
  NOTIFICATION_LABEL,
  NotificationRow,
  loadNotifications,
  markNotificationRead,
} from '../lib/notifications';
import { EmptyState, SectionTitle } from './ui';
import { AlertIcon } from './icons';

/**
 * The notification inbox. Every queued event lands in the table whether or not
 * the push reached the device, so this list — not the push — is the record of
 * what someone was told.
 */
export default function NotificationBell() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);

  const load = useCallback(async () => {
    setRows(await loadNotifications());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const unread = rows.filter((r) => !r.read_at).length;

  const openInbox = async () => {
    setOpen(true);
    await load();
  };

  return (
    <>
      <TouchableOpacity
        onPress={openInbox}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.bellWrap}
      >
        <AlertIcon size={20} color={colors.textSecondary} />
        {unread > 0 ? (
          <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.background }]}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
            {rows.length === 0 ? (
              <EmptyState
                icon={<AlertIcon size={26} color={colors.textTertiary} />}
                title="Nothing yet"
                subtitle="Room assignments, key updates and requests show up here."
              />
            ) : (
              rows.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  activeOpacity={0.75}
                  onPress={async () => {
                    if (row.read_at) return;
                    await markNotificationRead(row.id);
                    await load();
                  }}
                  style={[
                    styles.row,
                    {
                      backgroundColor: row.read_at ? colors.surface : colors.tintSoft,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.kind, { color: colors.tint }]}>
                    {NOTIFICATION_LABEL[row.type] ?? row.type}
                  </Text>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{row.title}</Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>{row.body}</Text>
                  <Text style={[styles.when, { color: colors.textTertiary }]}>
                    {new Date(row.created_at).toLocaleString()}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellWrap: { padding: 4 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  row: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.sm },
  kind: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  rowTitle: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  body: { fontSize: 14, marginTop: 3, lineHeight: 19 },
  when: { fontSize: 11.5, marginTop: 8 },
});
