import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bkzmggfqpubvruwdpbyz.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrem1nZ2ZxcHVidnJ1d2RwYnl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMzg3MDIsImV4cCI6MjA4NjYxNDcwMn0.ZGztZb1JogNxtHBEFOcv_Xn7vS6xvIfu16G4edc1S5Y'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // vigtigt i native
    flowType: "pkce",
  },
})
