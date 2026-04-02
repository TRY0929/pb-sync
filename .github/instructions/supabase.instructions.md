---
applyTo: "lib/supabase.ts,lib/notion-sync.ts,app/api/**"
---

# Supabase / pgvector コーディング規約

## クライアント初期化

### `lib/supabase.ts` の構成

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

// クライアントサイド用（publishable key）
// NEXT_PUBLIC_ プレフィックスのため安全にクライアントに公開可能
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
)

// サーバーサイド専用（secret key）
// Route Handler / Server Action 以外では絶対に使用しない
export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)
```

### どちらを使うか

| 実行場所 | 使用するクライアント |
|---------|-------------------|
| Route Handler (`app/api/`) | `supabaseAdmin` |
| Server Component | `supabaseAdmin` |
| Client Component | `supabase`（anon key） |

---

## テーブル操作

### SELECT

```ts
// ✅ 必要なカラムのみ取得（コスト最適化）
const { data, error } = await supabaseAdmin
  .from('notes')
  .select('id, notion_page_id, title, content')
  .order('last_synced_at', { ascending: false })

if (error) throw new Error(`[Supabase SELECT] ${error.message}`)

// ❌ select('*') は避ける（embedding vector が巨大なため特に注意）
```

### UPSERT（差分同期に使用）

```ts
// notion_page_id をキーに upsert（差分同期）
const { error } = await supabaseAdmin
  .from('notes')
  .upsert(
    {
      notion_page_id: page.id,
      title: page.title,
      content: page.content,
      embedding: embeddingVector,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'notion_page_id' }  // UNIQUE 制約のカラムを指定
  )

if (error) throw new Error(`[Supabase UPSERT] ${error.message}`)
```

---

## ベクトル検索（RPC 関数）

### `match_notes` RPC の呼び出し

```ts
// ユーザーの質問に関連するノートを取得
const { data: matchedNotes, error } = await supabaseAdmin.rpc('match_notes', {
  query_embedding: queryEmbedding,  // number[] 型（768 次元）
  match_count: 3,                   // 取得件数
})

if (error) throw new Error(`[Supabase RPC match_notes] ${error.message}`)

// matchedNotes の型
// Array<{ id: string, notion_page_id: string, title: string, content: string, similarity: number }>
```

### `match_notes` 関数の SQL 定義（`supabase/schema.sql`）

```sql
-- pgvector のコサイン類似度を使ったベクトル検索
CREATE OR REPLACE FUNCTION match_notes(
  query_embedding vector(768),
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  notion_page_id text,
  title text,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    notes.id,
    notes.notion_page_id,
    notes.title,
    notes.content,
    1 - (notes.embedding <=> query_embedding) AS similarity
  FROM notes
  ORDER BY notes.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

## スキーマ定義（`supabase/schema.sql`）

### 完全なスキーマ

```sql
-- 1. pgvector 拡張を有効化
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. notes テーブル
CREATE TABLE IF NOT EXISTS notes (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  notion_page_id  text UNIQUE NOT NULL,
  title           text NOT NULL DEFAULT '',
  content         text NOT NULL DEFAULT '',
  embedding       vector(768),           -- text-embedding-004 の次元数
  last_synced_at  timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 3. インデックス（検索高速化）
-- ivfflat: データが 1000 件を超えたら有効化を検討
-- CREATE INDEX ON notes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. RPC 関数
CREATE OR REPLACE FUNCTION match_notes(
  query_embedding vector(768),
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  notion_page_id text,
  title text,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    notes.id,
    notes.notion_page_id,
    notes.title,
    notes.content,
    1 - (notes.embedding <=> query_embedding) AS similarity
  FROM notes
  WHERE notes.embedding IS NOT NULL
  ORDER BY notes.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

## TypeScript 型定義（`lib/types.ts`）

Supabase が提供する型ジェネレータを使うか、手動で以下を定義する。

```ts
// lib/types.ts

export type Note = {
  id: string
  notion_page_id: string
  title: string
  content: string
  embedding: number[] | null
  last_synced_at: string
  created_at: string
}

export type MatchedNote = Pick<Note, 'id' | 'notion_page_id' | 'title' | 'content'> & {
  similarity: number
}

// Database 型（Supabase クライアントの型パラメータに使用）
export type Database = {
  public: {
    Tables: {
      notes: {
        Row: Note
        Insert: Omit<Note, 'id' | 'created_at'>
        Update: Partial<Omit<Note, 'id' | 'created_at'>>
      }
    }
    Functions: {
      match_notes: {
        Args: { query_embedding: number[]; match_count?: number }
        Returns: MatchedNote[]
      }
    }
  }
}
```

---

## エラーハンドリングパターン

```ts
// 共通のエラーハンドリングラッパー
async function supabaseQuery<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: unknown }>
): Promise<T> {
  const { data, error } = await queryFn()
  if (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    throw new Error(`Supabase error: ${message}`)
  }
  if (data === null) throw new Error('Supabase: データが見つかりません')
  return data
}
```

---

## コスト・パフォーマンス上の注意

1. **`embedding` カラムは SELECT に含めない**: ベクトルデータは巨大（768 × 4 bytes = 3KB/行）のため、`select('embedding')` は RPC 経由の検索以外では行わない

2. **バッチ処理**: Notion 同期時は 1 ページずつ Upsert するのではなく、可能な限りバッチでまとめる

3. **接続プール**: Vercel の Serverless 環境では毎リクエストで新しい接続が張られるため、`@supabase/supabase-js` のシングルトンパターンを守る

---

## ファイル・関数サイズ制限

### `lib/supabase.ts`
- **30行以内**を目安にする（クライアント初期化のみを担う）
- DB クエリロジックは `lib/supabase.ts` に書かず、呼び出し元や専用モジュールに記述する

### `lib/notion-sync.ts`
- **200行以内**。超える場合は以下のように分割する
  - `lib/notion-client.ts` — Notion クライアント初期化・ページ取得
  - `lib/notion-content.ts` — ブロック解析・テキスト抽出
  - `lib/notion-sync.ts` — 同期エントリーポイント（upsert 呼び出しのみ）

### 関数の行数
- **1関数 30行以内**を厳守する
- DB 操作・Embedding・Upsert は必ず別関数に分ける

```ts
// ✅ Good: 責務ごとに関数を分割
async function syncPage(page: NotionPage): Promise<void> {
  const content = await fetchPageContent(page.id)   // コンテンツ取得
  const embedding = await embedText(content)          // ベクトル化
  await upsertNote({ ...page, content, embedding })   // 保存
}

// ❌ Bad: 1関数で全処理を行わない
```

---

## フォーマット・コーディングスタイル

- **インデント**: スペース 2 つ
- **セミコロン**: あり
- **クォート**: シングルクォート `'`
- **末尾カンマ**: あり
- **最大行長**: **100文字**

```ts
// ✅ Good: 長い upsert は折り返す
const { error } = await supabaseAdmin
  .from('notes')
  .upsert(
    {
      notion_page_id: page.id,
      title: page.title,
      content: page.content,
      embedding: embeddingVector,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'notion_page_id' },
  )

// ❌ Bad: 1行に詰め込まない
```

- **オブジェクト**: プロパティが3つ以上の場合は1プロパティ1行で記述する
