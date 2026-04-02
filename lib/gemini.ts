import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

// テキストを 768 次元のベクトルに変換
export async function embedText(text: string): Promise<number[]> {
  // embedding API のトークン上限対策（約 8000 トークン ≒ 20000 文字で切り詰め）
  const truncated = text.slice(0, 20000)
  return withRetry(async () => {
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: [truncated],
      config: { outputDimensionality: 768 },
    })
    const values = result.embeddings?.[0]?.values
    if (!values) throw new Error('[Gemini] Embedding values not found')
    return values
  })
}

export interface MatchedNote {
  id: string
  notion_page_id: string
  title: string
  content: string
  similarity: number
}

// System Prompt に Notion ノートの内容を埋め込む
export function buildSystemPrompt(matchedNotes: MatchedNote[], suggestedTopics: string[] = []): string {
  const noteContents = matchedNotes
    .map((note, i) => `【ノート${i + 1}: ${note.title}】\n${note.content}`)
    .join('\n\n---\n\n')

  const topicSuggestion =
    suggestedTopics.length > 0
      ? `- ノートに記載がない場合は「記載なし」と出力し、改行後に以下のトピックから3つをランダムに選んで提示する:\n  例: 「こんな内容を私に聞いたらどう〜？: ${suggestedTopics.join('、')}」`
      : `- ノートに記載がない場合は「記載なし」のみ出力`

  return `ユーザーの個人学習ノートに基づいて回答するアシスタント。

【ルール】
- 敬語・前置き・まとめ不要。可愛く体言止めOK
- 各要点を以下の形式で出力（要点が1つでも同様）:

### 要点タイトル（15文字以内）
説明（比較の場合はテーブル形式で出力、最大3列）

- 要点は最大5つまで
${topicSuggestion}
- ノートの内容を優先する

${noteContents}

---
上記のノートを参考に回答。`
}

// ストリーミングチャット
export async function streamChat(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
) {
  return ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    config: { systemInstruction: systemPrompt },
    contents: messages,
  })
}

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
        error instanceof Error &&
        (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED'))
      if (!isRateLimit || attempt === maxRetries - 1) throw error

      const delay = baseDelay * Math.pow(2, attempt)
      console.warn(`[Gemini] レート制限に達しました。${delay}ms 後にリトライします...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw new Error('最大リトライ回数に達しました')
}
