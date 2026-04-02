'use client'

import { useEffect, useRef, useState } from 'react'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: 'こんにちは！ノートについて何でも聞いてください。',
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (content: string) => {
    const userMessage: Message = { role: 'user', content }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setIsLoading(true)

    // AI メッセージのプレースホルダーを追加
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok || !res.body) throw new Error('Chat request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: updated[updated.length - 1].content + chunk,
          }
          return updated
        })
      }
    } catch (error) {
      console.error('[ChatWindow]', error)
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'エラーが発生しました。もう一度お試しください。',
        }
        return updated
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* メッセージリスト */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((message, i) => (
          <ChatMessage key={i} message={message} />
        ))}
        {isLoading && messages.at(-1)?.content === '' && (
          <div className="flex justify-start mb-3">
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm mr-2 flex-shrink-0">
              AI
            </div>
            <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-2 text-sm text-gray-400">
              <span className="animate-pulse">考え中...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力フォーム */}
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </>
  )
}
