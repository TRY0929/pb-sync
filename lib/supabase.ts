import { createClient } from '@supabase/supabase-js'

// クライアントサイド用（anon key）
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// サーバーサイド専用（service_role key）
// Route Handler / Server Action 以外では絶対に使用しない
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
