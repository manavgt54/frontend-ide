import { useState } from 'react'
import { X } from 'lucide-react'

interface InputPrompt {
  id: number
  prompt: string
  value: string
}

interface InputDialogProps {
  isOpen: boolean
  prompts: string[]
  onSubmit: (values: string[]) => void
  onCancel: () => void
}

export function InputDialog({ isOpen, prompts, onSubmit, onCancel }: InputDialogProps) {
  const [inputs, setInputs] = useState<InputPrompt[]>(
    prompts.map((prompt, index) => ({
      id: index,
      prompt: prompt || `Input ${index + 1}:`,
      value: ''
    }))
  )

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(inputs.map(input => input.value))
  }

  const updateInput = (id: number, value: string) => {
    setInputs(prev => prev.map(input => 
      input.id === id ? { ...input, value } : input
    ))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[var(--panel)] border border-[var(--gutter)] rounded-lg p-6 w-96 max-w-full max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--text)]">
            Interactive Input Required
          </h3>
          <button
            onClick={onCancel}
            className="text-[var(--muted)] hover:text-[var(--text)] transition-fast"
          >
            <X size={20} />
          </button>
        </div>
        
        <p className="text-sm text-[var(--muted)] mb-4">
          This code requires user input. Please provide values for each prompt:
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {inputs.map((input) => (
            <div key={input.id} className="space-y-2">
              <label className="block text-sm font-medium text-[var(--text)]">
                {input.prompt}
              </label>
              <input
                type="text"
                value={input.value}
                onChange={(e) => updateInput(input.id, e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--gutter)] rounded text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                placeholder="Enter value..."
                autoFocus={input.id === 0}
              />
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-[var(--muted)] hover:text-[var(--text)] transition-fast"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent)] hover:opacity-90 transition-fast"
            >
              Run with Values
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
