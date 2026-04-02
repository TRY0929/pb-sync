import { NextRequest } from 'next/server'
import { embedText, buildSystemPrompt, streamChat, MatchedNote } from '@/lib/gemini'
import { supabaseAdmin } from '@/lib/supabase'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const messages: ChatMessage[] = body.messages

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'messages is required' }, { status: 400 })
    }

    const lastUserMessage = messages.filter((m) => m.role === 'user').at(-1)
    if (!lastUserMessage) {
      return Response.json({ error: 'No user message found' }, { status: 400 })
    }

    // 質問をベクトル化
    const queryEmbedding = await embedText(lastUserMessage.content)

    // コサイン類似度で上位3件の関連ノートを検索
    const { data: matchedNotes, error } = await supabaseAdmin.rpc('match_notes', {
      query_embedding: queryEmbedding,
      match_count: 3,
    })

    if (error) throw new Error(`[Supabase RPC match_notes] ${error.message}`)

    console.log(`[/api/chat] matched notes: ${(matchedNotes as MatchedNote[])?.map((n) => `"${n.title}" (similarity: ${n.similarity.toFixed(3)})`).join(', ') || 'none'}`)

    // System Prompt 構築
    const systemPrompt = buildSystemPrompt((matchedNotes as MatchedNote[]) ?? [])

    // Gemini 形式のメッセージ履歴に変換
    const geminiMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    }))

    // ストリーミングチャット
    const result = await streamChat(systemPrompt, geminiMessages)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result) {
            const text = chunk.text
            if (text) {
              controller.enqueue(encoder.encode(text))
            }
          }
        } catch (error) {
          console.error('[/api/chat stream]', error)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[/api/chat]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
