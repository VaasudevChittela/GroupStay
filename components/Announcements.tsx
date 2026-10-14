import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/format';
import { colors } from '../lib/theme';
import { styles } from '../styles';

type Pinned = { id: number; sender_name: string; content: string; created_at: string };

// Messages the advisor pinned in the trip's "Everyone" thread.
export default function Announcements({ tripId }: { tripId: number }) {
  const [items, setItems] = useState<Pinned[]>([]);

  useEffect(() => {
    supabase
      .from('messages')
      .select('id, sender_name, content, created_at')
      .eq('trip_id', tripId)
      .eq('thread_id', `everyone-${tripId}`)
      .eq('pinned', true)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => setItems((data ?? []) as Pinned[]));
  }, [tripId]);

  if (items.length === 0) return null;
  return (
    <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: colors.primary }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Ionicons name="megaphone-outline" size={16} color={colors.primary} />
        <Text style={[styles.label, { marginBottom: 0 }]}>Announcements</Text>
      </View>
      {items.map((item) => (
        <View key={item.id} style={{ marginBottom: 6 }}>
          <Text style={styles.cardText}>{item.content}</Text>
          <Text style={styles.mutedText}>{`${item.sender_name} · ${timeAgo(item.created_at)}`}</Text>
        </View>
      ))}
    </View>
  );
}
