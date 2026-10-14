import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { confirmAction, errorMessage, showAlert } from '../lib/alert';
import { notify, notifyGuests } from '../lib/notify';
import { canUseRoom, isTripLocked } from '../lib/rooms';
import { logRoomChanges } from '../lib/history';
import { Guest, GUEST_COLUMNS, GUEST_DETAILS_COLUMNS, GuestDetails, Room, ROOM_COLUMNS, RoomRequest, Trip } from '../lib/types';
import { BackButton, Badge, Page, SmallButton } from '../components/ui';
import { styles } from '../styles';
import { colors } from '../lib/theme';

type Props = { me: Guest; trip: Trip; onBack: () => void };

// Students pick their own rooms (same school, same gender) until the advisor locks the trip.
export default function RoomsScreen({ me, trip, onBack }: Props) {
  const [locked, setLocked] = useState(Boolean(trip.locked_at));
  const [separate, setSeparate] = useState(trip.separate_chaperones);
  const [details, setDetails] = useState<Map<number, GuestDetails>>(new Map());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [roomOf, setRoomOf] = useState<Map<number, number>>(new Map());
  const [requests, setRequests] = useState<RoomRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [tripRes, roomRes, guestRes, assignmentRes, requestRes] = await Promise.all([
      supabase.from('trips').select('locked_at, lock_deadline, separate_chaperones').eq('id', trip.id).maybeSingle(),
      supabase.from('rooms').select(ROOM_COLUMNS).eq('trip_id', trip.id).order('room_number', { ascending: true }),
      supabase.from('guests').select(GUEST_COLUMNS).eq('trip_id', trip.id).order('legal_name', { ascending: true }),
      supabase.from('assignments').select('guest_id, room_id').eq('trip_id', trip.id),
      supabase.from('room_requests').select('id, trip_id, room_id, guest_id, from_guest_id, kind, status, created_at').eq('trip_id', trip.id).eq('status', 'pending'),
    ]);
    const error = tripRes.error || roomRes.error || guestRes.error || assignmentRes.error || requestRes.error;
    if (error) showAlert('Error', errorMessage(error));
    const deadlinePassed = Boolean(tripRes.data?.lock_deadline && new Date(tripRes.data.lock_deadline).getTime() <= Date.now());
    setLocked(Boolean(tripRes.data?.locked_at) || deadlinePassed);
    setSeparate(Boolean(tripRes.data?.separate_chaperones));
    if (me.is_chaperone) {
      // Chaperones see their room's emergency contacts and medical notes.
      const { data: detailRows } = await supabase.from('guest_details').select(GUEST_DETAILS_COLUMNS).eq('trip_id', trip.id);
      setDetails(new Map(((detailRows ?? []) as GuestDetails[]).map((d) => [d.guest_id, d])));
    }
    setRooms((roomRes.data ?? []) as Room[]);
    setGuests((guestRes.data ?? []) as Guest[]);
    setRoomOf(new Map((assignmentRes.data ?? []).map((row) => [row.guest_id, row.room_id])));
    setRequests((requestRes.data ?? []) as RoomRequest[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const guestById = new Map(guests.map((guest) => [guest.id, guest]));
  const occupantsOf = (roomId: number) => guests.filter((guest) => roomOf.get(guest.id) === roomId);
  const myRoomId = roomOf.get(me.id) ?? null;
  const myRoom = rooms.find((room) => room.id === myRoomId) ?? null;
  const roommates = myRoom ? occupantsOf(myRoom.id).filter((guest) => guest.id !== me.id) : [];
  const nameOf = (guestId: number | null) => (guestId ? guestById.get(guestId)?.legal_name ?? 'Someone' : 'Someone');
  const roomNumber = (roomId: number) => rooms.find((room) => room.id === roomId)?.room_number ?? '?';
  const hasSpace = (room: Room) => occupantsOf(room.id).length < room.capacity;

  const myInvites = requests.filter((r) => r.kind === 'invite' && r.guest_id === me.id);
  const myOutgoingRequests = requests.filter((r) => r.kind === 'request' && r.guest_id === me.id);
  const requestsToMyRoom = myRoom ? requests.filter((r) => r.kind === 'request' && r.room_id === myRoom.id) : [];
  const invitesFromMyRoom = myRoom ? requests.filter((r) => r.kind === 'invite' && r.room_id === myRoom.id) : [];

  const openRooms = rooms.filter((room) => room.id !== myRoomId && hasSpace(room) && canUseRoom(me, room, occupantsOf(room.id), separate));
  const invitable = myRoom
    ? guests.filter(
        (guest) =>
          guest.id !== me.id &&
          !roomOf.has(guest.id) &&
          !invitesFromMyRoom.some((r) => r.guest_id === guest.id) &&
          canUseRoom(guest, myRoom, occupantsOf(myRoom.id), separate),
      )
    : [];

  // Every change re-checks the lock on the server first, so a stale screen can't sneak a change in.
  const guarded = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      if (await isTripLocked(trip.id)) {
        setLocked(true);
        showAlert('Rooms are locked', 'Your advisor has locked room assignments. Ask them if you need a change.');
        return;
      }
      await action();
    } finally {
      setBusy(false);
      await load();
    }
  };

  const moveInto = async (guestId: number, room: Room) => {
    const { data: current } = await supabase.from('assignments').select('guest_id').eq('room_id', room.id);
    if ((current?.length ?? 0) >= room.capacity) {
      showAlert('Room is full', `Room ${room.room_number} just filled up.`);
      return false;
    }
    const { error } = await supabase
      .from('assignments')
      .upsert([{ trip_id: trip.id, guest_id: guestId, room_id: room.id }], { onConflict: 'guest_id' });
    if (error) {
      showAlert('Error', errorMessage(error));
      return false;
    }
    // Joining a room cancels any other pending requests this student sent.
    await supabase.from('room_requests').update({ status: 'cancelled' }).eq('guest_id', guestId).eq('kind', 'request').eq('status', 'pending');
    const fromRoomId = roomOf.get(guestId);
    await logRoomChanges(trip.id, me.legal_name, [
      {
        guest: guestById.get(guestId) ?? { id: guestId, legal_name: 'Unknown' },
        action: fromRoomId ? 'moved' : 'joined',
        fromRoom: fromRoomId ? roomNumber(fromRoomId) : null,
        toRoom: room.room_number,
      },
    ]);
    return true;
  };

  const handleJoin = (room: Room) =>
    guarded(async () => {
      const others = occupantsOf(room.id).map((g) => g.id);
      const previousRoom = myRoom;
      const previousRoommates = roommates.map((g) => g.id);
      if (!(await moveInto(me.id, room))) return;
      await notifyGuests(trip.id, others, 'New roommate', `${me.legal_name} joined room ${room.room_number}.`, 'rooms');
      if (previousRoom) {
        await notifyGuests(trip.id, previousRoommates, 'Roommate left', `${me.legal_name} moved out of room ${previousRoom.room_number}.`, 'rooms');
      }
      showAlert('Room joined', `You're in room ${room.room_number}.`);
    });

  const handleLeave = async () => {
    if (!myRoom) return;
    const ok = await confirmAction('Leave room?', `Leave room ${myRoom.room_number}? Your spot will open up for others.`, 'Leave');
    if (!ok) return;
    await guarded(async () => {
      const { error } = await supabase.from('assignments').delete().eq('guest_id', me.id);
      if (error) {
        showAlert('Error', errorMessage(error));
        return;
      }
      await supabase.from('room_requests').update({ status: 'cancelled' }).eq('from_guest_id', me.id).eq('kind', 'invite').eq('status', 'pending');
      await logRoomChanges(trip.id, me.legal_name, [{ guest: me, action: 'left', fromRoom: myRoom.room_number }]);
      await notifyGuests(trip.id, roommates.map((g) => g.id), 'Roommate left', `${me.legal_name} left room ${myRoom.room_number}.`, 'rooms');
    });
  };

  const handleRequest = (room: Room) =>
    guarded(async () => {
      const { error } = await supabase
        .from('room_requests')
        .insert([{ trip_id: trip.id, room_id: room.id, guest_id: me.id, from_guest_id: me.id, kind: 'request', status: 'pending' }]);
      if (error) {
        showAlert('Error', errorMessage(error));
        return;
      }
      await notifyGuests(trip.id, occupantsOf(room.id).map((g) => g.id), 'Room request', `${me.legal_name} asked to join room ${room.room_number}.`, 'rooms');
      showAlert('Request sent', `The students in room ${room.room_number} will be notified.`);
    });

  const handleInvite = (guest: Guest) =>
    guarded(async () => {
      if (!myRoom) return;
      const { error } = await supabase
        .from('room_requests')
        .insert([{ trip_id: trip.id, room_id: myRoom.id, guest_id: guest.id, from_guest_id: me.id, kind: 'invite', status: 'pending' }]);
      if (error) {
        showAlert('Error', errorMessage(error));
        return;
      }
      await notify(trip.id, 'guest', 'Room invite', `${me.legal_name} invited you to room ${myRoom.room_number}.`, guest.id, 'rooms');
    });

  const respond = (request: RoomRequest, accept: boolean) =>
    guarded(async () => {
      const room = rooms.find((r) => r.id === request.room_id);
      if (!room) return;
      if (accept && !(await moveInto(request.guest_id, room))) return;
      await supabase.from('room_requests').update({ status: accept ? 'accepted' : 'declined' }).eq('id', request.id);
      const verb = accept ? 'accepted' : 'declined';
      if (request.kind === 'invite') {
        await notify(trip.id, 'guest', `Invite ${verb}`, `${me.legal_name} ${verb} your invite to room ${room.room_number}.`, request.from_guest_id, 'rooms');
        if (accept) {
          const others = occupantsOf(room.id).map((g) => g.id).filter((id) => id !== request.from_guest_id);
          await notifyGuests(trip.id, others, 'New roommate', `${me.legal_name} joined room ${room.room_number}.`, 'rooms');
        }
      } else {
        await notify(trip.id, 'guest', `Request ${verb}`, `${me.legal_name} ${verb} your request to join room ${room.room_number}.`, request.guest_id, 'rooms');
      }
    });

  const cancelRequest = (request: RoomRequest) =>
    guarded(async () => {
      await supabase.from('room_requests').update({ status: 'cancelled' }).eq('id', request.id);
    });

  return (
    <Page>
      <BackButton onPress={onBack} />
      <Text style={styles.pageTitle}>{myRoom ? 'My Room' : 'Pick a Room'}</Text>
      <Text style={styles.pageSubtitle}>{`${trip.hotel_name} · ${me.school}${me.gender ? ` · ${me.gender}` : ''}`}</Text>

      {locked && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Rooms are locked by your advisor. No more changes.</Text>
        </View>
      )}

      {loading ? (
        <Text style={styles.normalText}>Loading rooms...</Text>
      ) : (
        <>
          {myRoom && (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.bigBlueText}>{`Room ${myRoom.room_number}`}</Text>
                {myRoom.ready_at ? (
                  <Badge text="Ready for check-in" tone="green" />
                ) : locked ? (
                  <Badge text="Hotel is preparing it" tone="amber" />
                ) : (
                  <Badge text="Not locked yet" tone="blue" />
                )}
              </View>
              <Text style={styles.cardText}>{`${myRoom.room_type} · ${occupantsOf(myRoom.id).length} of ${myRoom.capacity} beds taken`}</Text>
              <Text style={[styles.label, { marginTop: 12 }]}>{me.is_chaperone ? 'Room roster' : 'Roommates'}</Text>
              {roommates.length === 0 ? (
                <Text style={styles.mutedText}>No roommates yet.</Text>
              ) : (
                roommates.map((guest) => (
                  <View key={guest.id} style={{ marginBottom: 6 }}>
                    <Text style={styles.cardText}>{`• ${guest.legal_name}${guest.is_chaperone ? ' (chaperone)' : ''}`}</Text>
                    {me.is_chaperone && <Text style={styles.mutedText}>{`   ${guest.phone ?? 'no phone'} · ${guest.email ?? 'no email'}`}</Text>}
                    {me.is_chaperone && details.get(guest.id)?.emergency_name && (
                      <Text style={styles.mutedText}>{`   Emergency: ${details.get(guest.id)!.emergency_name} ${details.get(guest.id)!.emergency_phone ?? ''}`}</Text>
                    )}
                    {me.is_chaperone && details.get(guest.id)?.medical_notes && (
                      <Text style={[styles.mutedText, { color: colors.danger }]}>{`   Medical: ${details.get(guest.id)!.medical_notes}`}</Text>
                    )}
                  </View>
                ))
              )}
              {!locked && (
                <View style={styles.actionRow}>
                  <SmallButton text="Leave Room" secondary onPress={handleLeave} disabled={busy} />
                </View>
              )}
            </View>
          )}

          {myInvites.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Invites for you</Text>
              {myInvites.map((request) => (
                <View key={request.id} style={styles.card}>
                  <Text style={styles.cardText}>{`${nameOf(request.from_guest_id)} invited you to room ${roomNumber(request.room_id)}.`}</Text>
                  {!locked && (
                    <View style={styles.actionRow}>
                      <SmallButton text="Accept" onPress={() => respond(request, true)} disabled={busy} />
                      <SmallButton text="Decline" secondary onPress={() => respond(request, false)} disabled={busy} />
                    </View>
                  )}
                </View>
              ))}
            </>
          )}

          {requestsToMyRoom.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Requests to join your room</Text>
              {requestsToMyRoom.map((request) => (
                <View key={request.id} style={styles.card}>
                  <Text style={styles.cardText}>{`${nameOf(request.guest_id)} wants to join room ${roomNumber(request.room_id)}.`}</Text>
                  {!locked && (
                    <View style={styles.actionRow}>
                      <SmallButton text="Accept" onPress={() => respond(request, true)} disabled={busy} />
                      <SmallButton text="Decline" secondary onPress={() => respond(request, false)} disabled={busy} />
                    </View>
                  )}
                </View>
              ))}
            </>
          )}

          {myOutgoingRequests.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Your requests</Text>
              {myOutgoingRequests.map((request) => (
                <View key={request.id} style={styles.card}>
                  <Text style={styles.cardText}>{`Waiting on room ${roomNumber(request.room_id)} to accept you.`}</Text>
                  {!locked && (
                    <View style={styles.actionRow}>
                      <SmallButton text="Cancel Request" secondary onPress={() => cancelRequest(request)} disabled={busy} />
                    </View>
                  )}
                </View>
              ))}
            </>
          )}

          {myRoom && !locked && (
            <>
              <Text style={styles.sectionTitle}>Invite someone</Text>
              {invitesFromMyRoom.map((request) => (
                <Text key={request.id} style={styles.mutedText}>{`Invited ${nameOf(request.guest_id)}, waiting for a reply`}</Text>
              ))}
              {myRoom && occupantsOf(myRoom.id).length >= myRoom.capacity ? (
                <Text style={styles.mutedText}>Your room is full.</Text>
              ) : invitable.length === 0 ? (
                invitesFromMyRoom.length === 0 && <Text style={styles.mutedText}>No students without a room match this room.</Text>
              ) : (
                invitable.map((guest) => (
                  <View key={guest.id} style={[styles.card, styles.rowBetween]}>
                    <Text style={styles.cardText}>{guest.legal_name}</Text>
                    <SmallButton text="Invite" onPress={() => handleInvite(guest)} disabled={busy} />
                  </View>
                ))
              )}
            </>
          )}

          {!locked && (
            <>
              <Text style={styles.sectionTitle}>{myRoom ? 'Switch rooms' : 'Open rooms'}</Text>
              <Text style={styles.mutedText}>
                {`Only rooms for your school and gender are shown${separate ? (me.is_chaperone ? ', without students' : ', without chaperones') : ''}.`}
              </Text>
              {openRooms.length === 0 ? (
                <Text style={styles.normalText}>No open rooms right now. The hotel may still be adding rooms.</Text>
              ) : (
                openRooms.map((room) => {
                  const occupants = occupantsOf(room.id);
                  const requested = myOutgoingRequests.some((r) => r.room_id === room.id);
                  return (
                    <View key={room.id} style={styles.card}>
                      <Text style={styles.cardTitle}>{`Room ${room.room_number}`}</Text>
                      <Text style={styles.cardText}>{`${room.room_type} · ${room.gender ?? 'Any gender'} · ${occupants.length} of ${room.capacity} beds taken`}</Text>
                      {occupants.length > 0 && <Text style={styles.mutedText}>{`In this room: ${occupants.map((g) => g.legal_name).join(', ')}`}</Text>}
                      <View style={styles.actionRow}>
                        {occupants.length === 0 ? (
                          <SmallButton text={myRoom ? 'Move Here' : 'Join'} onPress={() => handleJoin(room)} disabled={busy} />
                        ) : requested ? (
                          <Badge text="Request sent" tone="blue" />
                        ) : (
                          <SmallButton text="Request to Join" onPress={() => handleRequest(room)} disabled={busy} />
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}
        </>
      )}
    </Page>
  );
}
