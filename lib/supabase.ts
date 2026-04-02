import { createClient } from '@supabase/supabase-js'

// クライアントサイド用（publishable key）
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

// サーバーサイド専用（secret key）
// Route Handler / Server Action 以外では絶対に使用しない
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)
