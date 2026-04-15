import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

// For convenience - lazy getter
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export type Document = {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  chapter_number: number | null
  book_id: string | null
}

export type Version = {
  id: string
  document_id: string
  content: string
  title: string | null
  created_at: string
  message: string | null
}
