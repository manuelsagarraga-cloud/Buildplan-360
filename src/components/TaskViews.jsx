import React from 'react'
import { useStore } from '../store/index.js'
import { formatDate, isOverdue } from '../lib/utils.js'
import { STATUS_LABELS, PRIORITY_LABELS } from '../lib/supabase.js'

// ── Vista Lista ──────────────────────────────────────────────
export function ListView({ tasks }) {
  const { members, editMode, openTaskModal } = useStore()
  return (
    <div className="view-list">
      <table className="task-table">
        <thead>
          <tr>
            <th>#</th><th>Tarea</th><th>Responsable</th><th>Estado</th>
            <th>Prioridad</th><th>Inicio</th><th>Fin</th><th>Avance</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0
            ? <tr><td colSpan={8} className="empty-state">Sin tareas</td></tr>
            : tasks.map((t, i) => {
              const m = t.assigned_to ? members.find(x => x.id === t.assigned_to) : null
              const parent = t.parent_task_id ? tasks.find(x => x.id === t.parent_task_id) : null
              const barCol = t.status === 'completed' ? 'var(--success)' : t.status === 'blocked' ? 'var(--danger)' : t.status === 'in_progress' ? 'var(--info)' : 'var(--neutral)'
              return (
                <tr key={t.id} onClick={() => editMode && openTaskModal(t)}>
                  <td style={{ color: 'var(--text-3)', fontWeight: 600 }}>{i + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {parent && <div style={{ color: 'var(--text-3)', fontSize: 11 }}>↳ {parent.name}</div>}
                      {t.name}
                    </div>
                  </td>
                  <td>{m ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="avatar" style={{ background: m.color }}>{m.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</span>{m.name}</div> : <span style={{ color: 'var(--text-3)' }}>Sin asignar</span>}</td>
                  <td><span className={`badge badge-${t.status}`}>{STATUS_LABELS[t.status]}</span></td>
                  <td><span className={`badge badge-${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span></td>
                  <td><span className="date">{formatDate(t.start_date)}</span></td>
                  <td><span className={`date ${isOverdue(t) ? 'overdue' : ''}`}>{formatDate(t.end_date)}</span></td>
                  <td className="progress-cell">
                    <div className="progress">
                      <div className="progress-bar-bg"><div className="progress-bar" style={{ width: (t.progress || 0) + '%', background: barCol }} /></div>
                      <span className="progress-value">{t.progress || 0}%</span>
                    </div>
                  </td>
                </tr>
              )
            })
          }
        </tbody>
      </table>
    </div>
  )
}

// ── Vista Kanban / Tablero ───────────────────────────────────
export function KanbanView({ tasks }) {
  const { members, editMode, openTaskModal } = useStore()
  const cols = [
    { key: 'pending', label: 'Pendiente' },
    { key: 'in_progress', label: 'En progreso' },
    { key: 'completed', label: 'Completada' },
    { key: 'blocked', label: 'Bloqueada' },
  ]
  return (
    <div className="view-kanban">
      <div className="kanban-board">
        {cols.map(col => {
          const ct = tasks.filter(t => t.status === col.key)
          return (
            <div key={col.key} className="kanban-column">
              <div className="kanban-column-header">
                <span className="kanban-column-title">{col.label}</span>
                <span className="kanban-count">{ct.length}</span>
              </div>
              {ct.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-3)', fontSize: 12 }}>Sin tareas</div>}
              {ct.map(t => {
                const m = t.assigned_to ? members.find(x => x.id === t.assigned_to) : null
                return (
                  <div key={t.id} className="kanban-card" onClick={() => editMode && openTaskModal(t)}>
                    <div className="kanban-card-title">{t.name}</div>
                    <span className={`badge badge-${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span>
                    <div className="kanban-card-meta">
                      {m ? <span className="avatar" style={{ background: m.color }} title={m.name}>{m.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</span> : <span />}
                      <span className={`kanban-card-date ${isOverdue(t) ? 'overdue' : ''}`}>{formatDate(t.end_date)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
