import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useStore } from '../store/index.js'
import { getVisibleTasks, businessDays, formatDate, isOverdue } from '../lib/utils.js'
import { DEP_TYPE_ABBR, STATUS_LABELS, PRIORITY_LABELS } from '../lib/supabase.js'
import { GanttSvg } from './GanttSvg.jsx'
import { toast } from './Toast.jsx'

const COL_DEFS = [
  { key: '#', label: '#', w: 26, toggle: false },
  { key: 'name', label: 'Tarea', w: null, toggle: false },
  { key: 'dur', label: 'Dur', w: 46, toggle: true },
  { key: 'resp', label: 'Responsable', w: 90, toggle: true },
  { key: 'start', label: 'Inicio', w: 64, toggle: true },
  { key: 'end', label: 'Fin', w: 64, toggle: true },
  { key: 'pred', label: 'Pred', w: 72, toggle: true },
  { key: 'pct', label: '%', w: 26, toggle: true },
  { key: 'pin', label: '📌', w: 26, toggle: false },
]

function buildColTemplate(hidden) {
  return COL_DEFS.map(c => {
    if (c.toggle && hidden.has(c.key)) return '0px'
    if (c.w) return c.w + 'px'
    return '1fr'
  }).join(' ')
}

export function GanttView() {
  const {
    tasks, deps, members, currentProject,
    filters, setFilters, viewMode, setViewMode,
    collapsed, toggleCollapsed, pinnedTaskIds, togglePinned,
    editMode, openTaskModal, openImportModal,
    indentTask, outdentTask, linkTasks,
  } = useStore()

  const [hiddenCols, setHiddenCols] = useState(new Set())
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [leftPaneW, setLeftPaneW] = useState(640)
  const leftBodyRef = useRef(null)
  const rightBodyRef = useRef(null)
  const headerRef = useRef(null)
  const activeTab = useStore(s => s.activeTab)
  const setActiveTab = useStore(s => s.setActiveTab)

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
    const onMove = e => setLeftPaneW(Math.max(320, Math.min(900, startW + e.clientX - startX)))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [leftPaneW])

  const colTpl = buildColTemplate(hiddenCols)

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

  const filterCls = useStore(s => s.filters)

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
            {['gantt','list','kanban'].map(v => (
              <button key={v} className={`tab ${activeTab === v ? 'active' : ''}`} onClick={() => setActiveTab(v)}>
                {v === 'gantt' ? 'Gantt' : v === 'list' ? 'Lista' : 'Tablero'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Selection hint ────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{ background: 'var(--info-bg)', borderBottom: '1px solid var(--border)', padding: '4px 24px', fontSize: 12, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {selectedIds.size} tarea(s) seleccionada(s) — usá Sangría / Outdent / Vincular
          <button className="btn btn-sm btn-ghost" onClick={() => setSelectedIds(new Set())}>✕ Limpiar selección</button>
        </div>
      )}

      {/* ── Main view area ────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'gantt' && <GanttSplitView visibleTasks={visibleTasks} predMap={predMap} selectedIds={selectedIds} toggleSelect={toggleSelect} leftPaneW={leftPaneW} startResize={startResize} colTpl={colTpl} leftBodyRef={leftBodyRef} rightBodyRef={rightBodyRef} hiddenCols={hiddenCols} />}
        {activeTab === 'list' && <ListView tasks={tasks.filter(t => (!filters.status || t.status === filters.status) && (!filters.assignee || t.assigned_to === filters.assignee))} />}
        {activeTab === 'kanban' && <KanbanView tasks={tasks.filter(t => !filters.assignee || t.assigned_to === filters.assignee)} />}
      </div>
    </div>
  )
}

// ── Gantt split view ─────────────────────────────────────────
function GanttSplitView({ visibleTasks, predMap, selectedIds, toggleSelect, leftPaneW, startResize, colTpl, leftBodyRef, rightBodyRef, hiddenCols }) {
  const { members, toggleCollapsed, togglePinned, pinnedTaskIds, editMode, tasks, deps, viewMode, currentProject, openTaskModal } = useStore()

  return (
    <div
      className="gantt-split"
      style={{ '--left-pane-w': leftPaneW + 'px', '--col-tpl': colTpl, height: '100%' }}
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
          <div>📌</div>
        </div>
        <div className="left-body" ref={leftBodyRef}>
          {visibleTasks.length === 0
            ? <div className="empty-state">Sin tareas para mostrar</div>
            : visibleTasks.map((t, i) => {
              const m = t.assigned_to ? members.find(x => x.id === t.assigned_to) : null
              const indent = t.depth * 14
              const isMilestone = t.is_milestone || t.start_date === t.end_date
              const dur = isMilestone ? '0d' : businessDays(t.start_date, t.end_date) + 'dh'
              const preds = predMap[t.id] || []
              const isPinned = pinnedTaskIds.has(t.id)
              const isSelected = selectedIds.has(t.id)
              const rowCls = `task-row${t._isSummary ? ' row-summary' : ''}${isSelected ? ' row-selected' : ''}`

              return (
                <div
                  key={t.id}
                  className={rowCls}
                  style={{ '--col-tpl': colTpl }}
                  onClick={() => { if (editMode) openTaskModal(tasks.find(x => x.id === t.id) || t) }}
                >
                  <div className="cell" style={{ justifyContent: 'center', color: 'var(--text-3)', fontSize: 10 }}>
                    <input type="checkbox" checked={isSelected} onChange={e => toggleSelect(t.id, e)} onClick={e => e.stopPropagation()} style={{ marginRight: 2, accentColor: 'var(--brand)' }} />
                    {i + 1}
                  </div>
                  <div className="cell task-name-cell">
                    <span className="indent" style={{ width: indent }} />
                    {t.hasChildren
                      ? <span className="expand-toggle" onClick={e => { e.stopPropagation(); toggleCollapsed(t.id) }}>{t.isCollapsed ? '▸' : '▾'}</span>
                      : <span className="expand-toggle empty">·</span>
                    }
                    {isMilestone && <span style={{ color: 'var(--accent)', fontSize: 10, marginRight: 2 }}>◆</span>}
                    <span className="task-name-text" title={t.name}>{t.name}</span>
                  </div>
                  {!hiddenCols.has('dur') && <div className="cell" style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace', justifyContent: 'center' }}>{dur}</div>}
                  {!hiddenCols.has('resp') && (
                    <div className="cell assignee-cell">
                      {m ? <><span className="avatar" style={{ background: m.color, width: 20, height: 20, fontSize: 9 }}>{m.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</span><span className="assignee-name">{m.name}</span></> : <span style={{ color: 'var(--text-3)', fontSize: 10 }}>—</span>}
                    </div>
                  )}
                  {!hiddenCols.has('start') && <div className="cell"><span className="date" style={{ fontSize: 10 }}>{formatDate(t.start_date)}</span></div>}
                  {!hiddenCols.has('end') && <div className="cell"><span className={`date ${isOverdue(t) ? 'overdue' : ''}`} style={{ fontSize: 10 }}>{formatDate(t.end_date)}</span></div>}
                  {!hiddenCols.has('pred') && <div className="cell" style={{ fontSize: 9, color: 'var(--info)', fontFamily: 'JetBrains Mono, monospace' }} title={preds.join('; ')}>{preds.join(';') || '—'}</div>}
                  {!hiddenCols.has('pct') && <div className="cell" style={{ justifyContent: 'center' }}><span className="pct" style={{ fontSize: 10 }}>{t.progress || 0}</span></div>}
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
        <div className="resize-handle" onMouseDown={startResize} />
      </div>

      {/* Right pane */}
      <div className="right-pane">
        <div id="ganttHeaderWrap" className="right-header-wrap" style={{ overflowX: 'hidden' }} />
        <div className="right-body" ref={rightBodyRef} id="ganttRightBody">
          <GanttSvg
            tasks={visibleTasks}
            deps={deps}
            viewMode={viewMode}
            currentProject={currentProject}
            onTaskClick={id => {
              const t = tasks.find(x => x.id === id)
              if (t && editMode) openTaskModal(t)
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── List view ────────────────────────────────────────────────
function ListView({ tasks }) {
  const { members, editMode, openTaskModal } = useStore()
  return (
    <div className="view-list">
      <table className="task-table">
        <thead>
          <tr>
            <th>#</th><th>Tarea</th><th>Responsable</th><th>Estado</th>
            <th>Prioridad</th><th>Inicio</th><th>Fin</th><th>Avance</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0
            ? <tr><td colSpan={8} className="empty-state">Sin tareas</td></tr>
            : tasks.map((t, i) => {
              const m = t.assigned_to ? members.find(x => x.id === t.assigned_to) : null
              const parent = t.parent_task_id ? tasks.find(x => x.id === t.parent_task_id) : null
              const barCol = t.status === 'completed' ? 'var(--success)' : t.status === 'blocked' ? 'var(--danger)' : t.status === 'in_progress' ? 'var(--info)' : 'var(--neutral)'
              return (
                <tr key={t.id} onClick={() => editMode && openTaskModal(t)}>
                  <td style={{ color: 'var(--text-3)', fontWeight: 600 }}>{i + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {parent && <div style={{ color: 'var(--text-3)', fontSize: 11 }}>↳ {parent.name}</div>}
                      {t.name}
                    </div>
                  </td>
                  <td>{m ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="avatar" style={{ background: m.color }}>{m.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</span>{m.name}</div> : <span style={{ color: 'var(--text-3)' }}>Sin asignar</span>}</td>
                  <td><span className={`badge badge-${t.status}`}>{STATUS_LABELS[t.status]}</span></td>
                  <td><span className={`badge badge-${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span></td>
                  <td><span className="date">{formatDate(t.start_date)}</span></td>
                  <td><span className={`date ${isOverdue(t) ? 'overdue' : ''}`}>{formatDate(t.end_date)}</span></td>
                  <td className="progress-cell">
                    <div className="progress">
                      <div className="progress-bar-bg"><div className="progress-bar" style={{ width: (t.progress || 0) + '%', background: barCol }} /></div>
                      <span className="progress-value">{t.progress || 0}%</span>
                    </div>
                  </td>
                </tr>
              )
            })
          }
        </tbody>
      </table>
    </div>
  )
}

// ── Kanban view ──────────────────────────────────────────────
function KanbanView({ tasks }) {
  const { members, editMode, openTaskModal } = useStore()
  const cols = [
    { key: 'pending', label: 'Pendiente' },
    { key: 'in_progress', label: 'En progreso' },
    { key: 'completed', label: 'Completada' },
    { key: 'blocked', label: 'Bloqueada' },
  ]
  return (
    <div className="view-kanban">
      <div className="kanban-board">
        {cols.map(col => {
          const ct = tasks.filter(t => t.status === col.key)
          return (
            <div key={col.key} className="kanban-column">
              <div className="kanban-column-header">
                <span className="kanban-column-title">{col.label}</span>
                <span className="kanban-count">{ct.length}</span>
              </div>
              {ct.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-3)', fontSize: 12 }}>Sin tareas</div>}
              {ct.map(t => {
                const m = t.assigned_to ? members.find(x => x.id === t.assigned_to) : null
                return (
                  <div key={t.id} className="kanban-card" onClick={() => editMode && openTaskModal(t)}>
                    <div className="kanban-card-title">{t.name}</div>
                    <span className={`badge badge-${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span>
                    <div className="kanban-card-meta">
                      {m ? <span className="avatar" style={{ background: m.color }} title={m.name}>{m.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</span> : <span />}
                      <span className={`kanban-card-date ${isOverdue(t) ? 'overdue' : ''}`}>{formatDate(t.end_date)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
