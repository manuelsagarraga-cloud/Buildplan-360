import React from 'react'
import { useStore } from '../store/index.js'

export function ResourcesPage() {
  const { members, editMode, openResourceModal } = useStore()

  const active = members.filter(m => m.active)
  const inactive = members.filter(m => !m.active)

  return (
    <div className="resources-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>Centro de Recursos</h1>
        {editMode && (
          <button className="btn btn-primary" onClick={() => openResourceModal(null)}>
            + Nuevo recurso
          </button>
        )}
      </div>

      {active.length === 0 && inactive.length === 0 && (
        <div className="empty-state">No hay recursos todavía.</div>
      )}

      {active.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 12 }}>
            Activos ({active.length})
          </div>
          <div className="resources-grid">
            {active.map(m => <ResourceCard key={m.id} member={m} />)}
          </div>
        </>
      )}

      {inactive.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginTop: 28, marginBottom: 12 }}>
            Inactivos ({inactive.length})
          </div>
          <div className="resources-grid">
            {inactive.map(m => <ResourceCard key={m.id} member={m} inactive />)}
          </div>
        </>
      )}
    </div>
  )
}

function ResourceCard({ member: m, inactive }) {
  const { editMode, openResourceModal } = useStore()
  const initials = m.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()

  return (
    <div className="resource-card" style={{ opacity: inactive ? 0.6 : 1 }}>
      <div className="avatar" style={{ background: m.color, width: 44, height: 44, fontSize: 14, flexShrink: 0 }}>
        {initials}
      </div>
      <div className="resource-card-info">
        <div className="resource-card-name">{m.name}</div>
        {m.role && <div className="resource-card-role">{m.role}</div>}
        {m.email && <div className="resource-card-email">✉ {m.email}</div>}
        {inactive && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>Inactivo</div>}
      </div>
      {editMode && (
        <div className="resource-card-actions">
          <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => openResourceModal(m)}>✏️</button>
        </div>
      )}
    </div>
  )
}
