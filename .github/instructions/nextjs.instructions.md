---
applyTo: "**/*.tsx,**/*.ts,app/**,components/**"
---

# Next.js 14 App Router コーディング規約

## App Router の基本原則

### Server Component vs Client Component

```
デフォルト → Server Component
↓ 以下が必要な場合のみ
'use client' → Client Component
```

**Client Component が必要な場面:**
- `useState`, `useReducer`, `useEffect` などの React Hooks を使用する
- ブラウザ専用 API（`window`, `localStorage` など）を使用する
- イベントハンドラ（`onClick`, `onChange` など）を props で受け取る
- `useRouter`, `usePathname`, `useSearchParams` を使用する

**`'use client'` の書き方:**
```tsx
'use client'  // ← 必ずファイルの最初の行に記述

import { useState } from 'react'
// ...
```

### コンポーネントの分割戦略

インタラクティブな部分だけを Client Component に切り出し、ツリーのできるだけ末端に配置する。

```tsx
// ✅ Good: Server Component がほとんどを担い、末端だけ Client に
// app/page.tsx (Server Component)
import { ChatInput } from '@/components/ChatInput' // Client Component

export default async function Page() {
  return (
    <main>
      <h1>Personal Brain Sync</h1>  {/* Server で描画 */}
      <ChatInput />                  {/* Client Component */}
    </main>
  )
}

// ❌ Bad: ページ全体を 'use client' にしない
```

---

## Route Handlers（API Routes）

### ファイル配置

```
app/api/
├── chat/
│   └── route.ts     # POST /api/chat
└── sync/
    └── route.ts     # POST /api/sync
```

### Route Handler の基本形

```ts
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // 処理...
    
    return Response.json({ success: true })
  } catch (error) {
    console.error('[/api/xxx]', error)
    return Response.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
```

### ストリーミングレスポンス

```ts
export async function POST(request: NextRequest) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      
      // Gemini のストリーミング
      for await (const chunk of geminiStream) {
        controller.enqueue(encoder.encode(chunk.text()))
      }
      
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}
```

---

## 環境変数

### ルール
- `NEXT_PUBLIC_` プレフィックス = クライアントで利用可能
- プレフィックスなし = サーバーサイドのみ

```ts
// ✅ Server Component / Route Handler でのみ使用
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const geminiKey = process.env.GEMINI_API_KEY

// ✅ Client Component でも使用可能
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

// ❌ Client Component で機密キーを使用しない
```

### 型安全な環境変数アクセス

```ts
// lib/env.ts
function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`環境変数 ${key} が設定されていません`)
  return value
}

export const env = {
  GEMINI_API_KEY: requireEnv('GEMINI_API_KEY'),
  NOTION_API_KEY: requireEnv('NOTION_API_KEY'),
  NOTION_DATABASE_ID: requireEnv('NOTION_DATABASE_ID'),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
} as const
```

---

## メタデータ・PWA

### `layout.tsx` でのメタデータ設定

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Personal Brain Sync',
  description: '自分のNotionノートに基づいたAIアシスタント',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}
```

---

## Tailwind CSS

### クラス名の順序規則

```tsx
// レイアウト → サイズ → 余白 → 色 → テキスト → その他
<div className="flex flex-col h-screen w-full p-4 bg-white text-gray-900 rounded-lg shadow-md">
```

### モバイルファースト

```tsx
// ✅ モバイルがベース、大画面でオーバーライド
<div className="text-sm md:text-base lg:text-lg">

// ❌ デスクトップベースで書かない
```

### よく使うパターン（このプロジェクト専用）

```tsx
// メッセージバブル（AI側）
<div className="max-w-[80%] rounded-2xl rounded-tl-none bg-gray-100 px-4 py-3 text-gray-800">

// メッセージバブル（ユーザー側）
<div className="max-w-[80%] rounded-2xl rounded-tr-none bg-blue-600 px-4 py-3 text-white self-end">

// 固定フッターの入力エリア
<footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 safe-area-bottom">
```

---

## TypeScript

### 型定義の場所

- ページ・コンポーネント固有の型 → 同ファイル内に定義
- 複数ファイルで共有する型 → `lib/types.ts` に集約

### 基本的な型パターン

```ts
// API レスポンスの型
type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// チャットメッセージの型
type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

// Notion ページの型
type NotionPage = {
  id: string
  title: string
  content: string
  lastEditedAt: string
}
```

---

## インポート順序

```ts
// 1. React / Next.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 2. 外部ライブラリ
import { createClient } from '@supabase/supabase-js'

// 3. 内部モジュール（絶対パス @/ を使用）
import { supabaseAdmin } from '@/lib/supabase'
import { ChatMessage } from '@/components/ChatMessage'

// 4. 型のみのインポート
import type { Message } from '@/lib/types'
```

---

## ファイル・関数サイズ制限

### ファイル行数の上限

| ファイル種別 | 上限 | 超えた場合の対応 |
|------------|------|----------------|
| コンポーネント（`.tsx`） | **150行** | サブコンポーネントに分割 |
| ロジック（`.ts`） | **200行** | 責務ごとにファイルを分割 |
| Route Handler（`route.ts`） | **100行** | ロジックを `lib/` に切り出す |
| 設定ファイル（`next.config.js` 等） | **50行** | — |

### 関数の行数

- **1関数 30行以内**を目安にする
- async 関数は処理ステップごとにヘルパー関数に切り出す

```ts
// ✅ Good: 各処理を小さな関数に切り出す
export async function POST(request: NextRequest) {
  const { messages } = await parseRequest(request)     // 1. パース
  const embedding = await embedQuestion(messages)       // 2. Embedding
  const notes = await searchRelatedNotes(embedding)     // 3. 検索
  return streamGeminiResponse(notes, messages)          // 4. 応答
}

// ❌ Bad: 1つの関数に全処理を詰め込まない
```

### JSX の return ブロック

- **50行以内**を目安にする
- 条件分岐は変数に切り出してから JSX に渡す

```tsx
// ✅ Good: 条件をあらかじめ変数に切り出す
const messageClass = isUser
  ? 'bg-blue-600 text-white self-end'
  : 'bg-gray-100 text-gray-800 self-start'

return <div className={messageClass}>{content}</div>

// ❌ Bad: JSX 内で三項演算子をネストしない
return (
  <div className={isUser
    ? (isStreaming ? 'opacity-70' : 'bg-blue-600')
    : 'bg-gray-100'}>
    {content}
  </div>
)
```

---

## フォーマット・インデント

- **インデント**: スペース 2 つ（タブ不使用）
- **セミコロン**: あり
- **クォート**: シングルクォート `'`（JSX 属性はダブルクォート `"`）
- **末尾カンマ**: あり（`"trailingComma": "all"`）
- **最大行長**: **100文字**。超える場合は適切な位置で折り返す

```ts
// ✅ Good: 折り返す
const { data: matchedNotes, error } = await supabaseAdmin.rpc(
  'match_notes',
  { query_embedding: queryEmbedding, match_count: 3 },
)

// ❌ Bad: 1行に詰め込まない
const { data: matchedNotes, error } = await supabaseAdmin.rpc('match_notes', { query_embedding: queryEmbedding, match_count: 3 })
```

- **空行**: 関数間・論理的なブロック間に1行の空行。2行以上の空行は不可
- **オブジェクト・配列**: 要素が3つ以上の場合は1要素1行

```ts
// ✅ Good
const headers = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Transfer-Encoding': 'chunked',
  'Cache-Control': 'no-cache',
}

// ❌ Bad
const headers = { 'Content-Type': 'text/plain', 'Transfer-Encoding': 'chunked', 'Cache-Control': 'no-cache' }
```

---

## 命名規則

| 対象 | 規則 | 例 |
|------|------|-----|
| ファイル（ロジック） | `kebab-case` | `notion-sync.ts` |
| ファイル（コンポーネント） | `PascalCase` | `ChatMessage.tsx` |
| 変数・関数 | `camelCase` | `fetchNotes` |
| 定数 | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| 型・インターフェース | `PascalCase` | `MatchedNote` |
| boolean 変数 | `is/has/can/should` プレフィックス | `isSyncing`, `hasError` |
| イベントハンドラ | `handle` プレフィックス | `handleSubmit`, `handleSyncClick` |

---

## Git コミット規約

Conventional Commits 形式: `<type>(<scope>): <subject>`

| type | 用途 |
|------|------|
| `feat` | 新機能追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `style` | フォーマット等（コード変更なし） |
| `refactor` | リファクタリング |
| `perf` | パフォーマンス改善 |
| `chore` | ビルドプロセス・補助ツールの変更 |

| scope | 対象 |
|-------|------|
| `sync` | Notion 同期機能 |
| `chat` | チャット機能 |
| `ui` | コンポーネント・スタイル |
| `db` | Supabase スキーマ・クエリ |
| `api` | Route Handlers |
| `lib` | `lib/` 配下のユーティリティ |
| `pwa` | PWA 設定 |
| `deps` | 依存関係の更新 |

```
feat(sync): Notion DBからの差分同期を実装
fix(chat): ストリーミング中にエラーが発生した場合のハンドリングを追加
refactor(lib): embedText関数をlib/gemini.tsに切り出し
```
