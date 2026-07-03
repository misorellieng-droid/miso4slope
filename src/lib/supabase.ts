import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sem as variáveis de ambiente configuradas, o app continua funcionando
// (motor de cálculo é 100% client-side) — só o salvamento em nuvem fica
// indisponível, caindo de volta pro localStorage.
export const supabase = url && anonKey ? createClient(url, anonKey) : null
