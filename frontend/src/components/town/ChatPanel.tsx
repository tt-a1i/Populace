import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { chatWithResident } from '../../services/api'
import { generateResidentAvatarDataUrl } from '../../lib/residentAvatar'

interface ChatMessage {
  id: string
  role: 'user' | 'resident'
  text: string
  displayedText?: string
}

interface ChatPanelProps {
  residentId: string
  resident: {
    id: string
    name: string
    mood?: string
    occupation?: string
    skinColor?: string | null
    hairStyle?: string | null
    hairColor?: string | null
    outfitColor?: string | null
  }
  onClose: () => void
}

export function ChatPanel({ residentId, resident, onClose }: ChatPanelProps) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const avatarUrl = generateResidentAvatarDataUrl(resident)

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Cleanup typing interval on unmount
  useEffect(() => {
    return () => {
      if (typingRef.current) clearInterval(typingRef.current)
    }
  }, [])

  const typewriterEffect = (messageId: string, fullText: string) => {
    let charIndex = 0
    if (typingRef.current) clearInterval(typingRef.current)

    typingRef.current = setInterval(() => {
      charIndex += 1
      if (charIndex >= fullText.length) {
        if (typingRef.current) clearInterval(typingRef.current)
        typingRef.current = null
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, displayedText: fullText } : m,
          ),
        )
        return
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, displayedText: fullText.slice(0, charIndex) }
            : m,
        ),
      )
    }, 30)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSending(true)

    try {
      const result = await chatWithResident(residentId, text)
      const replyId = `reply-${Date.now()}`
      const replyMsg: ChatMessage = {
        id: replyId,
        role: 'resident',
        text: result.reply,
        displayedText: '',
      }
      setMessages((prev) => [...prev, replyMsg])
      typewriterEffect(replyId, result.reply)
    } catch {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'resident',
        text: t('chat.error', '\u56DE\u590D\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5'),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex h-full flex-col" data-testid="chat-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/8 pb-3">
        <div className="flex items-center gap-2.5">
          <img
            src={avatarUrl}
            alt={resident.name}
            className="h-8 w-8 rounded-xl border border-white/10 object-cover"
          />
          <div>
            <p className="text-sm font-medium text-white">{resident.name}</p>
            <p className="text-[10px] text-slate-400">
              {resident.occupation ?? ''} &middot; {resident.mood ?? 'neutral'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn-micro rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-300 transition hover:bg-white/10 active:scale-95"
        >
          {t('chat.back', '\u8FD4\u56DE')}
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
      >
        {messages.length === 0 && (
          <div className="flex h-20 items-center justify-center">
            <p className="text-xs text-slate-500">
              {t('chat.hint', `\u5F00\u59CB\u548C ${resident.name} \u804A\u5929\u5427`)}
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {msg.role === 'resident' && (
              <img
                src={avatarUrl}
                alt={resident.name}
                className="h-7 w-7 shrink-0 rounded-lg border border-white/10 object-cover"
              />
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-500/20 text-blue-50'
                  : 'border border-white/6 bg-slate-900/60 text-slate-200'
              }`}
            >
              {msg.role === 'resident' && msg.displayedText !== undefined
                ? msg.displayedText || '\u00A0'
                : msg.text}
              {msg.role === 'resident' &&
                msg.displayedText !== undefined &&
                msg.displayedText.length < msg.text.length && (
                  <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-slate-400" />
                )}
            </div>
            {msg.role === 'user' && (
              <div className="h-7 w-7 shrink-0 rounded-lg border border-blue-400/20 bg-blue-500/10 flex items-center justify-center text-[11px] text-blue-200">
                {'\u{1F464}'}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2.5">
            <img
              src={avatarUrl}
              alt={resident.name}
              className="h-7 w-7 shrink-0 rounded-lg border border-white/10 object-cover"
            />
            <div className="rounded-2xl border border-white/6 bg-slate-900/60 px-3 py-2">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSend()
            }
          }}
          placeholder={t('chat.placeholder', `\u5BF9 ${resident.name} \u8BF4\u70B9\u4EC0\u4E48\u2026`)}
          disabled={sending}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !input.trim()}
          className="btn-micro shrink-0 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-200 transition hover:bg-cyan-400/20 active:scale-95 disabled:opacity-40"
        >
          {t('chat.send', '\u53D1\u9001')}
        </button>
      </div>
    </div>
  )
}
