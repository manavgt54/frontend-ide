import AIChatbot from './AIChatbot'

interface AIChatPanelProps {
  onRefreshFiles?: () => void
}

export function AIChatPanel({ onRefreshFiles }: AIChatPanelProps) {
  return (
    <div className="ai-chat-panel">
      <AIChatbot onRefreshFiles={onRefreshFiles} />
    </div>
  )
}
