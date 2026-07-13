import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useStore } from '../store/index.js'
import { useAuth } from '../store/auth.js'
import { sb, SUPABASE_URL } from '../lib/supabase.js'
import { compressImage } from '../lib/images.js'
import { formatDate, isOverdue } from '../lib/utils.js'
import { toast, ToastContainer } from './Toast.jsx'

const BUCKET = 'project-log-attachments'

/**
 * App móvil simplificada — para el usuario en obra.
 * Dos pantallas: "Mis tareas" (marcar avance) y "Libro de obra" (foto + nota).
 * Se activa automáticamente en pantallas chicas (ver App.jsx).
 */
export function MobileApp() {
  const { currentMember, signOut } = useAuth()
  const { projects } = useStore()
  const [tab, setTab] = useState('tasks') // 'tasks' | 'log'

  return (
    <div className="mobile-shell">
      {/* Header */}
      <header className="mobile-header">
        <div className="mobile-logo">B</div>
        <div className="mobile-header-text">
          <div className="mobile-header-title">Buildplan 360</div>
          <div className="mobile-header-sub">{currentMember?.name || ''}</div>
        </div>
        <button className="mobile-logout" onClick={signOut}>Salir</button>
      </header>

      {/* Contenido */}
      <main className="mobile-main">
        {tab === 'tasks' && <MobileTasks />}
        {tab === 'log' && <MobileLog projects={projects} currentMember={currentMember} />}
      </main>

      {/* Navegación inferior */}
      <nav className="mobile-nav">
        <button className={`mobile-nav-btn ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
          <span className="mobile-nav-icon">✓</span>
          Mis tareas
        </button>
        <button className={`mobile-nav-btn ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>
          <span className="mobile-nav-icon">📷</span>
          Libro de obra
        </button>
      </nav>

      <ToastContainer />
    </div>
  )
}

/* ── Mis tareas ─────────────────────────────────────────────── */
function MobileTasks() {
  const { currentMember } = useAuth()
  const { projects } = useStore()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  useEffect(() => { load() }, [currentMember?.id])

  async function load() {
    if (!currentMember?.id) { setLoading(false); return }
    setLoading(true)
    const { data } = await sb.from('tasks')
      .select('id,name,status,progress,start_date,end_date,project_id,nivel,rubro')
      .eq('assigned_to', currentMember.id)
      .neq('status', 'completed')
      .order('end_date', { ascending: true, nullsFirst: false })
    setTasks(data || [])
    setLoading(false)
  }

  async function setProgress(task, value) {
    setBusy(task.id)
    const patch = { progress: value }
    if (value >= 100) { patch.progress = 100; patch.status = 'completed' }
    else if (value > 0) { patch.status = 'in_progress' }
    const { error } = await sb.from('tasks').update(patch).eq('id', task.id)
    if (error) toast('No se pudo guardar', 'error')
    else toast(value >= 100 ? '✓ Tarea completada' : `Avance: ${value}%`)
    await load()
    setBusy(null)
  }

  const groups = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7)
    const overdue = [], thisWeek = [], later = []
    for (const t of tasks) {
      if (!t.end_date) { later.push(t); continue }
      const end = new Date(t.end_date + 'T12:00:00')
      if (end < today) overdue.push(t)
      else if (end <= in7) thisWeek.push(t)
      else later.push(t)
    }
    return { overdue, thisWeek, later }
  }, [tasks])

  if (loading) return <div className="mobile-empty">Cargando tus tareas…</div>

  if (tasks.length === 0) return (
    <div className="mobile-empty">
      <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
      <p><b>No tenés tareas pendientes.</b></p>
      <p style={{ fontSize: 13 }}>Cuando te asignen tareas, van a aparecer acá.</p>
    </div>
  )

  return (
    <div className="mobile-tasks">
      <TaskGroup title={`⚠ Vencidas (${groups.overdue.length})`} tasks={groups.overdue} tone="danger" projects={projects} onProgress={setProgress} busy={busy} />
      <TaskGroup title={`Esta semana (${groups.thisWeek.length})`} tasks={groups.thisWeek} tone="warn" projects={projects} onProgress={setProgress} busy={busy} />
      <TaskGroup title={`Próximas (${groups.later.length})`} tasks={groups.later} tone="normal" projects={projects} onProgress={setProgress} busy={busy} />
    </div>
  )
}

function TaskGroup({ title, tasks, tone, projects, onProgress, busy }) {
  if (!tasks.length) return null
  return (
    <div className="mobile-group">
      <div className={`mobile-group-title tone-${tone}`}>{title}</div>
      {tasks.map(t => {
        const proj = projects.find(p => p.id === t.project_id)
        const pct = t.progress || 0
        return (
          <div key={t.id} className="mobile-task-card">
            <div className="mobile-task-name">{t.name}</div>
            <div className="mobile-task-meta">
              {proj?.name && <span>{proj.name}</span>}
              {t.end_date && <span className={isOverdue(t) ? 'overdue' : ''}>📅 {formatDate(t.end_date)}</span>}
            </div>
            <div className="mobile-task-progress">
              <div className="mobile-progress-bar">
                <div className="mobile-progress-fill" style={{ width: pct + '%' }} />
              </div>
              <span className="mobile-progress-label">{pct}%</span>
            </div>
            <div className="mobile-task-actions">
              <button className="mobile-btn-sm" disabled={busy === t.id || pct >= 100}
                onClick={() => onProgress(t, Math.min(100, pct + 25))}>+25%</button>
              <button className="mobile-btn-sm mobile-btn-done" disabled={busy === t.id}
                onClick={() => onProgress(t, 100)}>✓ Completar</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Libro de obra móvil ────────────────────────────────────── */
function MobileLog({ projects, currentMember }) {
  const activeProjects = projects.filter(p => p.status === 'active' || p.status === 'on_hold')
  const [projectId, setProjectId] = useState(activeProjects[0]?.id || '')
  const [detail, setDetail] = useState('')
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [recent, setRecent] = useState([])
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  useEffect(() => { if (projectId) loadRecent() }, [projectId])

  async function loadRecent() {
    const { data } = await sb.from('project_log_entries')
      .select('id,detail,attachments,created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(5)
    setRecent(data || [])
  }

  async function submit() {
    if (!projectId) { toast('Elegí una obra', 'warning'); return }
    if (!detail.trim() && files.length === 0) { toast('Escribí algo o sacá una foto', 'warning'); return }
    setSaving(true)
    try {
      const attachments = []
      for (const file of files) {
        const compressed = await compressImage(file)
        const path = `${projectId}/${currentMember?.id || 'obra'}/${Date.now()}-${file.name}`
        const { error: upErr } = await sb.storage.from(BUCKET).upload(path, compressed, { contentType: file.type })
        if (upErr) { toast('Error al subir una foto', 'error'); continue }
        attachments.push({
          url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`,
          name: file.name, path, size: compressed.size, type: file.type,
        })
      }
      const { error } = await sb.from('project_log_entries').insert({
        project_id: projectId,
        entry_type: 'avance',
        detail: detail.trim() || '📷 Registro fotográfico',
        attachments,
        author_id: currentMember?.id || null,
      })
      if (error) { toast('Error al guardar: ' + error.message, 'error'); return }
      toast('✓ Entrada guardada en el libro de obra')
      setDetail(''); setFiles([])
      await loadRecent()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mobile-log">
      {/* Selector de obra */}
      <label className="mobile-label">Obra</label>
      <select className="mobile-select" value={projectId} onChange={e => setProjectId(e.target.value)}>
        {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {/* Botones de foto — grandes, lo primero */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => setFiles(f => [...f, ...Array.from(e.target.files)])} />
      <input ref={galleryRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => setFiles(f => [...f, ...Array.from(e.target.files)])} />

      <div className="mobile-photo-buttons">
        <button className="mobile-btn-photo" onClick={() => cameraRef.current.click()}>
          📷<br />Sacar foto
        </button>
        <button className="mobile-btn-photo secondary" onClick={() => galleryRef.current.click()}>
          🖼<br />De la galería
        </button>
      </div>

      {/* Preview de fotos */}
      {files.length > 0 && (
        <div className="mobile-photo-preview">
          {files.map((f, i) => (
            <div key={i} className="mobile-photo-thumb">
              <img src={URL.createObjectURL(f)} alt="" />
              <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Nota */}
      <label className="mobile-label">Nota (opcional)</label>
      <textarea className="mobile-textarea" rows={3} value={detail}
        onChange={e => setDetail(e.target.value)}
        placeholder="¿Qué pasó hoy en la obra?" />

      <button className="mobile-btn-submit" disabled={saving} onClick={submit}>
        {saving ? 'Guardando…' : '✓ Guardar en el libro de obra'}
      </button>

      {/* Últimas entradas de esta obra */}
      {recent.length > 0 && (
        <div className="mobile-recent">
          <div className="mobile-label" style={{ marginTop: 24 }}>Últimas entradas</div>
          {recent.map(e => (
            <div key={e.id} className="mobile-recent-item">
              <div className="mobile-recent-date">{new Date(e.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
              <div className="mobile-recent-text">{e.detail}</div>
              {Array.isArray(e.attachments) && e.attachments.length > 0 && (
                <div className="mobile-recent-photos">
                  {e.attachments.filter(a => a.type?.startsWith('image/')).map((a, i) => (
                    <img key={i} src={a.url} alt="" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
