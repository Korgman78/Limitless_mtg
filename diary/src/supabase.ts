import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_KEY manquants. Copie diary/.env.example vers diary/.env.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
