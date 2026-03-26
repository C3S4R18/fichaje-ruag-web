import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cliente centralizado. Colocar en: app/supabase/client.ts
// (o donde ya tengas el archivo original client.ts de tu proyecto)
export const supabase = createClient(supabaseUrl, supabaseKey)