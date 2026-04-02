import { NextRequest } from 'next/server'
import { syncNotionToSupabase } from '@/lib/notion-sync'

export async function POST(_request: NextRequest) {
  const encoder = new TextEncoder()
  let controllerClosed = false

  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (data: string) => {
        if (controllerClosed) return
        try {
          controller.enqueue(encoder.encode(data))
        } catch {
          controllerClosed = true
        }
      }

      try {
        await syncNotionToSupabase((progress) => {
          safeEnqueue(`data: ${JSON.stringify(progress)}\n\n`)
        })
      } catch (error) {
        console.error('[/api/sync]', error)
        safeEnqueue(`data: ${JSON.stringify({ status: 'error', message: String(error) })}\n\n`)
      } finally {
        if (!controllerClosed) {
          controllerClosed = true
          controller.close()
        }
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
