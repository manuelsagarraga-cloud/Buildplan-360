import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useStore } from '../store/index.js'
import { getVisibleTasks, businessDays, addBusinessDays, nextBusinessDayAfter, formatDate, isOverdue, addDays, getSuccessorChain, shiftDateStr, diffDays } from '../lib/utils.js'
import { DEP_TYPE_ABBR, sb } from '../lib/supabase.js'
import { GanttSvg } from './GanttSvg.jsx'
import BaselinePanel from './BaselinePanel.jsx'
import { toast } from './Toast.jsx'
import { enqueueSave, subscribeSaveStatus, getPendingCount } from '../lib/saveQueue.js'
import { ProjectSummary } from './ProjectSummary.jsx'
import { ListView, KanbanView } from './TaskViews.jsx'
import { InlineText } from './InlineText.jsx'

const DEFAULT_WIDTHS = {
  '#': 26, name: 0, dur: 46, resp: 110, start: 82, end: 82,
  pred: 72, pct: 36, nivel: 110, rubro: 100, contratista: 100, pin: 36,
}

const COL_DEFS = [
  { key: '#',           label: '#',           toggle: false },
  { key: 'name',        label: 'Tarea',        toggle: false },
  { key: 'dur',         label: 'Duración',     toggle: true },
  { key: 'resp',        label: 'Responsable',  toggle: true },
  { key: 'start',       label: 'Inicio',       toggle: true },
  { key: 'end',         label: 'Fin',          toggle: true },
  { key: 'pred',        label: 'Predecesoras', toggle: true },
  { key: 'pct',         label: '%',            toggle: true },
  { key: 'nivel',       label: 'Nivel',        toggle: true, hidden: true },
  { key: 'rubro',       label: 'Rubro',        toggle: true, hidden: true },
  { key: 'contratista', label: 'Contratista',  toggle: true, hidden: true },
  { key: 'pin',         label: '📌',           toggle: false },
]

function buildColTemplate(hidden, widths) {
  return COL_DEFS.map(c => {
    if (c.toggle && hidden.has(c.key)) return '0px'
    const w = (widths && widths[c.key] != null) ? widths[c.key] : DEFAULT_WIDTHS[c.key]
    if (c.key === 'name') return w ? `${w}px` : 'minmax(120px, 1fr)'
    if (w) return w + 'px'
    return '1fr'
  }).join(' ')
}

// Panel de configuración de anchos de columna
function ColWidthPanel({ widths, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...DEFAULT_WIDTHS, ...widths })
  const [busy, setBusy] = useState(false)
  const editable = COL_DEFS.filter(c => c.key !== '#')
  return (
    <div className="col-width-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="col-width-panel">
        <div className="col-width-header">
          <span>⚙ Ancho de columnas</span>
          <span className="col-width-close" onClick={onClose}>&times;</span>
        </div>
        <div className="col-width-body">
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 10px' }}>
            Ajustá el ancho en píxeles. Se guarda para todos los usuarios.
          </p>
          {editable.map(c => (
            <div key={c.key} className="col-width-row">
              <label>{c.label}</label>
              <input
                type="number" min="30" max="400" step="5"
                value={draft[c.key] || ''}
                onChange={e => setDraft(d => ({ ...d, [c.key]: parseInt(e.target.value) || 0 }))}
              />
              <span className="col-width-px">px</span>
            </div>
          ))}
        </div>
        <div className="col-width-footer">
          <button className="btn btn-ghost" disabled={busy} onClick={() => { setDraft({ ...DEFAULT_WIDTHS }); }}>
            Restaurar valores
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={async () => {
            setBusy(true)
            await onSave(draft)
            setBusy(false)
            onClose()
          }}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function GanttView() {
  const {
    tasks, deps, members, currentProject,
    filters, setFilters, viewMode, setViewMode,
    collapsed, toggleCollapsed, pinnedTaskIds, togglePinned,
    editMode, openTaskModal, openImportModal,
    indentTask, outdentTask, linkTasks, loadProject, pushUndo, undo, undoStack,
  } = useStore()

  const [hiddenCols, setHiddenCols] = useState(
    new Set(COL_DEFS.filter(c => c.hidden).map(c => c.key))
  )
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [colWidthOpen, setColWidthOpen] = useState(false)
  const [baselineOpen, setBaselineOpen] = useState(false)
  const [colWidths, setColWidths] = useState(DEFAULT_WIDTHS)
  const [colWidthsReady, setColWidthsReady] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [leftPaneW, setLeftPaneW] = useState(820)
  const [ganttHidden, setGanttHidden] = useState(false)
  const leftBodyRef = useRef(null)
  const rightBodyRef = useRef(null)
  const headerRef = useRef(null)
  const activeTab = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)

  // Cargar anchos de columna desde system_settings (antes de renderizar la tabla)
  useEffect(() => {
    sb.from('system_settings').select('value').eq('key', 'column_widths').then(res => {
      if (res.data && res.data[0] && res.data[0].value) {
        setColWidths(w => ({ ...w, ...res.data[0].value }))
      }
      setColWidthsReady(true)
    }).catch(() => setColWidthsReady(true))
  }, [])

  async function saveColWidths(newWidths) {
    setColWidths(newWidths)
    await sb.from('system_settings').upsert({ key: 'column_widths', value: newWidths })
    toast('Anchos de columna guardados')
  }

  const visibleTasks = getVisibleTasks(tasks, filters, collapsed)

  // ── Row numbers map ──────────────────────────────────────────
  const rowNums = {}
  visibleTasks.forEach((t, i) => { rowNums[t.id] = i + 1 })

  // ── Build predecessors display ───────────────────────────────
  const predMap = {}
  deps.forEach(d => {
    if (!predMap[d.successor_id]) predMap[d.successor_id] = []
    const rn = rowNums[d.predecessor_id]
    const lag = d.lag_days ? '+' + d.lag_days + 'd' : ''
    if (rn) predMap[d.successor_id].push(rn + (DEP_TYPE_ABBR[d.dependency_type] || 'FC') + lag)
  })

  // ── Sync scroll ──────────────────────────────────────────────
  useEffect(() => {
    const left = leftBodyRef.current
    const right = rightBodyRef.current
    const header = document.getElementById('ganttHeaderWrap')
    if (!left || !right) return

    let sync = false
    const onLeft = () => { if (sync) return; sync = true; right.scrollTop = left.scrollTop; sync = false }
    const onRight = () => {
      if (sync) return; sync = true
      left.scrollTop = right.scrollTop
      if (header) header.scrollLeft = right.scrollLeft
      sync = false
    }
    left.addEventListener('scroll', onLeft)
    right.addEventListener('scroll', onRight)
    return () => { left.removeEventListener('scroll', onLeft); right.removeEventListener('scroll', onRight) }
  }, [activeTab])

  // ── Resize handle ────────────────────────────────────────────
  const startResize = useCallback(e => {
    e.preventDefault()
    const startX = e.clientX, startW = leftPaneW
    const onMove = e => setLeftPaneW(Math.max(400, Math.min(1400, startW + e.clientX - startX)))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [leftPaneW])

  const colTpl = buildColTemplate(hiddenCols, colWidths)

  // ── Indent/Outdent/Link ──────────────────────────────────────
  async function handleIndent() {
    const sel = [...selectedIds]
    if (sel.length !== 1) return toast('Seleccioná exactamente 1 tarea para sangrar', 'warning')
    await indentTask(sel[0])
  }
  async function handleOutdent() {
    const sel = [...selectedIds]
    if (sel.length !== 1) return toast('Seleccioná exactamente 1 tarea para outdent', 'warning')
    await outdentTask(sel[0])
  }
  async function handleLink() {
    const sel = [...selectedIds]
    if (sel.length !== 2) return toast('Seleccioná exactamente 2 tareas para vincular', 'warning')
    const [a, b] = sel
    const rowA = rowNums[a], rowB = rowNums[b]
    const from = rowA < rowB ? a : b
    const to = rowA < rowB ? b : a
    await linkTasks(from, to)
    toast('Tareas vinculadas (FC)')
  }

  function toggleSelect(id, e) {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── Edición masiva ───────────────────────────────────────────
  const [bulkBusy, setBulkBusy] = useState(false)

  // Asignar un responsable (o quitarlo) a TODAS las tareas seleccionadas
  async function handleBulkAssign(memberId) {
    const ids = [...selectedIds]
    if (!ids.length) return
    setBulkBusy(true)
    try {
      const value = memberId === '' ? null : memberId
      const { error } = await sb.from('tasks').update({ assigned_to: value }).in('id', ids)
      if (error) { toast('No se pudo asignar: ' + error.message, 'error'); return }
      const nombre = value ? (members.find(m => m.id === value)?.name || 'responsable') : 'nadie'
      toast(`${ids.length} tarea(s) asignadas a ${nombre}`)
      await loadProject(currentProject.id)
    } catch (e) {
      toast('Error al asignar en lote', 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  // Correr N días (positivo = adelante, negativo = atrás) las tareas seleccionadas.
  // Si las seleccionadas tienen sucesoras encadenadas fuera de la selección,
  // ofrece moverlas también (recálculo de dependencias en cascada).
  async function handleBulkShift(days) {
    const ids = [...selectedIds]
    if (!ids.length || !days) return
    setBulkBusy(true)
    try {
      // ¿Hay sucesoras encadenadas fuera de la selección?
      const chain = getSuccessorChain(ids, deps)
      let moveIds = new Set(ids)
      if (chain.size > 0) {
        const followChain = window.confirm(
          `Las tareas seleccionadas tienen ${chain.size} tarea(s) sucesora(s) encadenada(s) por dependencias.\n\n` +
          `¿Moverlas también ${days > 0 ? '+' : ''}${days} día(s) para mantener el cronograma consistente?\n\n` +
          `Aceptar = mover selección + sucesoras (${ids.length + chain.size} tareas)\n` +
          `Cancelar = mover solo la selección (${ids.length} tareas)`
        )
        if (followChain) chain.forEach(id => moveIds.add(id))
      }

      const toMove = tasks.filter(t => moveIds.has(t.id))
      // Snapshot de valores previos para deshacer
      pushUndo(`Mover ${toMove.length} tarea(s) ${days > 0 ? '+' : ''}${days}d`,
        toMove.map(t => ({ id: t.id, start_date: t.start_date, end_date: t.end_date })))
      await Promise.all(toMove.map(t => {
        const patch = {}
        if (t.start_date) patch.start_date = shiftDateStr(t.start_date, days)
        if (t.end_date) patch.end_date = shiftDateStr(t.end_date, days)
        return Object.keys(patch).length
          ? sb.from('tasks').update(patch).eq('id', t.id)
          : Promise.resolve()
      }))

      toast(`${toMove.length} tarea(s) corridas ${days > 0 ? '+' : ''}${days} día(s)`)
      await loadProject(currentProject.id)
    } catch (e) {
      toast('Error al mover en lote', 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  const filterCls = useStore(s => s.filters)

  // No renderizar la tabla hasta que los anchos de columna estén cargados
  if (!colWidthsReady) {
    return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>Cargando vista…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="toolbar">
        <div className="toolbar-left">
          {editMode && (
            <>
              <button className="btn btn-primary" onClick={() => openTaskModal(null)}>
                <span className="btn-icon">+</span> Nueva tarea
              </button>
              <button className="btn" title="Sangría (indent)" onClick={handleIndent}>⇥ Sangría</button>
              <button className="btn" title="Quitar sangría (outdent)" onClick={handleOutdent}>⇤ Outdent</button>
              <button className="btn" title="Vincular 2 tareas seleccionadas" onClick={handleLink}>🔗 Vincular</button>
              {editMode && (
                <button className="btn" onClick={openImportModal} title="Importar desde MS Project">
                  📥 Importar .xml
                </button>
              )}
            </>
          )}
          <select className="filter-select" value={filterCls.status} onChange={e => setFilters({ status: e.target.value })}>
            <option value="">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="in_progress">En progreso</option>
            <option value="completed">Completadas</option>
            <option value="blocked">Bloqueadas</option>
          </select>
          <select className="filter-select" value={filterCls.assignee} onChange={e => setFilters({ assignee: e.target.value })}>
            <option value="">Todos los responsables</option>
            {members.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <span className="dep-legend" style={{ marginLeft: 6 }}>
            {[['#7a8094','F→C'],['#1d4ed8','C→C'],['#0e8a63','F→F'],['#e65100','C→F']].map(([c,l]) => (
              <span key={l} className="dep-legend-item"><span className="dep-legend-swatch" style={{ background: c }} />{l}</span>
            ))}
          </span>
        </div>
        <div className="toolbar-right">
          <div className="col-toggle">
            <button className="btn" onClick={() => setColMenuOpen(v => !v)}>☰ Columnas</button>
            <button className="btn" onClick={() => setColWidthOpen(true)} title="Configurar ancho de columnas">⚙ Ancho</button>
            <button className="btn" onClick={() => setBaselineOpen(true)} title="Línea base del proyecto">📊 Línea base</button>
            <button
              className={`btn ${ganttHidden ? 'btn-active' : ''}`}
              onClick={() => setGanttHidden(v => !v)}
              title={ganttHidden ? 'Mostrar diagrama Gantt' : 'Ocultar diagrama Gantt'}
            >
              {ganttHidden ? '▶ Mostrar Gantt' : '⊟ Solo tareas'}
            </button>
            {editMode && undoStack.length > 0 && (
              <button
                className="btn"
                onClick={async () => { const label = await undo(); if (label) toast(`Deshecho: ${label}`) }}
                title={`Deshacer: ${undoStack[0]?.label || ''}`}
              >
                ↶ Deshacer
              </button>
            )}
            <div className={`col-menu ${colMenuOpen ? 'open' : ''}`}>
              {COL_DEFS.filter(c => c.toggle).map(c => (
                <label key={c.key}>
                  <input type="checkbox" checked={!hiddenCols.has(c.key)} onChange={() => setHiddenCols(h => { const n = new Set(h); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n })} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <select className="filter-select" value={viewMode} onChange={e => setViewMode(e.target.value)}>
            <option value="day">Día</option>
            <option value="week">Semana</option>
            <option value="month">Mes</option>
            <option value="quarter">Trimestre</option>
            <option value="year">Año</option>
          </select>
          <div className="tabs">
            {['gantt','list','kanban','resumen'].map(v => (
              <button key={v} className={`tab ${activeTab === v ? 'active' : ''}`} onClick={() => setActiveTab(v)}>
                {v === 'gantt' ? 'Gantt' : v === 'list' ? 'Lista' : v === 'kanban' ? 'Tablero' : '📋 Resumen'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Barra de acciones masivas ─────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{ background: 'var(--info-bg)', borderBottom: '1px solid var(--border)', padding: '8px 24px', fontSize: 13, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <strong>{selectedIds.size} seleccionada(s)</strong>

          {editMode && (
            <>
              {/* Asignar responsable a todas */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Asignar a:</span>
                <select
                  className="filter-select"
                  disabled={bulkBusy}
                  defaultValue=""
                  onChange={e => { if (e.target.value !== '__') { handleBulkAssign(e.target.value); e.target.value = '__' } }}
                >
                  <option value="__">— elegir —</option>
                  <option value="">(Sin responsable)</option>
                  {members.filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </span>

              {/* Correr en el tiempo */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Mover:</span>
                <button className="btn btn-sm" disabled={bulkBusy} onClick={() => handleBulkShift(-7)} title="Correr una semana hacia atrás">−7d</button>
                <button className="btn btn-sm" disabled={bulkBusy} onClick={() => handleBulkShift(-1)}>−1d</button>
                <button className="btn btn-sm" disabled={bulkBusy} onClick={() => handleBulkShift(1)}>+1d</button>
                <button className="btn btn-sm" disabled={bulkBusy} onClick={() => handleBulkShift(7)} title="Correr una semana hacia adelante">+7d</button>
                <button className="btn btn-sm" disabled={bulkBusy} onClick={() => { const n = parseInt(prompt('¿Cuántos días correr? (negativo = hacia atrás)', '0') || '0', 10); if (n) handleBulkShift(n) }}>N días…</button>
              </span>

              {bulkBusy && <span style={{ opacity: .7 }}>Aplicando…</span>}
            </>
          )}

          {!editMode && <span style={{ opacity: .8 }}>Activá Modo Edición para asignar o mover en lote</span>}

          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setSelectedIds(new Set())}>✕ Limpiar</button>
        </div>
      )}

      {/* ── Main view area ────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'gantt' && <GanttSplitView visibleTasks={visibleTasks} predMap={predMap} selectedIds={selectedIds} toggleSelect={toggleSelect} leftPaneW={leftPaneW} startResize={startResize} colTpl={colTpl} leftBodyRef={leftBodyRef} rightBodyRef={rightBodyRef} hiddenCols={hiddenCols} ganttHidden={ganttHidden} />}
        {activeTab === 'list' && <ListView tasks={tasks.filter(t => (!filters.status || t.status === filters.status) && (!filters.assignee || t.assigned_to === filters.assignee))} />}
        {activeTab === 'kanban' && <KanbanView tasks={tasks.filter(t => !filters.assignee || t.assigned_to === filters.assignee)} />}
        {activeTab === 'resumen' && <ProjectSummary />}
      </div>
      {colWidthOpen && (
        <ColWidthPanel widths={colWidths} onSave={saveColWidths} onClose={() => setColWidthOpen(false)} />
      )}
      {baselineOpen && (
        <BaselinePanel onClose={() => setBaselineOpen(false)} />
      )}
    </div>
  )
}

// ── Duration input: estado local, guarda solo al salir del campo o Enter ──
function DurationInput({ days, disabled, onCommit }) {
  const [draft, setDraft] = useState(String(days))
  const [focused, setFocused] = useState(false)

  // Sincronizar cuando cambian las props (ej: recarga del proyecto)
  useEffect(() => {
    if (!focused) setDraft(String(days))
  }, [days, focused])

  function commit() {
    const parsed = parseInt(draft)
    if (!parsed || parsed < 1 || parsed === days) {
      setDraft(String(days)) // revertir si es inválido o igual
      return
    }
    onCommit(parsed)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className="inline-pct"
      value={focused ? draft : days}
      disabled={disabled}
      style={{ width: 38, textAlign: 'center' }}
      title="Duración en días hábiles — Enter o Tab para guardar"
      onFocus={e => { setFocused(true); setDraft(String(days)); setTimeout(() => e.target.select(), 0) }}
      onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={() => { setFocused(false); commit() }}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.target.blur() }
        if (e.key === 'Escape') { setDraft(String(days)); e.target.blur() }
      }}
    />
  )
}

// ── Gantt split view ─────────────────────────────────────────
function GanttSplitView({ visibleTasks, predMap, selectedIds, toggleSelect, leftPaneW, startResize, colTpl, leftBodyRef, rightBodyRef, hiddenCols, ganttHidden }) {
  const { members, toggleCollapsed, togglePinned, pinnedTaskIds, editMode, tasks, deps, viewMode, currentProject, openTaskModal, loadProject } = useStore()
  const [saving, setSaving] = useState({}) // { [taskId]: 'saving' | 'ok' | 'error' | 'pending' }

  // Suscribirse a la cola de guardado para feedback visual
  useEffect(() => {
    const unsub = subscribeSaveStatus(({ taskId, status, field, error }) => {
      setSaving(s => ({ ...s, [taskId]: status }))
      if (status === 'ok') {
        setTimeout(() => setSaving(s => { const n = { ...s }; delete n[taskId]; return n }), 1200)
      } else if (status === 'error') {
        toast(error || 'No se pudo guardar. Se reintentó 5 veces.', 'error')
        setTimeout(() => setSaving(s => { const n = { ...s }; delete n[taskId]; return n }), 4000)
      } else if (status === 'conflict') {
        toast(error || 'Otra persona editó esta tarea. Recargá la página.', 'warning')
        setTimeout(() => setSaving(s => { const n = { ...s }; delete n[taskId]; return n }), 5000)
      }
    })
    return unsub
  }, [])

  // Guardar con debounce, reintentos y soporte offline.
  // Si cambia end_date o start_date, recalcula sucesoras en cascada.
  function quickSave(taskId, field, value) {
    const v = value === '' ? null : value
    // Leer estado fresco del store (no del render, que puede estar viejo)
    const freshTasks = useStore.getState().tasks
    const task = freshTasks.find(t => t.id === taskId)
    const lastUpdated = task?.updated_at || null

    // Actualización optimista inmediata
    useStore.setState(s => ({
      tasks: s.tasks.map(t => t.id === taskId ? { ...t, [field]: v } : t)
    }))

    // Encolar el save
    enqueueSave(taskId, field, value, sb, lastUpdated)

    // ── Cascada de dependencias ──
    // Si cambió end_date, recalcular sucesoras encadenadas
    if ((field === 'end_date') && v && task) {
      const oldEnd = task.end_date
      if (oldEnd && oldEnd !== v) {
        console.log(`[cascade] Disparando: tarea ${task.name}, end ${oldEnd} → ${v}`)
        cascadeFromTask(taskId, v)
      }
    }
  }

  // Recalcula sucesoras en cascada cuando cambia el end_date de una tarea.
  // Respeta el tipo de dependencia y el lag. Mantiene la duración de cada sucesora.
  // Junta todos los cambios y los guarda en batch (1 save por tarea, sin chequeo de conflicto).
  async function cascadeFromTask(changedTaskId, newEndDate) {
    const visited = new Set()
    const bfsQueue = [{ taskId: changedTaskId, endDate: newEndDate }]
    const changes = [] // [{ id, start_date, end_date }]

    // Usar el estado optimista más reciente de las tareas
    const { tasks: currentTasks, deps: currentDeps } = useStore.getState()

    while (bfsQueue.length > 0) {
      const { taskId: predId, endDate: predEnd } = bfsQueue.shift()
      if (visited.has(predId)) continue
      visited.add(predId)

      const successorDeps = currentDeps.filter(d => d.predecessor_id === predId)

      for (const dep of successorDeps) {
        // Buscar la tarea en los cambios ya calculados o en el estado original
        const existing = changes.find(c => c.id === dep.successor_id)
        const succ = existing
          ? { ...currentTasks.find(t => t.id === dep.successor_id), start_date: existing.start_date, end_date: existing.end_date }
          : currentTasks.find(t => t.id === dep.successor_id)
        if (!succ || visited.has(succ.id)) continue

        const lag = dep.lag_days || 0
        const type = dep.dependency_type || 'finish_to_start'
        let newSuccStart = null

        if (type === 'finish_to_start') {
          newSuccStart = nextBusinessDayAfter(predEnd, lag)
        } else if (type === 'start_to_start') {
          const pred = currentTasks.find(t => t.id === predId)
          if (pred) newSuccStart = lag > 0 ? nextBusinessDayAfter(pred.start_date, lag - 1) : pred.start_date
        }

        if (!newSuccStart || newSuccStart === succ.start_date) continue

        const succDuration = businessDays(succ.start_date, succ.end_date)
        const newSuccEnd = addBusinessDays(newSuccStart, Math.max(succDuration, 1))

        changes.push({ id: succ.id, start_date: newSuccStart, end_date: newSuccEnd })
        bfsQueue.push({ taskId: succ.id, endDate: newSuccEnd })
      }
    }

    if (changes.length === 0) {
      console.log('[cascade] Sin sucesoras que mover')
      return
    }

    // 1) Actualización optimista: un solo setState con todos los cambios
    const changeMap = {}
    changes.forEach(c => { changeMap[c.id] = c })
    useStore.setState(s => ({
      tasks: s.tasks.map(t => changeMap[t.id]
        ? { ...t, start_date: changeMap[t.id].start_date, end_date: changeMap[t.id].end_date }
        : t
      )
    }))

    // 2) Guardar en Supabase: un update por tarea (start+end juntos, sin conflicto)
    toast(`Cascada: recalculando ${changes.length} tarea(s)…`, 'success')
    let saved = 0, failed = 0
    for (const c of changes) {
      try {
        const { error } = await sb.from('tasks').update({ start_date: c.start_date, end_date: c.end_date }).eq('id', c.id)
        if (error) { failed++; console.warn('[cascade] error:', c.id, error.message) }
        else saved++
      } catch (e) { failed++; console.warn('[cascade] excepción:', c.id, e.message) }
    }
    if (failed > 0) {
      toast(`Cascada: ${saved} guardadas, ${failed} con error`, 'warning')
    } else {
      toast(`Cascada: ${saved} tarea(s) actualizadas ✓`, 'success')
    }
  }

  return (
    <div
      className="gantt-split"
      style={{
        '--left-pane-w': ganttHidden ? '100%' : leftPaneW + 'px',
        '--col-tpl': colTpl,
        height: '100%',
        gridTemplateColumns: ganttHidden ? '1fr' : `${leftPaneW}px 8px 1fr`,
      }}
    >
      {/* Left pane */}
      <div className="left-pane">
        <div className="pane-header left-header" style={{ '--col-tpl': colTpl }}>
          <div>#</div>
          <div>Tarea</div>
          {!hiddenCols.has('dur') && <div>Dur</div>}
          {!hiddenCols.has('resp') && <div>Resp.</div>}
          {!hiddenCols.has('start') && <div>Inicio</div>}
          {!hiddenCols.has('end') && <div>Fin</div>}
          {!hiddenCols.has('pred') && <div>Pred.</div>}
          {!hiddenCols.has('pct') && <div>%</div>}
          {!hiddenCols.has('nivel') && <div>Nivel</div>}
          {!hiddenCols.has('rubro') && <div>Rubro</div>}
          {!hiddenCols.has('contratista') && <div>Contratista</div>}
          <div>📌</div>
        </div>
        <div className="left-body" ref={leftBodyRef}>
          {visibleTasks.length === 0
            ? <div className="empty-state">Sin tareas para mostrar</div>
            : visibleTasks.map((t, i) => {
              const m = t.assigned_to ? members.find(x => x.id === t.assigned_to) : null
              const indent = t.depth * 20
              const isMilestone = !!t.is_milestone
              const durDays = businessDays(t.start_date, t.end_date)
              const durLabel = isMilestone ? '◆' : durDays + 'd'
              const preds = predMap[t.id] || []
              const isPinned = pinnedTaskIds.has(t.id)
              const isSelected = selectedIds.has(t.id)
              const rowCls = `task-row${t._isSummary ? ' row-summary' : ''}${isSelected ? ' row-selected' : ''}${t.depth > 0 ? ' row-indent-' + Math.min(t.depth, 5) : ''}`

              return (
                <div
                  key={t.id}
                  className={rowCls}
                  style={{ '--col-tpl': colTpl }}
                  onClick={(e) => toggleSelect(t.id, e)}
                >
                  <div className="cell" style={{ justifyContent: 'center', color: 'var(--text-3)', fontSize: 10 }}>
                    <input type="checkbox" checked={isSelected} onChange={e => toggleSelect(t.id, e)} onClick={e => e.stopPropagation()} style={{ marginRight: 2, accentColor: 'var(--brand)' }} />
                    {saving[t.id] === 'saving' ? <span className="save-indicator save-spin" title="Guardando…">⏳</span>
                      : saving[t.id] === 'ok' ? <span className="save-indicator save-ok" title="Guardado">✓</span>
                      : saving[t.id] === 'error' ? <span className="save-indicator save-err" title="Error al guardar">✗</span>
                      : (i + 1)}
                  </div>
                  <div className="cell task-name-cell" onClick={e => { if (editMode) e.stopPropagation() }}>
                    <span className="indent" style={{ width: indent }} />
                    {t.hasChildren
                      ? <span className="expand-toggle" onClick={e => { e.stopPropagation(); toggleCollapsed(t.id) }}>{t.isCollapsed ? '▶' : '▼'}</span>
                      : <span className="expand-toggle empty" />
                    }
                    {isMilestone && <span style={{ color: 'var(--accent)', fontSize: 10, marginRight: 2 }}>◆</span>}
                    {editMode
                      ? <InlineText value={t.name || ''} onSave={v => quickSave(t.id, 'name', v)} disabled={saving[t.id] === 'saving'} placeholder="(sin nombre)" />
                      : <span className="task-name-text" title={t.name}>{t.name}</span>}
                    <button
                      type="button"
                      className="row-open-btn"
                      title="Abrir ficha de la tarea"
                      onClick={e => { e.stopPropagation(); openTaskModal(tasks.find(x => x.id === t.id) || t) }}
                      style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '0 4px', color: 'var(--text-3)', flexShrink: 0 }}
                    >✎</button>
                  </div>
                  {!hiddenCols.has('dur') && (
                    <div className="cell" style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                      {editMode && !t._isSummary && !isMilestone ? (
                        <DurationInput
                          days={durDays}
                          disabled={saving[t.id] === 'saving'}
                          onCommit={newDur => {
                            const newEnd = addBusinessDays(t.start_date, newDur)
                            if (newEnd) quickSave(t.id, 'end_date', newEnd)
                          }}
                        />
                      ) : (
                        <span>{durLabel}</span>
                      )}
                    </div>
                  )}
                  {!hiddenCols.has('resp') && (
                    <div className="cell assignee-cell" onClick={e => e.stopPropagation()}>
                      {editMode ? (
                        <select
                          className="inline-select"
                          value={t.assigned_to || ''}
                          disabled={saving[t.id] === 'saving'}
                          onChange={e => quickSave(t.id, 'assigned_to', e.target.value)}
                          title="Cambiar responsable"
                        >
                          <option value="">— sin asignar —</option>
                          {members.filter(x => x.active).map(x => (
                            <option key={x.id} value={x.id}>{x.name}</option>
                          ))}
                        </select>
                      ) : (
                        m
                          ? <><span className="avatar" style={{ background: m.color, width: 20, height: 20, fontSize: 9 }}>{m.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</span><span className="assignee-name">{m.name}</span></>
                          : <span style={{ color: 'var(--text-3)', fontSize: 10 }}>—</span>
                      )}
                    </div>
                  )}
                  {!hiddenCols.has('start') && (
                    <div className="cell" onClick={e => e.stopPropagation()}>
                      {editMode
                        ? <input type="date" className="inline-date" value={t.start_date || ''} disabled={saving[t.id] === 'saving'}
                            onChange={e => quickSave(t.id, 'start_date', e.target.value)} />
                        : <span className="date" style={{ fontSize: 10 }}>{formatDate(t.start_date)}</span>}
                    </div>
                  )}
                  {!hiddenCols.has('end') && (
                    <div className="cell" onClick={e => e.stopPropagation()}>
                      {editMode
                        ? <input type="date" className="inline-date" value={t.end_date || ''} disabled={saving[t.id] === 'saving'}
                            onChange={e => quickSave(t.id, 'end_date', e.target.value)} />
                        : <span className={`date ${isOverdue(t) ? 'overdue' : ''}`} style={{ fontSize: 10 }}>{formatDate(t.end_date)}</span>}
                    </div>
                  )}
                  {!hiddenCols.has('pred') && <div className="cell" style={{ fontSize: 9, color: 'var(--info)', fontFamily: 'JetBrains Mono, monospace' }} title={preds.join('; ')}>{preds.join(';') || '—'}</div>}
                  {!hiddenCols.has('pct') && (
                    <div className="cell" style={{ justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                      {editMode ? (
                        <input
                          type="number" min="0" max="100"
                          className="inline-pct"
                          value={t.progress || 0}
                          disabled={saving[t.id] === 'saving'}
                          onChange={e => {
                            const v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                            quickSave(t.id, 'progress', v)
                          }}
                          onClick={e => e.target.select()}
                          title="Cambiar avance %"
                        />
                      ) : (
                        <span className="pct" style={{ fontSize: 10 }}>{t.progress || 0}</span>
                      )}
                    </div>
                  )}
                  {!hiddenCols.has('nivel') && (
                    <div className="cell" onClick={e => e.stopPropagation()}>
                      {editMode ? (
                        <select className="inline-select" value={t.nivel || ''} disabled={saving[t.id] === 'saving'} onChange={e => quickSave(t.id, 'nivel', e.target.value)}>
                          <option value="">—</option>
                          {['Subsuelo 2','Subsuelo 1','Planta Baja','Primer Piso','Segundo Piso','Tercer Piso','Cubierta','Terreno','General'].map(n => <option key={n}>{n}</option>)}
                        </select>
                      ) : <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{t.nivel || '—'}</span>}
                    </div>
                  )}
                  {!hiddenCols.has('rubro') && (
                    <div className="cell" onClick={e => e.stopPropagation()}>
                      {editMode
                        ? <InlineText value={t.rubro || ''} onSave={v => quickSave(t.id, 'rubro', v)} disabled={saving[t.id] === 'saving'} />
                        : <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{t.rubro || '—'}</span>}
                    </div>
                  )}
                  {!hiddenCols.has('contratista') && (
                    <div className="cell" onClick={e => e.stopPropagation()}>
                      {editMode
                        ? <InlineText value={t.contratista || ''} onSave={v => quickSave(t.id, 'contratista', v)} disabled={saving[t.id] === 'saving'} />
                        : <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{t.contratista || '—'}</span>}
                    </div>
                  )}
                  <div className="cell" style={{ justifyContent: 'center' }}>
                    {editMode && (
                      <span
                        style={{ cursor: 'pointer', fontSize: 11, opacity: isPinned ? 1 : 0.3 }}
                        onClick={e => { e.stopPropagation(); togglePinned(t.id) }}
                      >📌</span>
                    )}
                  </div>
                </div>
              )
            })
          }
        </div>
        {/* ❌ resize-handle removido de acá — estaba cortado por overflow:hidden */}
      </div>

      {/* ── Handle de resize entre paneles ─────────────────────── */}
      {!ganttHidden && <div className="resize-handle" onMouseDown={startResize} />}

      {/* Right pane */}
      {!ganttHidden && (
        <div className="right-pane">
          <div id="ganttHeaderWrap" className="right-header-wrap" style={{ overflowX: 'hidden' }} />
          <div className="right-body" ref={rightBodyRef} id="ganttRightBody">
            <GanttSvg
              tasks={visibleTasks}
              deps={deps}
              viewMode={viewMode}
              currentProject={currentProject}
              editMode={editMode}
              onTaskClick={id => {
                const t = tasks.find(x => x.id === id)
                if (t && editMode) openTaskModal(t)
              }}
              onTaskDrag={async (taskId, newStart, newEnd) => {
                try {
                  const moved = tasks.find(x => x.id === taskId)
                  const delta = moved?.start_date ? diffDays(moved.start_date, newStart) : 0

                  // Snapshot para deshacer: la tarea movida (valores previos)
                  const undoChanges = [{ id: taskId, start_date: moved?.start_date, end_date: moved?.end_date }]

                  await sb.from('tasks').update({ start_date: newStart, end_date: newEnd }).eq('id', taskId)

                  // Recálculo en cascada: ofrecer mover las sucesoras encadenadas
                  if (delta !== 0) {
                    const chain = getSuccessorChain([taskId], deps)
                    if (chain.size > 0) {
                      const follow = window.confirm(
                        `"${moved?.name || 'Esta tarea'}" tiene ${chain.size} tarea(s) sucesora(s) encadenada(s).\n\n` +
                        `¿Moverlas también ${delta > 0 ? '+' : ''}${delta} día(s) para mantener el cronograma consistente?`
                      )
                      if (follow) {
                        const succ = tasks.filter(x => chain.has(x.id))
                        succ.forEach(s => undoChanges.push({ id: s.id, start_date: s.start_date, end_date: s.end_date }))
                        await Promise.all(succ.map(s => {
                          const patch = {}
                          if (s.start_date) patch.start_date = shiftDateStr(s.start_date, delta)
                          if (s.end_date) patch.end_date = shiftDateStr(s.end_date, delta)
                          return Object.keys(patch).length
                            ? sb.from('tasks').update(patch).eq('id', s.id)
                            : Promise.resolve()
                        }))
                      }
                    }
                  }

                  pushUndo(`Mover "${moved?.name || 'tarea'}"`, undoChanges)
                  await loadProject(currentProject.id)
                } catch (e) {
                  console.error('Error al mover tarea:', e)
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
