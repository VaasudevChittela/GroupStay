export type Guest = {
  id: number;
  school: string;
  is_chaperone: boolean;
  gender?: string | null;
  roommate_request_id?: number | null;
};

export type Room = {
  id: number;
  capacity: number;
  school: string;
  gender?: string | null;
};

export type Assignment = {
  guest_id: number;
  room_id: number;
};

export type AutoAssignResult = {
  assignments: Assignment[];
  unassignedGuestIds: number[];
};

// Fills empty beds for guests without a room. Rooms students already picked (existing) are kept.
// With separateChaperones, chaperones only share with chaperones and students only with students.
export function autoAssignGuests(guests: Guest[], rooms: Room[], existing: Assignment[] = [], separateChaperones = false): AutoAssignResult {
  const assignments: Assignment[] = [];
  const unassignedGuestIds = new Set<number>(guests.map((guest) => guest.id));

  type RoomState = Room & {
    occupants: number;
    hasChaperone: boolean;
    hasStudent: boolean;
    guests: number[];
    genders: Set<string>;
  };

  const roomStates: RoomState[] = rooms.map((room) => ({
    ...room,
    occupants: 0,
    hasChaperone: false,
    hasStudent: false,
    guests: [],
    genders: new Set<string>(),
  }));

  const getAvailableRoom = (
    guest: Guest,
    options: { requireEmptyChaperoneSlot?: boolean; requiredCapacity?: number } = {},
  ): RoomState | null => {
    const { requireEmptyChaperoneSlot = false, requiredCapacity = 1 } = options;
    const candidates = roomStates
      .filter((room) => room.school.trim().toLowerCase() === guest.school.trim().toLowerCase())
      .filter((room) => (room.gender ? room.gender === guest.gender : !guest.gender || [...room.genders].every((g) => g === guest.gender)))
      .filter((room) => room.capacity - room.occupants >= requiredCapacity)
      .filter((room) => (requireEmptyChaperoneSlot && !separateChaperones ? !room.hasChaperone : true))
      .filter((room) => (!separateChaperones ? true : guest.is_chaperone ? !room.hasStudent : !room.hasChaperone));

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => a.capacity - b.capacity || a.occupants - b.occupants);
    return candidates[0];
  };

  const assignGuestToRoom = (guest: Guest, room: RoomState) => {
    room.occupants += 1;
    if (guest.gender) room.genders.add(guest.gender);
    if (guest.is_chaperone) {
      room.hasChaperone = true;
    } else {
      room.hasStudent = true;
    }
    room.guests.push(guest.id);
    assignments.push({ guest_id: guest.id, room_id: room.id });
    unassignedGuestIds.delete(guest.id);
  };

  const assignGuestPairToRoom = (guestA: Guest, guestB: Guest, room: RoomState) => {
    room.occupants += 2;
    if (guestA.gender) room.genders.add(guestA.gender);
    if (guestB.gender) room.genders.add(guestB.gender);
    if (guestA.is_chaperone || guestB.is_chaperone) {
      room.hasChaperone = true;
    }
    if (!guestA.is_chaperone || !guestB.is_chaperone) {
      room.hasStudent = true;
    }
    room.guests.push(guestA.id, guestB.id);
    assignments.push({ guest_id: guestA.id, room_id: room.id });
    assignments.push({ guest_id: guestB.id, room_id: room.id });
    unassignedGuestIds.delete(guestA.id);
    unassignedGuestIds.delete(guestB.id);
  };

  const guestById = new Map<number, Guest>(guests.map((guest) => [guest.id, guest]));

  for (const assignment of existing) {
    const guest = guestById.get(assignment.guest_id);
    const room = roomStates.find((r) => r.id === assignment.room_id);
    if (guest && room && unassignedGuestIds.has(guest.id)) assignGuestToRoom(guest, room);
  }

  const chaperones = guests.filter((guest) => guest.is_chaperone);
  for (const guest of chaperones) {
    if (!unassignedGuestIds.has(guest.id)) {
      continue;
    }

    const room = getAvailableRoom(guest, { requireEmptyChaperoneSlot: true });
    if (room) {
      assignGuestToRoom(guest, room);
    }
  }

  const processedPairs = new Set<string>();

  for (const guest of guests) {
    if (guest.is_chaperone || !unassignedGuestIds.has(guest.id)) {
      continue;
    }

    const requestedId = guest.roommate_request_id;
    if (!requestedId || !unassignedGuestIds.has(requestedId)) {
      continue;
    }

    const requestedGuest = guestById.get(requestedId);
    if (!requestedGuest) {
      continue;
    }

    if (requestedGuest.roommate_request_id !== guest.id) {
      continue;
    }

    const pairKey = [guest.id, requestedGuest.id].sort((a, b) => a - b).join('-');
    if (processedPairs.has(pairKey)) {
      continue;
    }

    if (guest.school !== requestedGuest.school || (guest.gender ?? null) !== (requestedGuest.gender ?? null)) {
      continue;
    }

    const room = getAvailableRoom(guest, { requiredCapacity: 2 });
    if (!room) {
      continue;
    }

    assignGuestPairToRoom(guest, requestedGuest, room);
    processedPairs.add(pairKey);
  }

  for (const guest of guests) {
    if (!unassignedGuestIds.has(guest.id)) {
      continue;
    }

    const room = getAvailableRoom(guest);
    if (!room) {
      continue;
    }

    assignGuestToRoom(guest, room);
  }

  return {
    assignments,
    unassignedGuestIds: Array.from(unassignedGuestIds),
  };
}
