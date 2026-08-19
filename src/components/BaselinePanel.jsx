import React, { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { useStore } from '../store/index.js'

function fmt(d) {
  if (!d) return '—'
  const p = String(d).slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d
}

function diffDays(a, b) {
  if (!a || !b) return null
  return Math.round((new Date(a) - new Date(b)) / 86400000)
}

export default function BaselinePanel({ onClose }) {
  const { currentProject, tasks } = useStore()
  const [baselines, setBaselines] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const pid = currentProject?.id

  useEffect(() => {
    if (!pid) return
    loadBaselines()
  }, [pid])

  async function loadBaselines() {
    setLoading(true)
    const { data, error } = await sb
      .from('project_baselines')
      .select('*')
      .eq('project_id', pid)
      .order('created_at', { ascending: false })
    if (!error) setBaselines(data || [])
    setLoading(false)
  }

  async function handleCreate() {
    const name = window.prompt('Nombre de la línea base:', `Línea base ${baselines.length + 1}`)
    if (name == null) return
    setCreating(true)
    const { error } = await sb.rpc('create_baseline', {
      p_project_id: pid,
      p_name: name || `Línea base ${baselines.length + 1}`,
    })
    if (error) {
      alert('No se pudo crear: ' + error.message)
    } else {
      await loadBaselines()
    }
    setCreating(false)
  }

  // Calcular variaciones vs última línea base
  const bl = baselines[0]
  const snap = bl && Array.isArray(bl.snapshot) ? bl.snapshot : []
  const baseEnd = {}
  let maxBase = null
  snap.forEach(s => {
    baseEnd[s.task_id] = s.end_date
    if (s.end_date && (!maxBase || s.end_date > maxBase)) maxBase = s.end_date
  })

  let maxCur = null
  const rows = []
  tasks.forEach(t => {
    if (t.end_date && (!maxCur || t.end_date > maxCur)) maxCur = t.end_date
    const be = baseEnd[t.id]
    if (be != null) {
      const v = diffDays(t.end_date, be)
      if (v && v !== 0) rows.push({ name: t.name, be, ce: t.end_date, v })
    }
  })
  rows.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))

  const projDelay = bl ? (diffDays(maxCur, maxBase) || 0) : 0

  return (
    <div className="bl-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bl-card">
        <div className="bl-header">
          <span>Línea base</span>
          <span className="bl-close" onClick={onClose}>&times;</span>
        </div>
        <div className="bl-body">
          <div className="bl-proj">{currentProject?.name || 'Proyecto'}</div>

          {loading && <p>Cargando…</p>}

          {!loading && !bl && (
            <>
              <p>Este proyecto todavía no tiene línea base.</p>
              <p className="bl-note">
                Al crearla, se congela el cronograma actual como "plan". Desde ahí,
                cuando muevas el fin o la duración de una tarea, vas a ver la variación.
              </p>
              <button className="bl-create" onClick={handleCreate} disabled={creating}>
                {creating ? 'Creando…' : 'Crear línea base'}
              </button>
            </>
          )}

          {!loading && bl && (
            <>
              <div className="bl-cmp">
                En comparación con <b>{bl.name || 'Línea base'}</b> ({fmt(bl.created_at)})
              </div>
              <div className="bl-big">
                {projDelay > 0
                  ? <>Su plan lleva un retraso de <b>{projDelay} día{projDelay !== 1 ? 's' : ''}</b></>
                  : projDelay < 0
                    ? <>Su plan está adelantado <b>{-projDelay} día{projDelay !== -1 ? 's' : ''}</b></>
                    : <>Su plan está <b>en fecha</b></>}
              </div>
              <div className="bl-sub">
                Fin previsto {fmt(maxBase)} · Fin actual {fmt(maxCur)}
              </div>

              {rows.length > 0 ? (
                <table className="bl-tbl">
                  <thead>
                    <tr><th>Tarea</th><th>Fin previsto</th><th>Fin actual</th><th>Variación</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td>{fmt(r.be)}</td>
                        <td>{fmt(r.ce)}</td>
                        <td className={r.v > 0 ? 'bl-late' : 'bl-early'}>
                          {r.v > 0 ? '↑ ' : '↓ '}{Math.abs(r.v)} d
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="bl-note">Ninguna tarea se movió respecto de esta línea base todavía.</p>
              )}

              <button className="bl-create" onClick={handleCreate} disabled={creating}>
                {creating ? 'Creando…' : 'Crear nueva línea base'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
