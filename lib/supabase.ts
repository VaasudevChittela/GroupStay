import { Platform } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabaseUrl, supabaseAnonKey } from './supabaseConfig';
import { createDemoClient } from './demoBackend';

// Set EXPO_PUBLIC_DEMO_MODE=true in .env to run against the built-in demo backend
// instead of Supabase. Restart `expo start` after changing it.
export const isDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';

export const supabase: SupabaseClient = isDemoMode
  ? (createDemoClient() as unknown as SupabaseClient)
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Keep users logged in between app launches.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      },
    });
