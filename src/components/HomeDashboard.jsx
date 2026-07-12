import React, { useState, useEffect, useMemo } from 'react'
import { useStore } from '../store/index.js'
import { useAuth } from '../store/auth.js'
import { sb } from '../lib/supabase.js'
import { isOverdue, formatDate } from '../lib/utils.js'

/**
 * Dashboard de gestión en la home.
 * Carga datos reales de todos los proyectos de la empresa al montar.
 * Visible solo para admin/editor.
 */
export function HomeDashboard() {
  const { canEdit } = useAuth()
  const { projects } = useStore()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!canEdit || projects.length === 0) { setLoading(false); return }
    // Cargar todas las tareas de todos los proyectos de la empresa (RLS filtra por empresa)
    sb.from('tasks').select('id,name,status,progress,end_date,assigned_to,is_milestone,project_id')
      .then(({ data }) => { setTasks(data || []); setLoading(false) })
  }, [projects.length, canEdit])

  const { members } = useStore()

  const stats = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter(t => t.status === 'completed').length
    const inProgress = tasks.filter(t => t.status === 'in_progress').length
    const overdue = tasks.filter(t => isOverdue(t)).length
    const activeProjs = projects.filter(p => p.status === 'active').length

    // Próximos hitos globales (30 días)
    const today = new Date()
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30)
    const milestones = tasks
      .filter(t => t.is_milestone && t.end_date && new Date(t.end_date) >= today && new Date(t.end_date) <= in30)
      .sort((a, b) => new Date(a.end_date) - new Date(b.end_date))
      .slice(0, 6)

    // Tareas vencidas por responsable
    const overdueByMember = {}
    tasks.filter(t => isOverdue(t) && t.status !== 'completed' && t.assigned_to).forEach(t => {
      overdueByMember[t.assigned_to] = (overdueByMember[t.assigned_to] || 0) + 1
    })
    const overdueRanking = Object.entries(overdueByMember)
      .map(([id, n]) => ({ name: members.find(m => m.id === id)?.name || 'Sin nombre', n }))
      .sort((a, b) => b.n - a.n).slice(0, 5)

    return { total, completed, inProgress, overdue, activeProjs, milestones, overdueRanking }
  }, [tasks, projects, members])

  if (!canEdit) return null
  if (loading) return <div style={{ padding: '20px 28px', fontSize: 13, color: 'var(--text-3)' }}>Cargando dashboard…</div>
  if (tasks.length === 0) return null

  const { total, completed, inProgress, overdue, activeProjs, milestones, overdueRanking } = stats

  return (
    <div style={{ padding: '20px 28px 0' }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Kpi value={activeProjs} label="Proyectos activos" color="var(--brand)" />
        <Kpi value={total} label="Tareas totales" color="var(--text-2)" />
        <Kpi value={completed} label="Completadas" color="var(--success)" />
        <Kpi value={inProgress} label="En curso" color="var(--info)" />
        <Kpi value={overdue} label="Vencidas" color={overdue > 0 ? 'var(--danger)' : 'var(--success)'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Próximos hitos */}
        <DashSection title="◆ Próximos hitos (30 días)">
          {milestones.length === 0
            ? <Empty text="Sin hitos en los próximos 30 días" />
            : milestones.map(t => {
              const proj = projects.find(p => p.id === t.project_id)
              return (
                <Row key={t.id}
                  left={<><span style={{ fontWeight: 600 }}>{t.name}</span><span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>{proj?.name}</span></>}
                  right={<span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 12 }}>{formatDate(t.end_date)}</span>}
                />
              )
            })
          }
        </DashSection>

        {/* Vencidas por responsable */}
        <DashSection title="⚠ Vencidas por responsable">
          {overdueRanking.length === 0
            ? <Empty text="Sin tareas vencidas asignadas 🎉" color="var(--success)" />
            : overdueRanking.map(({ name, n }) => (
              <Row key={name}
                left={<span style={{ fontWeight: 500 }}>👤 {name}</span>}
                right={<span style={{ color: 'var(--danger)', fontWeight: 700 }}>{n} tarea(s)</span>}
              />
            ))
          }
        </DashSection>
      </div>
    </div>
  )
}

const Kpi = ({ value, label, color }) => (
  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
    <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{label}</div>
  </div>
)

const DashSection = ({ title, children }) => (
  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>{title}</div>
    {children}
  </div>
)

const Row = ({ left, right }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
    <span style={{ flex: 1, marginRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</span>
    {right}
  </div>
)

const Empty = ({ text, color }) => (
  <p style={{ fontSize: 13, color: color || 'var(--text-3)', margin: 0, padding: '8px 0' }}>{text}</p>
)
