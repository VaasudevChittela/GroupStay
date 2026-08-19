import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { DEMO_TRIP, DEMO_WRITE_MESSAGE, isDemoMode } from './demo';

/**
 * Roles mirror supabase/migrations/0002_rbac.sql exactly. The values here are
 * only for rendering the right screens — the database enforces the real
 * boundaries, so a tampered client still sees nothing it shouldn't.
 */
export type AppRole = 'hotel_staff' | 'chapter_assignor' | 'student' | 'admin';

export const ROLE_LABEL: Record<AppRole, string> = {
  hotel_staff: 'Hotel Staff',
  chapter_assignor: 'Chapter Assignor',
  student: 'Student',
  admin: 'Administrator',
};

export type Profile = {
  id: string;
  role: AppRole;
  full_name: string | null;
  email: string | null;
  hotel_id: string | null;
  chapter_id: string | null;
  guest_id: string | null;
};

export type Org = {
  id: string;
  name: string;
  code: string;
  /** Location details — hotels only; chapters leave these null. */
  address?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  phone?: string | null;
};

const HOTEL_COLUMNS = 'id, name, code, address, city, region, postal_code, phone';

/** "Seattle, WA" — the short form for headers. */
export function shortLocation(org: Org | null): string | null {
  if (!org) return null;
  const parts = [org.city, org.region].filter(Boolean);
  return parts.length ? parts.join(', ') : org.address || null;
}

/** Full postal address on one line, for the property card. */
export function fullAddress(org: Org | null): string | null {
  if (!org) return null;
  const parts = [org.address, org.city, [org.region, org.postal_code].filter(Boolean).join(' ')]
    .map((p) => (p ?? '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export type SessionState = {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  hotel: Org | null;
  chapter: Org | null;
  error: string | null;
  /** True once signed in but before the user has picked their hotel/chapter. */
  needsOrg: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const err = (e: unknown): string =>
  typeof e === 'string' ? e : e instanceof Error ? e.message : JSON.stringify(e);

/** PostgREST reports a missing table with PGRST205 — i.e. migration not run yet. */
export const isMissingTable = (error: any) => error?.code === 'PGRST205';

export const MIGRATION_MISSING =
  'Your account was created, but this Supabase project has no tables yet. Run the two migration files below and you are done.';

const ROLE_FROM_METADATA: Record<string, AppRole> = {
  'hotel staff': 'hotel_staff',
  hotel_staff: 'hotel_staff',
  advisor: 'chapter_assignor',
  'chapter assignor': 'chapter_assignor',
  chapter_assignor: 'chapter_assignor',
  admin: 'admin',
  student: 'student',
};

/**
 * Create the profile row if the database trigger didn't. Signing up leaves the
 * user with a session but no profile when the trigger is missing, which would
 * otherwise strand them on a dead-end screen right after "Create account".
 */
async function ensureProfile(userId: string): Promise<Profile | null> {
  const { data: userData } = await supabase.auth.getUser();
  const meta = userData?.user?.user_metadata ?? {};
  const role = ROLE_FROM_METADATA[String(meta.role ?? 'student').toLowerCase()] ?? 'student';

  const { data, error } = await supabase
    .from('profiles')
    .insert([
      {
        id: userId,
        role,
        full_name: meta.full_name ?? null,
        email: userData?.user?.email ?? null,
      },
    ])
    .select('id, role, full_name, email, hotel_id, chapter_id, guest_id')
    .maybeSingle();

  if (error) return null;
  return (data as Profile) ?? null;
}

export async function loadProfile(userId: string): Promise<{
  profile: Profile | null;
  hotel: Org | null;
  chapter: Org | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, email, hotel_id, chapter_id, guest_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return { profile: null, hotel: null, chapter: null, error: MIGRATION_MISSING };
    }
    return { profile: null, hotel: null, chapter: null, error: err(error) };
  }

  // No row yet — the signup trigger may not exist. Create it ourselves.
  const row = data ?? (await ensureProfile(userId));
  if (!row) return { profile: null, hotel: null, chapter: null, error: null };

  const profile = row as Profile;

  const [hotelRes, chapterRes] = await Promise.all([
    profile.hotel_id
      ? supabase.from('hotels').select(HOTEL_COLUMNS).eq('id', profile.hotel_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
    profile.chapter_id
      ? supabase.from('chapters').select('id, name, code').eq('id', profile.chapter_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
  ]);

  return {
    profile,
    hotel: (hotelRes.data as Org) ?? null,
    chapter: (chapterRes.data as Org) ?? null,
    error: null,
  };
}

/** Does this role still need to be attached to an organization before it can work? */
export function orgMissing(profile: Profile | null): boolean {
  if (!profile) return false;
  if (profile.role === 'hotel_staff') return !profile.hotel_id;
  if (profile.role === 'chapter_assignor') return !profile.chapter_id;
  if (profile.role === 'student') return !profile.guest_id;
  return false;
}

export function useSession(): SessionState {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hotel, setHotel] = useState<Org | null>(null);
  const [chapter, setChapter] = useState<Org | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async (id: string | null) => {
    if (!id) {
      setProfile(null);
      setHotel(null);
      setChapter(null);
      setError(null);
      setLoading(false);
      return;
    }
    const result = await loadProfile(id);
    setProfile(result.profile);
    setHotel(result.hotel);
    setChapter(result.chapter);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      const id = session?.user?.id ?? null;
      setUserId(id);
      hydrate(id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id ?? null;
      setUserId(id);
      setLoading(true);
      hydrate(id);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [hydrate]);

  const refresh = useCallback(async () => {
    await hydrate(userId);
  }, [hydrate, userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return {
    loading,
    userId,
    profile,
    hotel,
    chapter,
    error,
    needsOrg: orgMissing(profile),
    refresh,
    signOut,
  };
}

// ---------------------------------------------------------------------------
// Onboarding — all writes go through SECURITY DEFINER functions so the client
// can never point its own profile at another organization.
// ---------------------------------------------------------------------------

export type HotelLocationInput = {
  address?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  phone?: string;
};

export async function claimHotel(
  name: string,
  code?: string,
  location: HotelLocationInput = {},
): Promise<string | null> {
  const { error } = await supabase.rpc('claim_hotel', {
    p_name: name,
    p_code: code ?? null,
    p_address: location.address ?? null,
    p_city: location.city ?? null,
    p_region: location.region ?? null,
    p_postal_code: location.postal_code ?? null,
    p_phone: location.phone ?? null,
  });
  return error ? err(error) : null;
}

/** Staff correcting their own property's details. RLS limits this to their hotel. */
export async function updateHotelLocation(
  hotelId: string,
  location: HotelLocationInput,
): Promise<string | null> {
  if (isDemoMode()) return DEMO_WRITE_MESSAGE;

  const { error } = await supabase
    .from('hotels')
    .update({
      address: location.address?.trim() || null,
      city: location.city?.trim() || null,
      region: location.region?.trim() || null,
      postal_code: location.postal_code?.trim() || null,
      phone: location.phone?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', hotelId);
  return error ? err(error) : null;
}

export async function claimChapter(name: string, code?: string, school?: string): Promise<string | null> {
  const { error } = await supabase.rpc('claim_chapter', {
    p_name: name,
    p_code: code ?? null,
    p_school: school ?? null,
  });
  return error ? err(error) : null;
}

export async function joinTripAsStudent(input: {
  tripCode: string;
  legalName: string;
  email?: string;
  phone?: string;
  school?: string;
  arrivalWindow?: string;
  isChaperone?: boolean;
}): Promise<{ guestId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('join_trip', {
    p_trip_code: input.tripCode,
    p_legal_name: input.legalName,
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
    p_school: input.school ?? null,
    p_arrival_window: input.arrivalWindow ?? null,
    p_is_chaperone: input.isChaperone ?? false,
  });
  if (error) return { guestId: null, error: err(error) };
  return { guestId: (data as string) ?? null, error: null };
}

/** The trip a student belongs to, fetched without granting SELECT on trips. */
export async function loadMyTrip(): Promise<{
  trip: { id: string; name: string; hotel_name: string; trip_code: string } | null;
  error: string | null;
}> {
  if (isDemoMode()) return { trip: DEMO_TRIP, error: null };

  const { data, error } = await supabase.rpc('my_trip');
  if (error) return { trip: null, error: err(error) };
  const row = Array.isArray(data) ? data[0] : data;
  return { trip: row ?? null, error: null };
}

export async function listOrgs(table: 'hotels' | 'chapters'): Promise<Org[]> {
  // Split rather than interpolating the column list: the typed client can only
  // infer a select() built from a literal.
  if (table === 'hotels') {
    const { data } = await supabase
      .from('hotels')
      .select('id, name, code, address, city, region, postal_code, phone')
      .order('name');
    return (data ?? []) as Org[];
  }
  const { data } = await supabase.from('chapters').select('id, name, code').order('name');
  return (data ?? []) as Org[];
}

