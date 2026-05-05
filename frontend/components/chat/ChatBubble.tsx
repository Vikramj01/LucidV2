import type { ChatMessage } from '@/store/chat'

export function ChatBubble({ message }: { message: ChatMessage }) {
  const isVimi = message.role === 'vimi'

  return (
    <div className={`flex gap-2.5 ${isVimi ? 'items-start' : 'items-start flex-row-reverse'}`}>
      {/* Avatar */}
      <div
        className={[
          'h-6 w-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5',
          isVimi ? 'bg-[#2D7DD2] text-white' : 'bg-[#21262D] text-[#8B949E]',
        ].join(' ')}
      >
        {isVimi ? 'V' : 'U'}
      </div>

      {/* Bubble */}
      <div
        className={[
          'max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed',
          isVimi
            ? 'bg-[#161B22] border border-[#30363D] text-[#E6EDF3]'
            : 'bg-[#2D7DD2] text-white',
        ].join(' ')}
      >
        {message.content}
      </div>
    </div>
  )
}
