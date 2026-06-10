import React, { useState, useEffect } from 'react'
import { BookOpen, Clock, Zap } from 'lucide-react'

export default function MemorySidebar({ projectId }) {
  const [memory, setMemory] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (projectId) {
      fetchMemory()
    }
  }, [projectId])

  const fetchMemory = async () => {
    setLoading(true)
    try {
      const response = await fetch(`http://localhost:3000/api/memory/${projectId}`)
      const data = await response.json()
      setMemory(data)
    } catch (error) {
      console.error('Memory fetch error:', error)
      setMemory(null)
    }
    setLoading(false)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4">
      {/* Header */}
      <h3 className="font-semibold text-accent-cyan text-sm mb-3 flex items-center gap-2">
        <BookOpen size={16} />
        MEMORY & CONTEXT
      </h3>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {loading ? (
          <div className="text-xs text-dark-400 text-center py-4">
            Loading memory...
          </div>
        ) : memory && memory.memory && memory.memory.length > 0 ? (
          <>
            {/* Diaries */}
            <div>
              <p className="text-xs font-semibold text-dark-300 mb-2 flex items-center gap-1">
                <Clock size={12} />
                RECENT DIARIES
              </p>
              <div className="space-y-1">
                {memory.memory.slice(0, 3).map((diary, idx) => (
                  <button
                    key={idx}
                    className="w-full text-left p-2 bg-dark-700 hover:bg-dark-600 rounded text-xs text-dark-200 transition truncate"
                    title={diary}
                  >
                    📝 {diary.substring(0, 30)}...
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-dark-700 rounded p-2">
              <p className="text-xs text-dark-400">
                <Zap size={12} className="inline mr-1" />
                {memory.memory.length} diaries found
              </p>
            </div>
          </>
        ) : (
          <div className="text-xs text-dark-400 text-center py-8">
            <p>No project memory yet</p>
            <p className="text-dark-500 mt-2">Select a project to view its history</p>
          </div>
        )}
      </div>

      {/* Refresh button */}
      {projectId && (
        <button
          onClick={fetchMemory}
          className="w-full mt-4 px-3 py-2 bg-dark-700 hover:bg-dark-600 rounded text-xs transition text-dark-100"
        >
          🔄 Refresh
        </button>
      )}
    </div>
  )
}