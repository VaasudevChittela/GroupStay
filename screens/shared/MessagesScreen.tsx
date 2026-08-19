import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert } from '../../lib/alert';
import { radius, spacing, useTheme } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { AppRole } from '../../lib/session';
import { EmptyState, SectionTitle } from '../../components/ui';
import { SearchIcon } from '../../components/icons';

type Thread = { id: string; name: string; canPost: boolean };
type Message = {
  id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  created_at: string;
};

/**
 * Trip messaging, restored from the pre-RBAC app and re-scoped.
 *
 * Threads are derived from what the caller is actually allowed to read: an
 * assignor sees a thread per school and per room in their chapter's block, a
 * student sees only "Everyone" plus their own room. Row level security on the
 * messages table backs this up, so a hand-crafted request for another trip's
 * thread returns nothing.
 */
export default function MessagesScreen({
  role,
  tripId,
  guestId,
  senderName,
  onBack,
}: {
  role: AppRole;
  tripId: string;
  guestId?: string | null;
  senderName: string;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const canModerate = role === 'chapter_assignor' || role === 'hotel_staff' || role === 'admin';

  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [missingTable, setMissingTable] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildThreads = useCallback(async () => {
    const [guestsRes, roomsRes] = await Promise.all([
      supabase.from('guests').select('school').eq('trip_id', tripId),
      supabase.from('rooms').select('id, room_number').eq('trip_id', tripId),
    ]);

    const rooms = roomsRes.data ?? [];
    const list: Thread[] = [{ id: `everyone-${tripId}`, name: 'Everyone', canPost: canModerate }];

    if (canModerate) {
      const schools = [...new Set((guestsRes.data ?? []).map((g: any) => g.school).filter(Boolean))];
      schools.forEach((school) => {
        list.push({ id: `school-${school}-${tripId}`, name: `${school}`, canPost: true });
      });
      rooms.forEach((room: any) => {
        list.push({ id: `room-${room.id}`, name: `Room ${room.room_number}`, canPost: true });
      });
    } else if (guestId) {
      // A student only gets rooms they can actually see, which RLS limits to theirs.
      rooms.forEach((room: any) => {
        list.push({ id: `room-${room.id}`, name: `Room ${room.room_number}`, canPost: true });
      });
    }

    setThreads(list);
    setSelected((current) => current ?? list[0] ?? null);
  }, [tripId, guestId, canModerate]);

  const loadMessages = useCallback(async () => {
    if (!selected) return;
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_name, sender_role, content, created_at')
      .eq('thread_id', selected.id)
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      if (error.code === 'PGRST205') setMissingTable(true);
      return;
    }
    setMissingTable(false);
    setMessages((data ?? []) as Message[]);
  }, [selected, tripId]);

  useEffect(() => {
    buildThreads();
  }, [buildThreads]);

  useEffect(() => {
    loadMessages();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(loadMessages, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadMessages]);

  const send = async () => {
    if (!selected || !draft.trim() || !selected.canPost) return;
    setSending(true);
    const { error } = await supabase.from('messages').insert({
      thread_id: selected.id,
      sender_name: senderName,
      sender_role: role,
      content: draft.trim(),
      trip_id: tripId,
    });
    setSending(false);

    if (error) {
      Alert.alert('Could not send', error.message);
      return;
    }
    setDraft('');
    loadMessages();
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 15 }}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Messages</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.threadBar}
          contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.lg }}
        >
          {threads.map((thread) => {
            const active = selected?.id === thread.id;
            return (
              <TouchableOpacity
                key={thread.id}
                style={[
                  styles.threadTab,
                  {
                    backgroundColor: active ? colors.tint : colors.surface,
                    borderColor: active ? colors.tint : colors.border,
                  },
                ]}
                onPress={() => setSelected(thread)}
              >
                <Text style={{ color: active ? colors.onTint : colors.text, fontWeight: '700', fontSize: 13 }}>
                  {thread.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {missingTable ? (
          <EmptyState
            icon={<SearchIcon size={26} color={colors.textTertiary} />}
            title="Messaging table missing"
            subtitle="This project has no messages table. Create one with thread_id, trip_id, sender_name, sender_role and content columns to enable messaging."
          />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={26} color={colors.textTertiary} />}
            title="No messages yet"
            subtitle={selected?.canPost ? 'Start the conversation below.' : 'Messages from your advisor appear here.'}
          />
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
            {messages.map((message) => (
              <View
                key={message.id}
                style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 13 }}>
                  {message.sender_name}
                  <Text style={{ color: colors.textTertiary, fontWeight: '600' }}>
                    {'  '}
                    {message.sender_role.replace('_', ' ')}
                  </Text>
                </Text>
                <Text style={{ color: colors.text, fontSize: 15, marginTop: 4 }}>{message.content}</Text>
                <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 6 }}>
                  {new Date(message.created_at).toLocaleString()}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        {selected?.canPost && !missingTable && (
          <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.neutralSoft, borderColor: colors.border, color: colors.text }]}
              placeholder="Message"
              placeholderTextColor={colors.textTertiary}
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <TouchableOpacity
              style={[styles.send, { backgroundColor: draft.trim() ? colors.tint : colors.neutralSoft }]}
              onPress={send}
              disabled={sending || !draft.trim()}
            >
              <Text style={{ color: draft.trim() ? colors.onTint : colors.textTertiary, fontWeight: '700' }}>
                {sending ? '…' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '800' },
  threadBar: { flexGrow: 0, marginBottom: spacing.sm },
  threadTab: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  list: { flex: 1 },
  bubble: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  send: { borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12 },
});
