import { Linking, Platform, Share, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../lib/alert';
import { joinLink } from '../lib/links';
import { colors } from '../lib/theme';
import { Trip } from '../lib/types';
import { BackButton, Page } from '../components/ui';
import QrCode from '../components/QrCode';
import { styles } from '../styles';

// Ways to get students into the trip without typing the code: scan, tap a link, or get a text.
export default function InviteScreen({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  const link = joinLink(trip.trip_code);
  const message = `Join our trip "${trip.name}" on GroupStay: ${link} (code ${trip.trip_code}). Only for ${trip.school ?? 'our school'} students.`;

  const copy = async () => {
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        showAlert('Link copied', 'Paste it into an email, group chat, or your class page.');
        return;
      }
    } catch {}
    await Share.share({ message });
  };

  const text = () => Linking.openURL(`sms:?&body=${encodeURIComponent(message)}`);
  const email = () => Linking.openURL(`mailto:?subject=${encodeURIComponent(`Join ${trip.name} on GroupStay`)}&body=${encodeURIComponent(message)}`);

  const button = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void) => (
    <TouchableOpacity style={[styles.secondaryButton, { flexDirection: 'row', justifyContent: 'center', gap: 8, flexGrow: 1, flexBasis: '45%' }]} onPress={onPress}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Invite Students</Text>
      <Text style={styles.pageSubtitle}>{`Students scan this or tap the link, sign up, and land on ${trip.name}. It only works for ${trip.school ?? 'your school'}.`}</Text>

      <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
        <QrCode value={link} size={220} />
        <Text style={[styles.label, { marginTop: 16, marginBottom: 2 }]}>Trip code</Text>
        <Text style={[styles.cardTitle, { fontSize: 28, letterSpacing: 4 }]}>{trip.trip_code}</Text>
        <Text style={[styles.mutedText, { textAlign: 'center' }]} selectable>
          {link}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {button('link-outline', 'Copy Link', copy)}
        {button('chatbubble-ellipses-outline', 'Text It', text)}
        {button('mail-outline', 'Email It', email)}
        {button('share-outline', 'Share', () => Share.share({ message }))}
      </View>
      <Text style={[styles.mutedText, { marginTop: 4 }]}>Tip: put the QR code on a slide at your trip meeting so everyone can scan it at once.</Text>
    </Page>
  );
}
