import type { Session } from '@supabase/supabase-js';
import { Profile, ROLES, Role } from './types';

export function profileFromSession(session: Session | null): Profile | null {
  if (!session?.user) return null;
  const meta = session.user.user_metadata ?? {};
  const role = ROLES.includes(meta.role) ? (meta.role as Role) : null;
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    full_name: meta.full_name ?? '',
    role,
    phone: meta.phone ?? '',
    gender: meta.gender ?? '',
    school: meta.school ?? '',
  };
}
