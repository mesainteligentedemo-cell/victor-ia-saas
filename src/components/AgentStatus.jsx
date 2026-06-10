import React from 'react'

const AGENTS = [
  { id: 'arquitecto', name: 'Arquitecto', role: 'Líder', emoji: '🏛️' },
  { id: 'frontend-dev', name: 'Frontend Dev', role: 'Implementador', emoji: '💻' },
  { id: 'designer', name: 'Designer', role: 'Implementador', emoji: '🎨' },
  { id: 'revisor', name: 'Revisor', role: 'QA', emoji: '✅' }
]

export default function AgentStatus({ isLoading }) {
  return (
    <div className="bg-dark-800 border-t border-dark-700 px-6 py-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-accent-cyan">AGENTS:</span>

        <div className="flex gap-2 flex-wrap">
          {AGENTS.map(agent => (
            <div
              key={agent.id}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition ${
                isLoading
                  ? 'bg-accent-blue/20 text-accent-blue animate-pulse'
                  : 'bg-dark-700 text-dark-200'
              }`}
            >
              <span>{agent.emoji}</span>
              <span>{agent.name}</span>
              {isLoading && <span className="w-1.5 h-1.5 bg-accent-blue rounded-full animate-pulse"></span>}
            </div>
          ))}
        </div>

        <span className="ml-auto text-xs text-dark-400">
          {isLoading ? '⏳ Processing...' : '✓ Ready'}
        </span>
      </div>
    </div>
  )
}
