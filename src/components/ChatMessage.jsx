import React from 'react'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

export default function ChatMessage({ message }) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-md bg-gradient-to-r from-accent-cyan to-accent-blue text-dark-900 rounded-lg p-4 shadow-glow-cyan">
          <p className="text-sm font-medium">{message.content}</p>
          <p className="text-xs text-dark-800 mt-1 opacity-70">
            {message.timestamp.toLocaleTimeString()}
          </p>
        </div>
      </div>
    )
  }

  if (message.isError) {
    return (
      <div className="flex justify-start animate-slide-up">
        <div className="max-w-md bg-red-900/20 border border-red-700/50 rounded-lg p-4">
          <p className="text-sm text-red-400">{message.content}</p>
        </div>
      </div>
    )
  }

  // Check if message contains code blocks
  const hasCode = message.content.includes('```')
  const codeRegex = /```(.*?)\n([\s\S]*?)```/g
  let htmlContent = message.content

  const codeBlocks = []
  let match

  while ((match = codeRegex.exec(message.content)) !== null) {
    codeBlocks.push({
      language: match[1] || 'plaintext',
      code: match[2]
    })
  }

  return (
    <div className="flex justify-start animate-slide-up">
      <div className="max-w-2xl bg-dark-800 border border-dark-700 rounded-lg p-4 shadow-card">
        {/* Text content */}
        <div className="text-sm text-dark-100 mb-2 leading-relaxed">
          {htmlContent.split('```')[0]}
        </div>

        {/* Code blocks */}
        {codeBlocks.map((block, idx) => (
          <div key={idx} className="mt-3 mb-3">
            <div className="flex justify-between items-center bg-dark-700 px-3 py-2 rounded-t text-xs text-dark-400">
              <span>{block.language}</span>
              <button
                onClick={() => copyToClipboard(block.code)}
                className="flex items-center gap-1 hover:text-accent-cyan transition"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <pre className="bg-dark-900 border-l-4 border-accent-blue rounded-b p-3 overflow-x-auto">
              <code className="text-xs text-dark-100 font-mono">
                {block.code}
              </code>
            </pre>
          </div>
        ))}

        {/* Metadata */}
        {message.project && (
          <div className="mt-3 pt-3 border-t border-dark-700 text-xs text-dark-400">
            <span className="inline-block bg-dark-700 px-2 py-1 rounded mr-2">
              📁 {message.project.projectName}
            </span>
            <span className="text-dark-500">
              {message.timestamp.toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}