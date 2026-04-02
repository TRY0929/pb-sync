---
applyTo: "app/api/**,lib/gemini.ts,lib/notion-sync.ts"
---

# API・外部サービス連携 コーディング規約

## Gemini API

### クライアント初期化（`lib/gemini.ts`）

```ts
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Embedding 用モデル（768 次元）
export const embeddingModel = genAI.getGenerativeModel({
  model: 'text-embedding-004',
})

// Chat 用モデル（ストリーミング対応）
export const chatModel = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
})
```

### テキストのベクトル化

```ts
// テキストを 768 次元のベクトルに変換
export async function embedText(text: string): Promise<number[]> {
  const result = await embeddingModel.embedContent(text)
  return result.embedding.values
}
```

### RAG チャット（ストリーミング）

```ts
// System Prompt に Notion ノートの内容を埋め込む
export function buildSystemPrompt(matchedNotes: MatchedNote[]): string {
  const noteContents = matchedNotes
    .map((note, i) => `【ノート${i + 1}: ${note.title}】\n${note.content}`)
    .join('\n\n---\n\n')

  return `あなたはユーザーの個人学習ノートに基づいて回答するAIアシスタントです。
以下はユーザーが過去にまとめたNotionのノートから、質問に関連する内容を抜粋したものです。
この内容をベースに、ユーザーの言葉・理解・視点を活かして回答してください。
一般的な教科書的説明よりも、ノートに書かれた内容を優先してください。

${noteContents}

---
上記のノート内容を参考に、ユーザーの質問に答えてください。
ノートに記載がない場合は「ノートには記載がありませんでした」と正直に伝えてください。`
}

// ストリーミングチャット
export async function streamChat(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
) {
  const chat = chatModel.startChat({
    systemInstruction: systemPrompt,
    history: messages.slice(0, -1), // 最後のメッセージ以外を履歴として渡す
  })

  const lastMessage = messages[messages.length - 1]
  return chat.sendMessageStream(lastMessage.parts[0].text)
}
```

### レート制限対策

```ts
// 指数バックオフでリトライ
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isRateLimit =
        error instanceof Error && error.message.includes('429')
      if (!isRateLimit || attempt === maxRetries - 1) throw error

      const delay = baseDelay * Math.pow(2, attempt)
      console.warn(`[Gemini] レート制限に達しました。${delay}ms 後にリトライします...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw new Error('最大リトライ回数に達しました')
}
```

---

## Notion API

### クライアント初期化（`lib/notion-sync.ts` 内）

```ts
import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
})

const DATABASE_ID = process.env.NOTION_DATABASE_ID!
```

### データベースのページ一覧取得

```ts
// Notion DB からすべてのページを取得（ページネーション対応）
async function getAllPages() {
  const pages: NotionPage[] = []
  let cursor: string | undefined = undefined

  do {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      start_cursor: cursor,
      page_size: 100, // 最大値
    })

    for (const page of response.results) {
      if (page.object !== 'page') continue
      pages.push(await extractPageData(page))
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined
  } while (cursor)

  return pages
}
```

### ページコンテンツ（ブロック）の取得

```ts
// ページのブロックからテキストを再帰的に取得（最大2レベル）
async function getPageContent(pageId: string, depth = 0): Promise<string> {
  if (depth > 1) return '' // 深さ制限（API コスト対策）

  const response = await notion.blocks.children.list({
    block_id: pageId,
    page_size: 100,
  })

  const texts: string[] = []

  for (const block of response.results) {
    if (!('type' in block)) continue

    // テキストを持つブロックタイプからテキストを抽出
    const text = extractTextFromBlock(block)
    if (text) texts.push(text)

    // 子ブロックを再帰的に取得
    if (block.has_children && depth < 1) {
      const childText = await getPageContent(block.id, depth + 1)
      if (childText) texts.push(childText)
    }
  }

  return texts.join('\n')
}

// ブロックからプレーンテキストを抽出
function extractTextFromBlock(block: BlockObjectResponse): string {
  const richTextBlocks = [
    'paragraph', 'heading_1', 'heading_2', 'heading_3',
    'bulleted_list_item', 'numbered_list_item', 'quote',
    'callout', 'toggle', 'code',
  ] as const

  for (const type of richTextBlocks) {
    if (block.type === type) {
      const blockData = (block as Record<string, unknown>)[type] as {
        rich_text: Array<{ plain_text: string }>
      }
      return blockData.rich_text.map((t) => t.plain_text).join('')
    }
  }

  return ''
}
```

### ページタイトルの取得

```ts
function extractTitle(page: PageObjectResponse): string {
  const titleProp = Object.values(page.properties).find(
    (prop) => prop.type === 'title'
  )
  if (!titleProp || titleProp.type !== 'title') return '無題'
  return titleProp.title.map((t) => t.plain_text).join('')
}
```

---

## `POST /api/sync` Route Handler

```ts
// app/api/sync/route.ts
import { NextRequest } from 'next/server'
import { syncNotionToSupabase } from '@/lib/notion-sync'

export async function POST(_request: NextRequest) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        await syncNotionToSupabase({
          onProgress: (current, total) => {
            send({ status: 'syncing', current, total })
          },
        })
        send({ status: 'done' })
      } catch (error) {
        console.error('[/api/sync]', error)
        send({ status: 'error', message: '同期中にエラーが発生しました' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

---

## `POST /api/chat` Route Handler

```ts
// app/api/chat/route.ts
import { NextRequest } from 'next/server'
import { embedText, buildSystemPrompt, streamChat } from '@/lib/gemini'
import { supabaseAdmin } from '@/lib/supabase'
import type { MatchedNote } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json() as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
    }

    const lastUserMessage = messages.findLast((m) => m.role === 'user')
    if (!lastUserMessage) {
      return Response.json({ error: '質問が見つかりません' }, { status: 400 })
    }

    // 1. 質問をベクトル化
    const queryEmbedding = await embedText(lastUserMessage.content)

    // 2. 関連ノートを検索（上位3件）
    const { data: matchedNotes, error } = await supabaseAdmin.rpc('match_notes', {
      query_embedding: queryEmbedding,
      match_count: 3,
    })
    if (error) throw new Error(`[match_notes] ${error.message}`)

    // 3. System Prompt を構築
    const systemPrompt = buildSystemPrompt(matchedNotes as MatchedNote[])

    // 4. Gemini でストリーミング回答を生成
    // messages を Gemini の形式に変換
    const geminiMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const result = await streamChat(systemPrompt, geminiMessages)

    // 5. ストリーミングレスポンスを返す
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        for await (const chunk of result.stream) {
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
  } catch (error) {
    console.error('[/api/chat]', error)
    return Response.json({ error: 'チャットの処理中にエラーが発生しました' }, { status: 500 })
  }
}
```

---

## クライアントサイドでのストリーム受信

```ts
// Client Component でのストリーミング受信パターン
async function sendMessage(content: string) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [...messages, { role: 'user', content }] }),
  })

  if (!response.ok) throw new Error('チャットAPIでエラーが発生しました')
  if (!response.body) throw new Error('レスポンスボディがありません')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let assistantMessage = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    assistantMessage += chunk

    // React state を更新してリアルタイム表示
    setStreamingMessage(assistantMessage)
  }
}
```

---

## API セキュリティ

- Route Handler は認証なし（個人用アプリのため）。公開する場合は Basic Auth か Vercel の Password Protection を使用すること
- `Content-Type: application/json` のバリデーションを必要に応じて追加
- リクエストボディのサイズ制限: Next.js のデフォルト（4MB）に従う

---

## ファイル・関数サイズ制限

### Route Handler（`app/api/*/route.ts`）
- **100行以内**を厳守する
- ビジネスロジックは `lib/` に切り出し、Route Handler はオーケストレーションのみを担う

```
Route Handler の役割（100行以内に収める）
  ↓ リクエストパース
  ↓ lib 関数の呼び出し（Embedding・検索・生成）
  ↓ レスポンス返却
```

### `lib/gemini.ts`
- **200行以内**。超える場合は以下のように分割する
  - `lib/gemini-embed.ts` — Embedding 関数
  - `lib/gemini-chat.ts` — Chat・ストリーミング関数
  - `lib/gemini.ts` — 再エクスポートのみ

### 関数の行数
- **1関数 30行以内**を目安にする
- ストリーム処理・プロンプト構築・エラーハンドリングはそれぞれ別関数に切り出す

```ts
// ✅ Good: Route Handler は各処理を呼び出すだけ
export async function POST(request: NextRequest) {
  const { messages } = await parseRequest(request)
  const embedding = await embedLastMessage(messages)
  const notes = await findRelatedNotes(embedding)
  const systemPrompt = buildSystemPrompt(notes)
  return streamResponse(systemPrompt, messages)
}

// ❌ Bad: Route Handler にすべてのロジックを書かない
```

---

## フォーマット・コーディングスタイル

- **インデント**: スペース 2 つ
- **セミコロン**: あり
- **クォート**: シングルクォート `'`
- **末尾カンマ**: あり
- **最大行長**: **100文字**

```ts
// ✅ Good: 長い引数は折り返す
return new Response(stream, {
  headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
  },
})

// ❌ Bad: 1行に詰め込まない
return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' } })
```

- **空行**: 処理のステップ（パース → 検索 → 生成）の間に1行空行を入れる
- **オブジェクト**: プロパティが3つ以上の場合は1プロパティ1行

### エラーログの形式

```ts
// ✅ Good: [ファイルパス or 関数名] プレフィックスを付ける
console.error('[/api/chat]', error)
console.error('[embedText]', error)
console.warn('[Gemini] レート制限に達しました。リトライします...')

// ❌ Bad: プレフィックスなしのログ
console.error(error)
console.log('error occurred')
```
