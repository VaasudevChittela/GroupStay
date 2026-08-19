import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabaseAnonKey, supabaseUrl } from './supabaseConfig';

/**
 * Sessions are persisted so the app can prove who the user is on every request.
 * Row level security keys off auth.uid(), so losing the session would mean
 * losing all access — see supabase/migrations/0002_rbac.sql.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
