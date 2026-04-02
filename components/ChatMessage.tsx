'use client'

import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useState } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatMessageProps {
  message: Message
}

const mdComponents: Components = {
  p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-1 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-1 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="ml-2">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => <code className="bg-gray-700 px-1 rounded text-xs">{children}</code>,
  pre: ({ children }) => <pre className="bg-gray-700 p-2 rounded text-xs overflow-x-auto mb-1">{children}</pre>,
  table: ({ children }) => <div className="overflow-x-auto mb-1"><table className="text-xs border-collapse w-full">{children}</table></div>,
  th: ({ children }) => <th className="border border-gray-600 px-2 py-1 bg-gray-700 font-semibold text-left">{children}</th>,
  td: ({ children }) => <td className="border border-gray-600 px-2 py-1">{children}</td>,
  h1: ({ children }) => <h1 className="text-base font-bold mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
}

// ### 見出しごとにセクション分割
function parseAccordionSections(content: string): Array<{ title: string; body: string }> | null {
  if (!/^###\s/m.test(content)) return null
  const parts = content.split(/(?=^###\s)/m).filter(Boolean)
  const sections = parts
    .map((part) => {
      const match = part.match(/^###\s+(.+)\n?([\s\S]*)$/)
      if (!match) return null
      return { title: match[1].trim(), body: match[2].trim() }
    })
    .filter((s): s is { title: string; body: string } => s !== null)
  return sections.length > 0 ? sections : null
}

function AccordionItem({ title, body }: { title: string; body: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-700 last:border-0 py-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left flex justify-between items-center gap-2 py-1"
      >
        <span className="font-semibold text-sm">{title}</span>
        <span className="text-purple-400 text-xs flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="pt-1 pb-2 text-gray-300 text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{body}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const sections = !isUser ? parseAccordionSections(message.content) : null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm mr-2 flex-shrink-0 mt-1">
          AI
        </div>
      )}
      <div
        className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'bg-purple-600 text-white rounded-tr-sm'
            : 'bg-gray-800 text-gray-100 rounded-tl-sm'
        }`}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : sections ? (
          <div>
            {sections.map((s, i) => (
              <AccordionItem key={i} title={s.title} body={s.body} />
            ))}
          </div>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{message.content}</ReactMarkdown>
        )}
      </div>
    </div>
  )
}
