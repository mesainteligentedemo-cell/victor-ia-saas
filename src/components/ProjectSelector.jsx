import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const PROJECTS = [
  { id: 'victor-ia-website', name: 'Victor IA Website', emoji: '🌐' },
  { id: 'costa-negra', name: 'Costa Negra', emoji: '🏖️' },
  { id: 'lativa', name: 'LATIVA (Video)', emoji: '🎬' },
  { id: 'influence-ia', name: 'Influence IA', emoji: '🏆' },
  { id: 'seabird-hotel', name: 'Seabird Hotel', emoji: '🏨' },
  { id: 'roes-co', name: 'ROES & CO', emoji: '💰' }
]

export default function ProjectSelector({ currentProject, onProjectSelect }) {
  const [isOpen, setIsOpen] = useState(false)

  const selectedProject = currentProject
    ? PROJECTS.find(p => p.id === currentProject.projectId)
    : null

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-accent-cyan mb-2">
        CURRENT PROJECT
      </label>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-dark-700 hover:bg-dark-600 text-dark-100 px-3 py-2 rounded-lg border border-dark-600 focus:border-accent-cyan focus:outline-none transition flex justify-between items-center text-sm"
      >
        <span>
          {selectedProject ? `${selectedProject.emoji} ${selectedProject.name}` : 'Auto-detect'}
        </span>
        <ChevronDown size={16} className={`transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-dark-700 border border-dark-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
          <button
            onClick={() => {
              onProjectSelect(null)
              setIsOpen(false)
            }}
            className="w-full text-left px-3 py-2 hover:bg-dark-600 transition text-sm text-dark-100 border-b border-dark-600"
          >
            🔄 Auto-detect
          </button>

          {PROJECTS.map(project => (
            <button
              key={project.id}
              onClick={() => {
                onProjectSelect({
                  projectId: project.id,
                  projectName: project.name,
                  confidence: 1
                })
                setIsOpen(false)
              }}
              className={`w-full text-left px-3 py-2 hover:bg-dark-600 transition text-sm border-b border-dark-600 last:border-0 ${
                selectedProject?.id === project.id
                  ? 'bg-dark-600 text-accent-cyan'
                  : 'text-dark-100'
              }`}
            >
              {project.emoji} {project.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}