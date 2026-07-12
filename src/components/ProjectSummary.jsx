import React, { useMemo } from 'react'
import { useStore } from '../store/index.js'
import { isOverdue, formatDate } from '../lib/utils.js'

/**
 * Resumen del proyecto: avance, estado de tareas, vencidas y próximos hitos.
 * No hace llamadas a la base — usa los datos ya cargados en el store.
 */
export function ProjectSummary() {
  const { tasks, currentProject } = useStore()

  const stats = useMemo(() => {
    const total = tasks.length
    if (!total) return null

    const completed = tasks.filter(t => t.status === 'completed').length
    const inProgress = tasks.filter(t => t.status === 'in_progress').length
    const pending = tasks.filter(t => t.status === 'pending').length
    const overdue = tasks.filter(t => isOverdue(t)).length
    const avgProgress = Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / total)

    // Próximos hitos (30 días)
    const today = new Date()
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30)
    const milestones = tasks
      .filter(t => t.is_milestone && t.end_date && new Date(t.end_date) >= today && new Date(t.end_date) <= in30)
      .sort((a, b) => new Date(a.end_date) - new Date(b.end_date))
      .slice(0, 8)

    // Vencidas recientes (sin completar)
    const overdueList = tasks
      .filter(t => isOverdue(t) && t.status !== 'completed')
      .sort((a, b) => new Date(a.end_date) - new Date(b.end_date))
      .slice(0, 8)

    return { total, completed, inProgress, pending, overdue, avgProgress, milestones, overdueList }
  }, [tasks])

  if (!currentProject) return null
  if (!stats) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
      <p>Este proyecto no tiene tareas todavía.</p>
    </div>
  )

  const { total, completed, inProgress, pending, overdue, avgProgress, milestones, overdueList } = stats

  return (
    <div style={{ padding: '24px 32px', overflowY: 'auto', flex: 1 }}>
      {/* KPIs principales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 28 }}>
        <KpiCard label="Avance promedio" value={avgProgress + '%'} color="var(--brand)" />
        <KpiCard label="Completadas" value={completed} sub={`de ${total}`} color="var(--success)" />
        <KpiCard label="En curso" value={inProgress} color="var(--info)" />
        <KpiCard label="Pendientes" value={pending} color="var(--text-2)" />
        <KpiCard label="Vencidas" value={overdue} color={overdue > 0 ? 'var(--danger)' : 'var(--success)'} />
      </div>

      {/* Barra de progreso */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>Progreso general</div>
        <div style={{ height: 10, background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: avgProgress + '%', background: 'var(--brand)', borderRadius: 6, transition: 'width .4s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
          <span>Completadas: {completed}</span><span>Total: {total}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Próximos hitos */}
        <Section title="◆ Próximos hitos (30 días)" empty="Sin hitos próximos">
          {milestones.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-1)', flex: 1, marginRight: 12 }} title={t.name}>{t.name}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(t.end_date)}</span>
            </div>
          ))}
        </Section>

        {/* Vencidas */}
        <Section title="⚠ Tareas vencidas sin completar" empty="¡Todo al día!" emptyColor="var(--success)">
          {overdueList.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-1)', flex: 1, marginRight: 12 }} title={t.name}>{t.name}</span>
              <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(t.end_date)}</span>
            </div>
          ))}
        </Section>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>{label}</div>
    </div>
  )
}

function Section({ title, children, empty, emptyColor }) {
  const items = React.Children.toArray(children)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 12 }}>{title}</div>
      {items.length === 0
        ? <p style={{ fontSize: 13, color: emptyColor || 'var(--text-3)', margin: 0 }}>{empty}</p>
        : items}
    </div>
  )
}
