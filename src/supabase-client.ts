import { createClient } from '@supabase/supabase-js';

// In Next.js, environment variables accessed in the browser (client-side) 
// must be prefixed with NEXT_PUBLIC_
const supabaseUrl = 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  process.env.SUPABASE_URL || 
  'https://placeholder-project.supabase.co';

// For browser calls (Auth/Uploads), we use the Anon Public key.
// For serverless functions (handling SMTP/Gemini), we use the Service Role key.
const isBrowser = typeof window !== 'undefined';
const serverServiceKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_SERVICE_KEY || 
  process.env.SUPABASE_SECRET_KEY || 
  process.env.SUPABASE_ADMIN_KEY || 
  process.env.SERVICE_ROLE_KEY;

const supabaseKey = isBrowser
  ? (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key')
  : (serverServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key');

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true, // Allow browser authentication sessions to persist
    detectSessionInUrl: true
  }
});
