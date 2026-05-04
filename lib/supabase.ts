import { createClient, SupabaseClient } from '@supabase/supabase-js'

// クライアントサイド用（publishable / anon key）- Lazy init
let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key)
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) are required'
      )
    _supabase = createClient(url, key)
  }
  return _supabase
}

/** @deprecated use getSupabase() */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

// サーバーサイド専用（secret key）
// Route Handler / Server Action 以外では絶対に使用しない
// Lazy init: ビルド時ではなくリクエスト時に初期化してビルドエラーを防ぐ
let _supabaseAdmin: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SECRET_KEY
    if (!url || !key) throw new Error('SUPABASE_SECRET_KEY or NEXT_PUBLIC_SUPABASE_URL is not set')
    _supabaseAdmin = createClient(url, key)
  }
  return _supabaseAdmin
}
