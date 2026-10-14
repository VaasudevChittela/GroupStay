import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableWithoutFeedback, View, TextInput, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { styles } from '../styles';
import { BackButton } from '../components/ui';
import { notify, notifyGuests } from '../lib/notify';

type ThreadType = { id: string; name: string; canPost: boolean };
type MessageItem = { id: number; sender_name: string; sender_role: string; content: string; created_at: string; pinned?: boolean };

export default function MessagesScreen({ onBack, role, tripId, guestId, advisorName }: { onBack: () => void; role: 'advisor' | 'student'; tripId: number; guestId?: number; advisorName?: string }) {
  const [threads, setThreads] = useState<ThreadType[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadType | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [senderName, setSenderName] = useState('');
  const listRef = useRef<ScrollView>(null);

  const loadThreads = async () => {
    const [schoolsRes, roomsRes] = await Promise.all([
      supabase.from('guests').select('school').eq('trip_id', tripId),
      supabase.from('rooms').select('id, room_number').eq('trip_id', tripId),
    ]);

    const schools = [...new Set(schoolsRes.data?.map(g => g.school) ?? [])];
    const rooms = roomsRes.data ?? [];

    let userSchool = '';
    let userRoomId = null;

    if (role === 'student' && guestId) {
      const [guestRes, assignRes] = await Promise.all([
        supabase.from('guests').select('legal_name, school').eq('id', guestId).single(),
        supabase.from('assignments').select('room_id').eq('guest_id', guestId).maybeSingle(),
      ]);
      setSenderName(guestRes.data?.legal_name ?? 'Student');
      userSchool = guestRes.data?.school ?? '';
      userRoomId = assignRes.data?.room_id ?? null;
    } else {
      setSenderName(advisorName || 'Advisor');
    }

    const threadList: Array<{ id: string; name: string; canPost: boolean }> = [
      { id: `everyone-${tripId}`, name: 'Everyone', canPost: role === 'advisor' },
    ];

    if (role === 'advisor') {
      schools.forEach(school => {
        threadList.push({ id: `school-${school}-${tripId}`, name: `${school}`, canPost: true });
      });
      rooms.forEach(room => {
        threadList.push({ id: `room-${room.id}`, name: `Room ${room.room_number}`, canPost: true });
      });
    } else {
      if (userSchool) {
        threadList.push({ id: `school-${userSchool}-${tripId}`, name: `${userSchool}`, canPost: false });
      }
      if (userRoomId) {
        const room = rooms.find(r => r.id === userRoomId);
        if (room) {
          threadList.push({ id: `room-${room.id}`, name: `Room ${room.room_number}`, canPost: true });
        }
      }
    }

    setThreads(threadList);
    if (threadList.length > 0) {
      setSelectedThread(threadList[0]);
    }
  };

  const loadMessages = async () => {
    if (!selectedThread) return;
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_name, sender_role, content, created_at, pinned')
      .eq('thread_id', selectedThread.id)
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      return;
    }
    setMessages(data ?? []);
  };

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    if (selectedThread) {
      loadMessages();
    }
  }, [selectedThread]);

  useEffect(() => {
    if (selectedThread) {
      const interval = setInterval(loadMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedThread]);

  const handleSend = async () => {
    if (!selectedThread || !newMessage.trim() || !selectedThread.canPost) return;

    setSending(true);
    const { error } = await supabase
      .from('messages')
      .insert({
        thread_id: selectedThread.id,
        sender_name: senderName,
        sender_role: role,
        content: newMessage.trim(),
        trip_id: tripId,
      });

    setSending(false);
    if (error) {
      showAlert('Error', errorMessage(error));
      return;
    }
    setNewMessage('');
    loadMessages();
    await notifyRecipients(selectedThread, newMessage.trim());
  };

  // Pinned "Everyone" messages show as announcements on student and parent dashboards.
  const togglePin = async (msg: MessageItem) => {
    const { error } = await supabase.from('messages').update({ pinned: !msg.pinned }).eq('id', msg.id);
    if (error) {
      showAlert('Error', errorMessage(error));
      return;
    }
    loadMessages();
  };

  // Tell everyone who can read this thread (except the sender) that there's a new message.
  const notifyRecipients = async (thread: ThreadType, content: string) => {
    const preview = content.length > 80 ? `${content.slice(0, 77)}...` : content;
    const title = `Message from ${senderName}`;
    let guestIds: number[] = [];
    if (thread.id.startsWith('room-')) {
      const roomId = Number(thread.id.slice('room-'.length));
      const { data } = await supabase.from('assignments').select('guest_id').eq('room_id', roomId);
      guestIds = (data ?? []).map((a) => a.guest_id);
      if (role === 'student') await notify(tripId, 'advisor', title, `${thread.name}: ${preview}`, null, 'messages');
    } else {
      const { data } = await supabase.from('guests').select('id').eq('trip_id', tripId);
      guestIds = (data ?? []).map((g) => g.id);
    }
    await notifyGuests(tripId, guestIds.filter((id) => id !== guestId), title, `${thread.name}: ${preview}`, 'messages');
  };

  return (
    <View style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', paddingTop: 48, paddingHorizontal: 24, paddingBottom: 24 }}>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Messages</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.threadSelector}>
        {threads.map((thread) => (
          <TouchableOpacity
            key={thread.id}
            style={selectedThread?.id === thread.id ? [styles.threadTab, styles.threadTabSelected] : styles.threadTab}
            onPress={() => setSelectedThread(thread)}
          >
            <Text style={selectedThread?.id === thread.id ? [styles.threadTabText, styles.threadTabTextSelected] : styles.threadTabText}>
              {thread.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        ref={listRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.length === 0 && <Text style={styles.mutedText}>No messages yet.</Text>}
        {messages.map((msg) => (
          <View key={msg.id} style={styles.messageRow}>
            <Text style={styles.messageSender}>{msg.sender_name} ({msg.sender_role})</Text>
            <Text style={styles.messageContent}>{msg.content}</Text>
            <Text style={styles.messageTime}>{`${new Date(msg.created_at).toLocaleString()}${msg.pinned ? ' · 📌 Pinned announcement' : ''}`}</Text>
            {role === 'advisor' && selectedThread?.id.startsWith('everyone-') && (
              <TouchableOpacity onPress={() => togglePin(msg)} style={{ marginTop: 6 }}>
                <Text style={styles.backText}>{msg.pinned ? 'Unpin' : 'Pin as announcement'}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      {selectedThread && !selectedThread.canPost && <Text style={styles.mutedText}>Only advisors can post here.</Text>}
      {selectedThread?.canPost && (
        <View style={styles.messageInputContainer}>
          <TextInput
            style={styles.messageInput}
            placeholder="Type a message..."
            placeholderTextColor="#94A3B8"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={sending || !newMessage.trim()}>
            <Text style={styles.sendButtonText}>{sending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
