import React, { useState, useEffect, useMemo } from 'react'
import { useStore } from '../store/index.js'
import { sb } from '../lib/supabase.js'
import { isOverdue, formatDate } from '../lib/utils.js'

/**
 * Tablero global de empresa — vista de todos los proyectos a la vez.
 * Accesible a todos los usuarios logueados.
 */
export function BoardPage() {
  const { projects, members } = useStore()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (projects.length === 0) { setLoading(false); return }
    sb.from('tasks')
      .select('id,name,status,progress,end_date,start_date,assigned_to,is_milestone,project_id,contratista,rubro')
      .then(({ data }) => { setTasks(data || []); setLoading(false) })
  }, [projects.length])

  const stats = useMemo(() => {
    const today = new Date()
    const in60 = new Date(today); in60.setDate(in60.getDate() + 60)

    // Por proyecto
    const byProject = projects.map(p => {
      const pt = tasks.filter(t => t.project_id === p.id)
      const total = pt.length
      const completed = pt.filter(t => t.status === 'completed').length
      const overdue = pt.filter(t => isOverdue(t)).length
      const avg = total ? Math.round(pt.reduce((s, t) => s + (t.progress || 0), 0) / total) : 0
      return { ...p, total, completed, overdue, avg }
    }).filter(p => p.total > 0).sort((a, b) => b.overdue - a.overdue)

    // Próximos hitos 60 días
    const milestones = tasks
      .filter(t => t.is_milestone && t.end_date
        && new Date(t.end_date) >= today
        && new Date(t.end_date) <= in60
        && t.status !== 'completed')
      .sort((a, b) => new Date(a.end_date) - new Date(b.end_date))
      .slice(0, 10)

    // Carga por contratista
    const byContratista = {}
    tasks.filter(t => t.contratista && t.status !== 'completed').forEach(t => {
      if (!byContratista[t.contratista]) byContratista[t.contratista] = { total: 0, overdue: 0 }
      byContratista[t.contratista].total++
      if (isOverdue(t)) byContratista[t.contratista].overdue++
    })
    const contratistaRanking = Object.entries(byContratista)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.total - a.total).slice(0, 8)

    // Carga por rubro
    const byRubro = {}
    tasks.filter(t => t.rubro && t.status !== 'completed').forEach(t => {
      if (!byRubro[t.rubro]) byRubro[t.rubro] = { total: 0, overdue: 0 }
      byRubro[t.rubro].total++
      if (isOverdue(t)) byRubro[t.rubro].overdue++
    })
    const rubroRanking = Object.entries(byRubro)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.total - a.total).slice(0, 8)

    // KPIs globales
    const totalTasks = tasks.length
    const totalOverdue = tasks.filter(t => isOverdue(t)).length
    const activeProjs = projects.filter(p => p.status === 'active').length

    return { byProject, milestones, contratistaRanking, rubroRanking, totalTasks, totalOverdue, activeProjs }
  }, [tasks, projects])

  if (loading) return <Loading />

  const { byProject, milestones, contratistaRanking, rubroRanking, totalTasks, totalOverdue, activeProjs } = stats

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '24px 32px' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>📊 Tablero de empresa</h2>

      {/* KPIs globales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, marginBottom: 28 }}>
        <Kpi label="Proyectos activos" value={activeProjs} color="var(--brand)" />
        <Kpi label="Tareas totales" value={totalTasks} color="var(--text-2)" />
        <Kpi label="Vencidas" value={totalOverdue} color={totalOverdue > 0 ? 'var(--danger)' : 'var(--success)'} />
        <Kpi label="Hitos próx. 60d" value={milestones.length} color="var(--accent)" />
      </div>

      {/* Avance por proyecto */}
      <Section title="Avance por proyecto">
        {byProject.length === 0
          ? <Empty text="Sin proyectos con tareas" />
          : byProject.map(p => (
            <div key={p.id} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{p.name}</span>
                <span style={{ color: 'var(--text-3)', display: 'flex', gap: 12 }}>
                  {p.overdue > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>⚠ {p.overdue} vencidas</span>}
                  <span>{p.completed}/{p.total} tareas · {p.avg}%</span>
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: p.avg + '%', background: p.overdue > 0 ? 'var(--warning)' : 'var(--brand)', borderRadius: 4, transition: 'width .3s' }} />
              </div>
            </div>
          ))}
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
        {/* Próximos hitos */}
        <Section title="◆ Próximos hitos (60 días)">
          {milestones.length === 0
            ? <Empty text="Sin hitos en los próximos 60 días" />
            : milestones.map(t => {
                const proj = projects.find(p => p.id === t.project_id)
                return (
                  <Row key={t.id}
                    left={<><b>{t.name}</b><span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>{proj?.name}</span></>}
                    right={<span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(t.end_date)}</span>}
                  />
                )
              })}
        </Section>

        {/* Carga por contratista */}
        <Section title="🏗 Carga por contratista">
          {contratistaRanking.length === 0
            ? <Empty text="Sin tareas asignadas a contratistas" />
            : contratistaRanking.map(({ name, total, overdue }) => (
                <Row key={name}
                  left={<span style={{ fontWeight: 500 }}>{name}</span>}
                  right={<span style={{ fontSize: 12 }}>
                    {overdue > 0 && <span style={{ color: 'var(--danger)', marginRight: 8 }}>⚠{overdue}</span>}
                    <span style={{ color: 'var(--text-2)' }}>{total} tareas</span>
                  </span>}
                />
              ))}
        </Section>

        {/* Carga por rubro */}
        <Section title="🔧 Carga por rubro">
          {rubroRanking.length === 0
            ? <Empty text="Sin tareas asignadas por rubro" />
            : rubroRanking.map(({ name, total, overdue }) => (
                <Row key={name}
                  left={<span style={{ fontWeight: 500 }}>{name}</span>}
                  right={<span style={{ fontSize: 12 }}>
                    {overdue > 0 && <span style={{ color: 'var(--danger)', marginRight: 8 }}>⚠{overdue}</span>}
                    <span style={{ color: 'var(--text-2)' }}>{total} tareas</span>
                  </span>}
                />
              ))}
        </Section>
      </div>
    </div>
  )
}

const Kpi = ({ label, value, color }) => (
  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
    <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>{label}</div>
  </div>
)

const Section = ({ title, children }) => (
  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 14 }}>{title}</div>
    {children}
  </div>
)

const Row = ({ left, right }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13, gap: 8 }}>
    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</span>
    <span style={{ flexShrink: 0 }}>{right}</span>
  </div>
)

const Empty = ({ text }) => <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, padding: '8px 0' }}>{text}</p>
const Loading = () => <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando tablero…</div>
