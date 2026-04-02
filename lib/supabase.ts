import { createClient, SupabaseClient } from '@supabase/supabase-js'

// クライアントサイド用（publishable key）
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

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
