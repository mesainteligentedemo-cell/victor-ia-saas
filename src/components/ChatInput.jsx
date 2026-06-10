import React, { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Mic } from 'lucide-react'

export default function ChatInput({ onSendMessage, isLoading }) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef(null)

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim())
      setInput('')
      setSuggestions([])
    }
  }

  const handleInputChange = (e) => {
    const value = e.target.value
    setInput(value)

    // Show suggestions if input starts with / @ or $
    if (value.startsWith('/') || value.startsWith('@') || value.startsWith('$')) {
      const filtered = getSuggestions(value[0])
      setSuggestions(filtered)
      setShowSuggestions(true)
    } else {
      setShowSuggestions(false)
    }
  }

  const getSuggestions = (prefix) => {
    if (prefix === '/') {
      return [
        'pixel-perfecto',
        'brain-tracker-ux',
        'code-review',
        'deep-research'
      ]
    } else if (prefix === '@') {
      return [
        'arquitecto',
        'frontend-dev',
        'designer',
        'revisor'
      ]
    } else if (prefix === '$') {
      return [
        'git status',
        'npm run dev',
        'npm run build',
        'git commit'
      ]
    }
    return []
  }

  const selectSuggestion = (suggestion) => {
    const prefix = input[0]
    setInput(`${prefix}${suggestion} `)
    setSuggestions([])
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  return (
    <div className="bg-dark-800 border-t border-dark-700 p-4">
      <div className="relative">
        {/* Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 bg-dark-700 border border-dark-600 rounded-lg mb-2 max-h-48 overflow-y-auto">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => selectSuggestion(suggestion)}
                className="w-full text-left px-4 py-2 hover:bg-dark-600 transition text-sm text-dark-100 border-b border-dark-600 last:border-0"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Input Area */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="Type a message... (Cmd+K for commands, / for skills, @ for agents, $ for CLI)"
              className="w-full bg-dark-700 text-dark-100 px-4 py-3 rounded-lg border border-dark-600 focus:border-accent-cyan focus:outline-none transition resize-none max-h-24"
              rows="1"
            />
          </div>

          <div className="flex gap-2">
            <button
              className="p-2 bg-dark-700 hover:bg-dark-600 rounded-lg transition text-dark-400 hover:text-accent-cyan"
              title="Attach file"
            >
              <Paperclip size={20} />
            </button>

            <button
              className="p-2 bg-dark-700 hover:bg-dark-600 rounded-lg transition text-dark-400 hover:text-accent-cyan"
              title="Voice input"
            >
              <Mic size={20} />
            </button>

            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-2 bg-gradient-to-r from-accent-cyan to-accent-blue text-dark-900 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              <Send size={20} />
            </button>
          </div>
        </div>

        {/* Help text */}
        <div className="text-xs text-dark-400 mt-2">
          💡 Tip: Use <span className="text-accent-cyan">/</span> for skills,
          <span className="text-accent-cyan"> @</span> for agents,
          <span className="text-accent-cyan"> $</span> for CLI commands
        </div>
      </div>
    </div>
  )
}