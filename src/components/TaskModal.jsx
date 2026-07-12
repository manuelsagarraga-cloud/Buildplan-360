import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/index.js'
import { TASK_TYPES, CATEGORY_COLORS, DEP_TYPE_ABBR } from '../lib/supabase.js'
import { getVisibleTasks, today } from '../lib/utils.js'
import { toast } from './Toast.jsx'

export function TaskModal() {
  const { taskModal, closeTaskModal, members, tasks, deps, filters, collapsed, saveTask, deleteTask } = useStore()
  const { open, task } = taskModal
  const isNew = !task

  const [form, setForm] = useState({})
  const [predsInput, setPreds] = useState('')
  const [subtypes, setSubtypes] = useState([])
  const [links, setLinks] = useState([])
  const [newLink, setNewLink] = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const t = task || {}
    const d = today()
    const plus7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

    setForm({
      name: t.name || '',
      description: t.description || '',
      status: t.status || 'pending',
      priority: t.priority || 'medium',
      start_date: t.start_date || d,
      end_date: t.end_date || plus7,
      is_milestone: t.is_milestone || false,
      assigned_to: t.assigned_to || '',
      parent_task_id: t.parent_task_id || '',
      progress: t.progress || 0,
      task_type_category: t.task_type_category || '',
      task_type: t.task_type || '',
      project_obra_type: t.project_obra_type || '',
      proy_obra_adm: t.proy_obra_adm || '',
      demanda_recursos: t.demanda_recursos || '',
      bar_color: t.bar_color || '#1d4ed8',
      nivel: t.nivel || '',
      duration_mode: t.duration_mode || 'habiles',
      rubro: t.rubro || '',
      contratista: t.contratista || '',
      tableros: t.tableros || '',
      pinned_to_timeline: t.pinned_to_timeline || false,
    })

    // Build predecessors string
    if (task) {
      const vt = getVisibleTasks(tasks, filters, collapsed)
      const rn = {}; vt.forEach((t, i) => { rn[t.id] = i + 1 })
      const parts = deps.filter(d => d.successor_id === task.id).map(d => {
        const n = rn[d.predecessor_id]; if (!n) return null
        return n + (DEP_TYPE_ABBR[d.dependency_type] || 'FC') + (d.lag_days ? '+' + d.lag_days + 'd' : '')
      }).filter(Boolean)
      setPreds(parts.join(';'))
    } else { setPreds('') }

    // Parse links from description or custom field
    const taskLinks = t.link_urls ? (Array.isArray(t.link_urls) ? t.link_urls : JSON.parse(t.link_urls || '[]')) : []
    setLinks(taskLinks)
    setNewLink('')

    setTimeout(() => nameRef.current?.focus(), 50)
  }, [open, task])

  useEffect(() => {
    if (form.task_type_category) {
      setSubtypes(TASK_TYPES[form.task_type_category] || [])
    } else {
      setSubtypes([])
    }
  }, [form.task_type_category])

  if (!open) return null

  function set(key, val) {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'is_milestone' && val) next.end_date = next.start_date
      if (key === 'task_type_category') {
        next.task_type = ''
        if (val && CATEGORY_COLORS[val]) next.bar_color = CATEGORY_COLORS[val]
      }
      return next
    })
  }

  async function handleSave() {
    if (!form.name.trim()) return toast('El nombre no puede estar vacío', 'error')
    if (form.end_date < form.start_date) return toast('Fecha de fin anterior al inicio', 'error')
    setSaving(true)
    try {
      const vt = getVisibleTasks(tasks, filters, collapsed)
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        status: form.status,
        priority: form.priority,
        start_date: form.start_date,
        end_date: form.is_milestone ? form.start_date : form.end_date,
        is_milestone: form.is_milestone,
        assigned_to: form.assigned_to || null,
        parent_task_id: form.parent_task_id || null,
        progress: parseInt(form.progress) || 0,
        task_type_category: form.task_type_category || null,
        task_type: form.task_type || null,
        project_obra_type: form.project_obra_type || null,
        proy_obra_adm: form.proy_obra_adm || null,
        demanda_recursos: form.demanda_recursos || null,
        bar_color: form.bar_color,
        nivel: form.nivel || null,
        duration_mode: form.duration_mode || 'habiles',
        rubro: form.rubro || null,
        contratista: form.contratista || null,
        tableros: form.tableros || null,
        pinned_to_timeline: form.pinned_to_timeline || false,
        link_urls: links.length ? JSON.stringify(links) : null,
      }
      await saveTask(payload, task?.id || null, predsInput, vt)
      toast(isNew ? 'Tarea creada' : 'Tarea actualizada')
      closeTaskModal()
    } catch (e) {
      toast('Error: ' + e.message, 'error')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!task || !window.confirm('¿Eliminar esta tarea?')) return
    try {
      await deleteTask(task.id)
      toast('Tarea eliminada')
      closeTaskModal()
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  function addLink() {
    const url = newLink.trim()
    if (!url) return
    const href = url.startsWith('http') ? url : 'https://' + url
    setLinks(l => [...l, { url: href, label: url }])
    setNewLink('')
  }

  // Build parent candidates (exclude self and descendants)
  const excludeIds = new Set()
  if (task) {
    excludeIds.add(task.id)
    const stack = [task.id]
    while (stack.length) {
      const cur = stack.pop()
      tasks.filter(t => t.parent_task_id === cur).forEach(c => { excludeIds.add(c.id); stack.push(c.id) })
    }
  }
  const parentCandidates = tasks.filter(t => !excludeIds.has(t.id))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeTaskModal()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h2 className="modal-title">{isNew ? 'Nueva tarea' : 'Editar tarea'}</h2>
          <button className="modal-close" onClick={closeTaskModal}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Nombre *</label>
            <input ref={nameRef} className="form-control" value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="Nombre de la tarea" />
          </div>

          <div className="form-group">
            <label className="form-label">Descripción</label>
            <textarea className="form-control" value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tarea resumen (parent)</label>
              <select className="form-control" value={form.parent_task_id || ''} onChange={e => set('parent_task_id', e.target.value)}>
                <option value="">— Raíz —</option>
                {parentCandidates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Responsable</label>
              <select className="form-control" value={form.assigned_to || ''} onChange={e => set('assigned_to', e.target.value)}>
                <option value="">Sin asignar</option>
                {members.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name}{m.role ? ' — ' + m.role : ''}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Estado</label>
              <select className="form-control" value={form.status || 'pending'} onChange={e => set('status', e.target.value)}>
                <option value="pending">Pendiente</option>
                <option value="in_progress">En progreso</option>
                <option value="completed">Completada</option>
                <option value="blocked">Bloqueada</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Prioridad</label>
              <select className="form-control" value={form.priority || 'medium'} onChange={e => set('priority', e.target.value)}>
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Fecha de inicio</label>
              <input type="date" className="form-control" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha de fin</label>
              <input type="date" className="form-control" value={form.end_date || ''} disabled={form.is_milestone} onChange={e => set('end_date', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ display: 'flex', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, paddingTop: 20 }}>
                <input type="checkbox" checked={form.is_milestone || false} onChange={e => set('is_milestone', e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                <span>◆ <strong>Hito</strong> (duración 0 días)</span>
              </label>
            </div>
            <div className="form-group">
              <label className="form-label">Predecesoras (por # fila)</label>
              <input
                className="form-control"
                value={predsInput}
                onChange={e => setPreds(e.target.value)}
                placeholder="Ej: 3FC;5CC;7FF+2d"
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, display: 'block' }}>FC=Fin→Comienzo CC=C→C FF=F→F CF=C→F</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Avance</label>
            <div className="progress-input-group">
              <input type="range" min="0" max="100" value={form.progress || 0} onChange={e => set('progress', e.target.value)} />
              <input type="number" className="form-control" min="0" max="100" value={form.progress || 0} onChange={e => set('progress', e.target.value)} />
              <span className="ptag">%</span>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0 12px' }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Clasificación y obra</div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nivel de obra</label>
              <input className="form-control" list="p360-niveles" value={form.nivel || ''} onChange={e => set('nivel', e.target.value)} placeholder="Ej: Planta Baja, Primer Piso…" />
              <datalist id="p360-niveles">
                {['Subsuelo 2','Subsuelo 1','Planta Baja','Primer Piso','Segundo Piso','Tercer Piso','Cubierta','Terreno','General'].map(n => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Modo de duración</label>
              <select className="form-control" value={form.duration_mode || 'habiles'} onChange={e => set('duration_mode', e.target.value)}>
                <option value="habiles">Días hábiles (saltea fines de semana y feriados)</option>
                <option value="corridos">Días corridos</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Rubro</label>
              <input className="form-control" value={form.rubro || ''} onChange={e => set('rubro', e.target.value)} placeholder="Ej: Albañilería, Instalaciones…" />
            </div>
            <div className="form-group">
              <label className="form-label">Contratista</label>
              <input className="form-control" value={form.contratista || ''} onChange={e => set('contratista', e.target.value)} placeholder="Nombre del contratista" />
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0 12px' }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Clasificación adicional</div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tipo — Categoría</label>
              <select className="form-control" value={form.task_type_category || ''} onChange={e => set('task_type_category', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {Object.keys(TASK_TYPES).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo — Subtipo</label>
              <select className="form-control" value={form.task_type || ''} onChange={e => set('task_type', e.target.value)}>
                <option value="">{subtypes.length ? '— Seleccionar —' : '— Sin subtipos —'}</option>
                {subtypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tipo de Proyecto/Obra</label>
              <select className="form-control" value={form.project_obra_type || ''} onChange={e => set('project_obra_type', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {['Infraestructura','Lote','Viviendas','Edificio','Obra Anexa'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Proy-Obra-Adm</label>
              <select className="form-control" value={form.proy_obra_adm || ''} onChange={e => set('proy_obra_adm', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {['Proyecto','Obra','Administración'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Demanda de Recursos</label>
              <select className="form-control" value={form.demanda_recursos || ''} onChange={e => set('demanda_recursos', e.target.value)}>
                <option value="">— Seleccionar —</option>
                <option value="1">1 — Mínimo</option>
                <option value="2">2 — Medio</option>
                <option value="3">3 — Máximo</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Color de la barra</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={form.bar_color || '#1d4ed8'} onChange={e => set('bar_color', e.target.value)} style={{ width: 44, height: 36, padding: 2, border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }} />
                <input type="text" className="form-control" value={form.bar_color || '#1d4ed8'} maxLength={7} onChange={e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) set('bar_color', e.target.value) }} style={{ width: 100, fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }} />
              </div>
            </div>
          </div>

          {/* ── Links / attachments ── */}
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0 12px' }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>🔗 Links y fotos</div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              className="form-control"
              value={newLink}
              onChange={e => setNewLink(e.target.value)}
              placeholder="https://... o URL de imagen/documento"
              onKeyDown={e => e.key === 'Enter' && addLink()}
            />
            <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={addLink}>+ Agregar</button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="link-chip" onClick={e => e.stopPropagation()}>
                🔗 {l.url.length > 40 ? l.url.slice(0, 40) + '…' : l.url}
                <button className="link-chip-del" onClick={e => { e.preventDefault(); setLinks(ll => ll.filter((_, j) => j !== i)) }}>×</button>
              </a>
            ))}
            {links.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Sin links adjuntos</span>}
          </div>
        </div>

        <div className="modal-footer">
          <div>
            {!isNew && <button className="btn btn-danger" onClick={handleDelete}>Eliminar</button>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={closeTaskModal}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
