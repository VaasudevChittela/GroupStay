export type Guest = {
  id: string;
  school: string;
  is_chaperone: boolean;
  roommate_request_id?: string | null;
};

export type Room = {
  id: string;
  capacity: number;
  school: string;
};

export type Assignment = {
  guest_id: string;
  room_id: string;
};

export type AutoAssignResult = {
  assignments: Assignment[];
  unassignedGuestIds: string[];
};

export function autoAssignGuests(guests: Guest[], rooms: Room[]): AutoAssignResult {
  const assignments: Assignment[] = [];
  const unassignedGuestIds = new Set<string>(guests.map((guest) => guest.id));

  type RoomState = Room & {
    occupants: number;
    hasChaperone: boolean;
    guests: string[];
  };

  const roomStates: RoomState[] = rooms.map((room) => ({
    ...room,
    occupants: 0,
    hasChaperone: false,
    guests: [],
  }));

  const getAvailableRoom = (
    guest: Guest,
    options: { requireEmptyChaperoneSlot?: boolean; requiredCapacity?: number } = {},
  ): RoomState | null => {
    const { requireEmptyChaperoneSlot = false, requiredCapacity = 1 } = options;
    const candidates = roomStates
      .filter((room) => room.school === guest.school)
      .filter((room) => room.capacity - room.occupants >= requiredCapacity)
      .filter((room) => (requireEmptyChaperoneSlot ? !room.hasChaperone : true));

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => a.capacity - b.capacity || a.occupants - b.occupants);
    return candidates[0];
  };

  const assignGuestToRoom = (guest: Guest, room: RoomState) => {
    room.occupants += 1;
    if (guest.is_chaperone) {
      room.hasChaperone = true;
    }
    room.guests.push(guest.id);
    assignments.push({ guest_id: guest.id, room_id: room.id });
    unassignedGuestIds.delete(guest.id);
  };

  const assignGuestPairToRoom = (guestA: Guest, guestB: Guest, room: RoomState) => {
    room.occupants += 2;
    if (guestA.is_chaperone || guestB.is_chaperone) {
      room.hasChaperone = true;
    }
    room.guests.push(guestA.id, guestB.id);
    assignments.push({ guest_id: guestA.id, room_id: room.id });
    assignments.push({ guest_id: guestB.id, room_id: room.id });
    unassignedGuestIds.delete(guestA.id);
    unassignedGuestIds.delete(guestB.id);
  };

  const guestById = new Map<string, Guest>(guests.map((guest) => [guest.id, guest]));

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

    const pairKey = [guest.id, requestedGuest.id].sort().join('-');
    if (processedPairs.has(pairKey)) {
      continue;
    }

    if (guest.school !== requestedGuest.school) {
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
