import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mmzguteskjoxdihvxewl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1temd1dGVza2pveGRpaHZ4ZXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4Mzg3NzgsImV4cCI6MjA4NDQxNDc3OH0.u7sk-QNIceGvp7MgCxbRx7f2QY6vi8aPkNCl_kmqsV8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

export const isSupabaseConfigured = () => true;
