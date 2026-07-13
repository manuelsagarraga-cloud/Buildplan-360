// ─── Date helpers ─────────────────────────────────────────────
export function parseDate(s) {
  if (!s) return new Date()
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function dateToISO(d) {
  return d.toISOString().split('T')[0]
}

export function formatDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function addDays(d, days) {
  return new Date(d.getTime() + days * 86400000)
}

export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000)
}

export function businessDays(start, end) {
  const s = parseDate(start), e = parseDate(end)
  let count = 0
  const cur = new Date(s.getTime())
  while (cur <= e) {
    const dow = cur.getUTCDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return count
}

export function isOverdue(t) {
  if (t.status === 'completed') return false
  return t.end_date < new Date().toISOString().split('T')[0]
}

export function today() {
  return new Date().toISOString().split('T')[0]
}

export function getInitials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase()
}

// ─── Hierarchy helpers ─────────────────────────────────────────
export function buildHierarchy(tasks) {
  const taskMap = {}
  const childrenMap = {}
  tasks.forEach(t => {
    taskMap[t.id] = t
    const key = t.parent_task_id || 'ROOT'
    if (!childrenMap[key]) childrenMap[key] = []
    childrenMap[key].push(t)
  })
  Object.keys(childrenMap).forEach(k => {
    childrenMap[k].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
  })
  const roots = childrenMap['ROOT'] || []
  return { roots, childrenMap, taskMap }
}

export function computeRollup(task, childrenMap) {
  const kids = (childrenMap[task.id] || []).map(c =>
    childrenMap[c.id] ? computeRollup(c, childrenMap) : c
  )
  if (kids.length === 0) return task

  const start = kids.reduce((m, c) => c.start_date < m ? c.start_date : m, kids[0].start_date)
  const end = kids.reduce((m, c) => c.end_date > m ? c.end_date : m, kids[0].end_date)
  let totalDays = 0, weighted = 0
  kids.forEach(c => {
    const d = diffDays(c.start_date, c.end_date) + 1
    totalDays += d
    weighted += (c.progress || 0) * d
  })
  const progress = totalDays ? Math.round(weighted / totalDays) : 0
  let status = task.status
  if (kids.every(c => c.status === 'completed')) status = 'completed'
  else if (kids.some(c => c.status === 'in_progress' || c.status === 'completed')) status = 'in_progress'
  else if (kids.some(c => c.status === 'blocked')) status = 'blocked'
  else status = 'pending'

  return { ...task, start_date: start, end_date: end, progress, status, _isSummary: true, _childCount: kids.length }
}

export function getVisibleTasks(allTasks, filters = {}, collapsed = new Set()) {
  const { roots, childrenMap } = buildHierarchy(allTasks)
  const result = []

  function passesFilter(t) {
    if (filters.status && t.status !== filters.status) return false
    if (filters.assignee && t.assigned_to !== filters.assignee) return false
    return true
  }

  function walk(task, depth) {
    const hasChildren = !!(childrenMap[task.id] && childrenMap[task.id].length)
    const t = hasChildren ? computeRollup(task, childrenMap) : task
    t.depth = depth
    t.hasChildren = hasChildren
    t.isCollapsed = collapsed.has(task.id)
    if (!hasChildren && !passesFilter(t)) return
    result.push(t)
    if (hasChildren && !collapsed.has(task.id)) {
      childrenMap[task.id].forEach(child => walk(child, depth + 1))
    }
  }
  roots.forEach(r => walk(r, 0))
  return result
}

// ─── Parse predecessors string ─────────────────────────────────
export function parsePredecessors(str) {
  // e.g. "3FC;5CC+2d"
  if (!str.trim()) return []
  return str.split(';').map(s => {
    const m = s.trim().match(/^(\d+)(FC|CC|FF|CF)?(([+-]\d+)d)?$/)
    if (!m) return null
    return { rowNum: parseInt(m[1]), type: m[2] || 'FC', lag: m[3] ? parseInt(m[3]) : 0 }
  }).filter(Boolean)
}

// ─── MS Project XML parser ─────────────────────────────────────
export function parseMSProjectXML(xmlText) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) throw new Error('XML inválido: ' + parseError.textContent)

  const getText = (el, tag) => el.querySelector(tag)?.textContent?.trim() || ''
  const taskEls = Array.from(doc.querySelectorAll('Task'))

  const rawTasks = taskEls.map(el => ({
    uid: getText(el, 'UID'),
    id: getText(el, 'ID'),
    name: getText(el, 'Name'),
    outlineLevel: parseInt(getText(el, 'OutlineLevel') || '0'),
    start: getText(el, 'Start'),
    finish: getText(el, 'Finish'),
    duration: getText(el, 'Duration'), // PT8H0M0S format
    milestone: getText(el, 'Milestone') === '1',
    percentComplete: parseInt(getText(el, 'PercentComplete') || '0'),
    notes: getText(el, 'Notes'),
    summary: getText(el, 'Summary') === '1',
    predecessorLinks: Array.from(el.querySelectorAll('PredecessorLink')).map(pl => ({
      predUID: getText(pl, 'PredecessorUID'),
      type: getText(pl, 'Type'), // 0=FF,1=FS,2=SF,3=SS
      lag: getText(pl, 'LinkLag'),
    })),
    resourceUID: getText(el, 'ResourceUID'),
  })).filter(t => t.uid !== '0' && t.name) // skip summary row 0

  // Map resource UIDs to names
  const resourceEls = Array.from(doc.querySelectorAll('Resource'))
  const resourceMap = {}
  resourceEls.forEach(r => {
    const uid = getText(r, 'UID')
    const name = getText(r, 'Name')
    if (uid && name) resourceMap[uid] = name
  })

  // Determine hierarchy via OutlineLevel
  const uidMap = {}
  rawTasks.forEach(t => { uidMap[t.uid] = t })

  // Compute parent from outline levels
  const stack = []
  rawTasks.forEach(t => {
    const lvl = t.outlineLevel
    while (stack.length && stack[stack.length - 1].outlineLevel >= lvl) stack.pop()
    t.parentUID = stack.length ? stack[stack.length - 1].uid : null
    stack.push(t)
  })

  // Convert dates from ISO or MSP format
  function toISODate(s) {
    if (!s) return today()
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    return today()
  }

  const MSP_DEP_TYPES = { '0': 'finish_to_finish', '1': 'finish_to_start', '2': 'start_to_finish', '3': 'start_to_start' }

  return {
    tasks: rawTasks.map(t => ({
      _importUID: t.uid,
      _parentUID: t.parentUID,
      name: t.name,
      start_date: toISODate(t.start),
      end_date: toISODate(t.finish),
      is_milestone: t.milestone,
      progress: t.percentComplete,
      description: t.notes || null,
      status: t.percentComplete === 100 ? 'completed' : t.percentComplete > 0 ? 'in_progress' : 'pending',
      priority: 'medium',
      bar_color: '#1d4ed8',
      _predecessorLinks: t.predecessorLinks.map(pl => ({
        predUID: pl.predUID,
        type: MSP_DEP_TYPES[pl.type] || 'finish_to_start',
        lag: pl.lag ? Math.round(parseInt(pl.lag) / 4800) : 0, // MSP stores lag in 1/10 min
      })),
      _resourceName: resourceMap[t.resourceUID] || null,
    })),
  }
}

/**
 * Devuelve el conjunto de IDs de TODAS las tareas sucesoras (directas y
 * transitivas) de las tareas dadas, siguiendo task_dependencies.
 * Protegida contra ciclos. No incluye las tareas de partida.
 */
export function getSuccessorChain(startIds, deps) {
  const start = new Set(startIds)
  const chain = new Set()
  let frontier = new Set(startIds)
  while (frontier.size > 0) {
    const next = new Set()
    for (const d of deps) {
      if (frontier.has(d.predecessor_id)) {
        const s = d.successor_id
        if (!start.has(s) && !chain.has(s)) {
          chain.add(s)
          next.add(s)
        }
      }
    }
    frontier = next
  }
  return chain
}

/** Corre una fecha en formato 'YYYY-MM-DD' N días (negativo = atrás). */
export function shiftDateStr(dateStr, days) {
  if (!dateStr) return dateStr
  return dateToISO(addDays(parseDate(dateStr), days))
}
