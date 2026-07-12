import React from 'react'
import { useStore } from '../store/index.js'
import { formatDate, diffDays } from '../lib/utils.js'
import { PROJECT_STATUS_LABELS } from '../lib/supabase.js'
import { ExportPDF } from './ExportPDF.jsx'

const STATUS_COLORS = {
  planning: ['var(--neutral-bg)', 'var(--neutral)'],
  active: ['var(--info-bg)', 'var(--info)'],
  on_hold: ['var(--warning-bg)', 'var(--warning)'],
  completed: ['var(--success-bg)', 'var(--success)'],
  cancelled: ['var(--danger-bg)', 'var(--danger)'],
}

export function ProjectHeader() {
  const { currentProject, members, setPage, editMode, openProjectModal } = useStore()
  if (!currentProject) return null

  const p = currentProject
  const mgr = p.manager_id ? members.find(m => m.id === p.manager_id) : null
  const [bg, fg] = STATUS_COLORS[p.status] || STATUS_COLORS.active
  const dur = diffDays(p.start_date, p.end_date) + 1
  const cf = p.custom_fields || {}

  return (
    <div className="project-header">
      <div className="breadcrumb">
        <a onClick={() => setPage('projects')}>Proyectos</a>
        <span style={{ opacity: .5 }}>›</span>
        <span>{p.name}</span>
      </div>
      <div className="project-title-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 className="project-title">{p.name}</h1>
          <span className="status-pill" style={{ background: bg, color: fg }}>
            {PROJECT_STATUS_LABELS[p.status] || p.status}
          </span>
        </div>
        {editMode && (
          <>
            <ExportPDF />
            <button className="btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={openProjectModal}>
              ✏️ Editar proyecto
            </button>
          </>
        )}
      </div>
      <div className="project-meta">
        <span className="meta-item"><span style={{ opacity: .6 }}>👤</span><span className="meta-label">Manager:</span><span className="meta-value">{mgr ? mgr.name : 'Sin asignar'}</span></span>
        <span className="meta-div" />
        <span className="meta-item"><span style={{ opacity: .6 }}>📅</span><span className="meta-label">Inicio:</span><span className="meta-value">{formatDate(p.start_date)}</span></span>
        <span className="meta-div" />
        <span className="meta-item"><span style={{ opacity: .6 }}>🏁</span><span className="meta-label">Fin:</span><span className="meta-value">{formatDate(p.end_date)}</span></span>
        <span className="meta-div" />
        <span className="meta-item"><span style={{ opacity: .6 }}>⏱️</span><span className="meta-label">Duración:</span><span className="meta-value">{dur} días</span></span>
      </div>
      <div className="details-strip">
        <div className="detail-cell">
          <div className="detail-label">Provincia</div>
          <div className="detail-value">{p.provincia || '—'}</div>
        </div>
        <div className="detail-cell">
          <div className="detail-label">Ciclo de vida</div>
          <div className="detail-value">{p.ciclo_vida || '—'}</div>
        </div>
        {Object.entries(cf).map(([k, v]) => (
          <div key={k} className="detail-cell">
            <div className="detail-label">{k}</div>
            <div className="detail-value">{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
