import { useState } from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { errorMessage, showAlert } from '../lib/alert';
import { checkBedCount } from '../lib/beds';
import { Gender, GENDERS, Trip } from '../lib/types';
import { BackButton, OptionPicker, Page } from '../components/ui';
import { styles } from '../styles';

type NewPerson = { legal_name: string; email: string; phone: string; gender: Gender | null; is_chaperone: boolean };

// Turns pasted spreadsheet rows (comma- or tab-separated) into people:
// Name, Email, Phone, Gender, Role. Only the name is required.
function parseRoster(text: string): { people: NewPerson[]; skipped: number } {
  const people: NewPerson[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split(line.includes('\t') ? '\t' : ',').map((c) => c.trim());
    if (cells[0].toLowerCase() === 'name') continue; // header row
    if (!cells[0]) {
      skipped++;
      continue;
    }
    const g = (cells[3] ?? '').toLowerCase();
    const gender: Gender | null = g.startsWith('m') ? 'Male' : g.startsWith('f') ? 'Female' : g ? 'Other' : null;
    people.push({
      legal_name: cells[0],
      email: (cells[1] ?? '').toLowerCase(),
      phone: cells[2] ?? '',
      gender,
      is_chaperone: /chap|adult|teacher/i.test(cells[4] ?? ''),
    });
  }
  return { people, skipped };
}

export default function AddStudentsScreen({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [isChaperone, setIsChaperone] = useState(false);
  const [pasted, setPasted] = useState('');
  const [saving, setSaving] = useState(false);

  const addPeople = async (people: NewPerson[]) => {
    const { data: existing } = await supabase.from('guests').select('email, legal_name').eq('trip_id', trip.id);
    const taken = new Set((existing ?? []).map((g) => (g.email || g.legal_name).toLowerCase()));
    const fresh = people.filter((p) => !taken.has((p.email || p.legal_name).toLowerCase()));
    if (fresh.length === 0) return { added: 0, duplicates: people.length };
    const { error } = await supabase.from('guests').insert(
      fresh.map((p) => ({
        trip_id: trip.id,
        user_id: null,
        legal_name: p.legal_name,
        email: p.email || null,
        phone: p.phone || null,
        school: trip.school ?? '',
        gender: p.gender,
        is_chaperone: p.is_chaperone,
      })),
    );
    if (error) throw error;
    await checkBedCount(trip.id);
    return { added: fresh.length, duplicates: people.length - fresh.length };
  };

  const handleAddOne = async () => {
    if (!name.trim()) {
      showAlert('Missing name', "Enter the person's name.");
      return;
    }
    setSaving(true);
    try {
      const { added } = await addPeople([
        { legal_name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), gender: gender || null, is_chaperone: isChaperone },
      ]);
      if (added === 0) {
        showAlert('Already on the trip', `${name.trim()} is already on this trip.`);
      } else {
        showAlert('Added', `${name.trim()} is on the trip. If they sign up with ${email.trim() || 'their email'} and enter code ${trip.trip_code}, the app links them to this entry.`);
        setName('');
        setEmail('');
        setPhone('');
        setGender('');
        setIsChaperone(false);
      }
    } catch (error) {
      showAlert('Could not add', errorMessage(error));
    }
    setSaving(false);
  };

  const preview = parseRoster(pasted);

  const handleImport = async () => {
    if (preview.people.length === 0) {
      showAlert('Nothing to import', 'Paste rows like: Name, Email, Phone, Gender, Role');
      return;
    }
    setSaving(true);
    try {
      const { added, duplicates } = await addPeople(preview.people);
      showAlert('Import done', `Added ${added} ${added === 1 ? 'person' : 'people'}${duplicates ? `, skipped ${duplicates} already on the trip` : ''}.`);
      if (added) setPasted('');
    } catch (error) {
      showAlert('Import failed', errorMessage(error));
    }
    setSaving(false);
  };

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>Add Students</Text>
      <Text style={styles.pageSubtitle}>{`Add people to ${trip.name} yourself. When they sign up and enter code ${trip.trip_code}, the app links their account by email.`}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add one person</Text>
        <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#94A3B8" value={name} onChangeText={setName} />
        <TextInput
          style={styles.input}
          placeholder="Email (to link their account later)"
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput style={styles.input} placeholder="Phone (optional)" placeholderTextColor="#94A3B8" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
        <Text style={styles.label}>Gender</Text>
        <OptionPicker options={GENDERS} value={gender} onChange={setGender} />
        <View style={[styles.switchRow, { marginBottom: 12 }]}>
          <Text style={styles.cardText}>Chaperone</Text>
          <Switch value={isChaperone} onValueChange={setIsChaperone} />
        </View>
        <TouchableOpacity style={styles.button} onPress={handleAddOne} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Add Person'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Import from a spreadsheet</Text>
        <Text style={styles.mutedText}>Copy rows from Excel or Google Sheets and paste them here. Columns: Name, Email, Phone, Gender, Role (Student or Chaperone).</Text>
        <TextInput
          style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
          placeholder={'Jamie Park, jamie@school.org, 555-0101, Female, Student\nChris Lee, chris@school.org, 555-0102, Male, Chaperone'}
          placeholderTextColor="#94A3B8"
          multiline
          value={pasted}
          onChangeText={setPasted}
          autoCapitalize="none"
        />
        {pasted.trim() ? (
          <Text style={styles.mutedText}>{`${preview.people.length} ${preview.people.length === 1 ? 'person' : 'people'} ready to import${preview.skipped ? `, ${preview.skipped} rows skipped (no name)` : ''}`}</Text>
        ) : null}
        <TouchableOpacity style={styles.button} onPress={handleImport} disabled={saving || preview.people.length === 0}>
          <Text style={styles.buttonText}>{saving ? 'Importing...' : `Import ${preview.people.length || ''} People`}</Text>
        </TouchableOpacity>
      </View>
    </Page>
  );
}
