import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://alvzamtrqinzazpnrekp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsdnphbXRycWluemF6cG5yZWtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NzEyNjgsImV4cCI6MjA5MzM0NzI2OH0.YfAZH1x8E07d4Wav_p2ZIk_vsdtoUSF96CTOA0JOcfk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false
  }
});
