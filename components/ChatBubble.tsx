'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { ChatMessage } from '@/lib/types'
import { rewriteMarkdownLinks } from '@/lib/parseMarkdown'

interface Props {
  message: ChatMessage
  onNavigate: (path: string) => void
  onPrompt: (text: string) => void
  onOpenURL?: (url: string) => void
}

export default function ChatBubble({ message, onNavigate, onPrompt, onOpenURL }: Props) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end px-4">
        <div className="max-w-[75%] rounded-[18px] px-[15px] py-[10px] text-[18px] leading-relaxed whitespace-pre-wrap" style={{ background: 'var(--bubble-bg)', color: 'var(--fg)' }}>
          {message.text}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-1">
      <div className="prose max-w-none text-[18px] leading-[1.6]" style={{ color: '#676767' }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          urlTransform={url => url}
          components={{
            a({ href, children }) {
              if (href?.startsWith('mailto:')) return <span>{children}</span>
              return (
                <a
                  href={href}
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!href) return
                    dispatchLink(href, onNavigate, onPrompt, onOpenURL)
                  }}
                  className="cursor-pointer"
                >
                  {children}
                </a>
              )
            },
          }}
        >
          {rewriteMarkdownLinks(message.text)}
        </ReactMarkdown>
      </div>
    </div>
  )
}

export function PulsingDot() {
  return (
    <div className="flex items-center px-6 py-4">
      <span className="inline-block w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: 'var(--fg-3)' }} />
    </div>
  )
}

// Shared with SectionCard — handles all link schemes that appear in story/chat content
function dispatchLink(
  link: string,
  onNavigate: (path: string) => void,
  onPrompt: (text: string) => void,
  onOpenURL?: (url: string) => void,
) {
  if (link.startsWith('nav://prompt/')) {
    const rest = link.slice('nav://prompt/'.length)
    const [encoded] = rest.split('?')
    onPrompt(decodeURIComponent(encoded))
  } else if (link.startsWith('nav://')) {
    onNavigate(link.slice('nav://'.length))
  } else if (link.startsWith('#nav/')) {
    onNavigate(link.slice('#nav/'.length))
  } else if (link.startsWith('#prompt/')) {
    onPrompt(decodeURIComponent(link.slice('#prompt/'.length)))
  } else if (link.startsWith('http://') || link.startsWith('https://')) {
    if (onOpenURL) onOpenURL(link)
    else window.open(link, '_blank', 'noopener,noreferrer')
  } else if (link && !link.startsWith('#') && !link.startsWith('?') && !link.includes('://')) {
    onNavigate(link.replace(/^\//, ''))
  }
}
