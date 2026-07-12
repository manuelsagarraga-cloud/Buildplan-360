import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useStore } from '../store/index.js'
import { isOverdue, formatDate } from '../lib/utils.js'

/**
 * Panel de búsqueda global. Se activa con Ctrl+K o desde el sidebar.
 * Busca en todas las tareas del proyecto actual (datos ya cargados en el store).
 * Al hacer clic en un resultado, abre el modal de esa tarea.
 */
export function GlobalSearch({ open, onClose }) {
  const { tasks, members, openTaskModal } = useStore()
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  // Ctrl+K para abrir/cerrar desde cualquier lado
  useEffect(() => {
    const handler = e => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); open ? onClose() : null } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || q.length < 2) return []
    return tasks.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.rubro?.toLowerCase().includes(q) ||
      t.contratista?.toLowerCase().includes(q) ||
      t.nivel?.toLowerCase().includes(q) ||
      members.find(m => m.id === t.assigned_to)?.name?.toLowerCase().includes(q)
    ).slice(0, 30)
  }, [query, tasks, members])

  if (!open) return null

  function select(task) {
    openTaskModal(task)
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,.3)', overflow: 'hidden' }}>
        {/* Campo de búsqueda */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 18, opacity: .5 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar tareas, responsables, rubro, contratista…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent', color: 'var(--text-1)' }}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          />
          <kbd style={{ fontSize: 11, padding: '2px 6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer' }} onClick={onClose}>Esc</kbd>
        </div>

        {/* Resultados */}
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {query.length < 2 && (
            <div style={{ padding: '20px 24px', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
              Escribí al menos 2 caracteres para buscar
            </div>
          )}
          {query.length >= 2 && results.length === 0 && (
            <div style={{ padding: '20px 24px', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
              Sin resultados para "{query}"
            </div>
          )}
          {results.map(t => {
            const member = t.assigned_to ? members.find(m => m.id === t.assigned_to) : null
            const overdue = isOverdue(t)
            return (
              <div
                key={t.id}
                onClick={() => select(t)}
                style={{ padding: '10px 20px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Ícono de estado */}
                <span style={{ fontSize: 14, flexShrink: 0 }}>
                  {t.is_milestone ? '◆' : t.status === 'completed' ? '✅' : overdue ? '🔴' : t.status === 'in_progress' ? '🔵' : '⬜'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, display: 'flex', gap: 8 }}>
                    {member && <span>👤 {member.name}</span>}
                    {t.rubro && <span>{t.rubro}</span>}
                    {t.nivel && <span>{t.nivel}</span>}
                    {t.end_date && <span style={{ color: overdue ? 'var(--danger)' : 'inherit' }}>📅 {formatDate(t.end_date)}</span>}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{t.progress || 0}%</span>
              </div>
            )
          })}
        </div>

        {results.length > 0 && (
          <div style={{ padding: '8px 20px', fontSize: 11, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
            {results.length} resultado(s) — clic para abrir la tarea
          </div>
        )}
      </div>
    </div>
  )
}
