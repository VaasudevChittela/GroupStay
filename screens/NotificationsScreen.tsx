import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { showAlert } from '../lib/alert';
import { notificationQuery, NotificationScope } from '../lib/notify';
import { alertsEnabled, alertsSupported, enableAlerts } from '../lib/systemAlerts';
import { timeAgo } from '../lib/format';
import { NotificationItem, NotificationLink } from '../lib/types';
import { BackButton, Badge, Page } from '../components/ui';
import { styles } from '../styles';
import { colors } from '../lib/theme';

type Props = {
  scope: NotificationScope;
  userId: string;
  onBack: () => void;
  // Opens the screen a notification points at. Links a role can't open are ignored.
  onOpen?: (link: NotificationLink, item: NotificationItem) => void;
  openable?: NotificationLink[];
};

export default function NotificationsScreen({ scope, userId, onBack, onOpen, openable = [] }: Props) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertsOn, setAlertsOn] = useState(alertsEnabled());

  useEffect(() => {
    const load = async () => {
      const { data } = await notificationQuery(scope).order('created_at', { ascending: false });
      const rows = (data ?? []) as NotificationItem[];
      setItems(rows);
      setLoading(false);
      // Opening the inbox marks everything as read.
      const unreadIds = rows.filter((row) => !row.read_at).map((row) => row.id);
      if (unreadIds.length) {
        await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
      }
    };
    load();
  }, []);

  const turnOnAlerts = async () => {
    const ok = await enableAlerts(userId);
    setAlertsOn(ok);
    showAlert(
      ok ? 'Alerts on' : 'Alerts blocked',
      ok
        ? 'New updates will pop up while GroupStay is open.'
        : 'Your browser or phone blocked notifications. Allow them for this site in your settings, then try again.',
    );
  };

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Notifications</Text>
      <Text style={styles.pageSubtitle}>Updates about rooms, invites, and your trip. Tap one to open it.</Text>

      {alertsSupported() && !alertsOn && (
        <TouchableOpacity style={[styles.banner, { backgroundColor: colors.primarySoft }]} onPress={turnOnAlerts}>
          <Text style={[styles.bannerText, { color: colors.primaryDark }]}>Get pop-up alerts on this device · Tap to turn on</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <Text style={styles.normalText}>Loading...</Text>
      ) : items.length === 0 ? (
        <Text style={styles.normalText}>Nothing yet.</Text>
      ) : (
        items.map((item) => {
          const canOpen = Boolean(onOpen && item.link && openable.includes(item.link));
          const body = (
            <>
              <View style={styles.rowBetween}>
                {!item.read_at ? <Badge text="NEW" tone="blue" /> : <View />}
                {canOpen && <Text style={styles.backText}>Open ›</Text>}
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardText}>{item.body}</Text>
              <Text style={styles.mutedText}>{timeAgo(item.created_at)}</Text>
            </>
          );
          return canOpen ? (
            <TouchableOpacity key={item.id} style={styles.card} onPress={() => onOpen!(item.link!, item)}>
              {body}
            </TouchableOpacity>
          ) : (
            <View key={item.id} style={styles.card}>
              {body}
            </View>
          );
        })
      )}
    </Page>
  );
}
