import React from 'react'
import { useStore } from '../store/index.js'
import { formatDate, diffDays } from '../lib/utils.js'
import { PROJECT_STATUS_LABELS } from '../lib/supabase.js'
import { HomeDashboard } from '../components/HomeDashboard.jsx'

const STATUS_COLORS = {
  planning: ['var(--neutral-bg)', 'var(--neutral)'],
  active: ['var(--info-bg)', 'var(--info)'],
  on_hold: ['var(--warning-bg)', 'var(--warning)'],
  completed: ['var(--success-bg)', 'var(--success)'],
  cancelled: ['var(--danger-bg)', 'var(--danger)'],
}

export function ProjectsPage() {
  const { projects, members, loadProject } = useStore()

  // Group by provincia
  const grouped = {}
  projects.forEach(p => {
    const group = p.provincia || 'Sin provincia'
    if (!grouped[group]) grouped[group] = []
    grouped[group].push(p)
  })

  return (
    <div className="projects-page">
      <HomeDashboard />
      <div className="projects-page-header">
        <h1 className="projects-page-title">Centro de Proyectos</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{projects.length} proyectos</span>
        </div>
      </div>

      {projects.length === 0 && (
        <div className="empty-state">No hay proyectos todavía.</div>
      )}

      {Object.entries(grouped).map(([group, ps]) => (
        <div key={group} className="province-group">
          <div className="province-title">📍 {group}</div>
          <div className="pc-grid">
            {ps.map(p => {
              const mgr = p.manager_id ? members.find(m => m.id === p.manager_id) : null
              const [bg, fg] = STATUS_COLORS[p.status] || STATUS_COLORS.active
              const dur = diffDays(p.start_date, p.end_date) + 1
              return (
                <div key={p.id} className="pc-card" onClick={() => loadProject(p.id)}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                    <div style={{ width: 4, borderRadius: 2, background: p.color || 'var(--brand)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pc-card-name">{p.name}</div>
                      <span className="status-pill" style={{ background: bg, color: fg, marginBottom: 8, display: 'inline-flex' }}>
                        {PROJECT_STATUS_LABELS[p.status] || p.status}
                      </span>
                      <div className="pc-card-meta">
                        {p.ciclo_vida && <span>🔄 {p.ciclo_vida}</span>}
                        {mgr && <span>👤 {mgr.name}</span>}
                        <span>📅 {formatDate(p.start_date)} → {formatDate(p.end_date)}</span>
                        <span>⏱️ {dur} días</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
