import { create } from 'zustand'
import { sb } from '../lib/supabase'
import { buildHierarchy } from '../lib/utils.js'

export const useStore = create((set, get) => ({
  // ─── Connection ─────────────────────────────────────────────
  connected: null, // null = loading, true, false

  // ─── Data ───────────────────────────────────────────────────
  members: [],
  projects: [],
  currentProject: null,
  tasks: [],
  deps: [],

  // ─── UI State ───────────────────────────────────────────────
  page: 'projects', // 'projects' | 'gantt' | 'resources'
  sidebarOpen: true,
  editMode: true,
  collapsed: new Set(),
  pinnedTaskIds: new Set(),
  viewMode: 'week',
  activeTab: 'gantt',
  filters: { status: '', assignee: '' },

  // ─── Modal ──────────────────────────────────────────────────
  taskModal: { open: false, task: null },
  projectModal: { open: false },
  importModal: { open: false },
  resourceModal: { open: false, member: null },

  // ─── Actions ────────────────────────────────────────────────
  setPage: (page) => set({ page }),
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setEditMode: (v) => set({ editMode: v }),
  setViewMode: (v) => set({ viewMode: v }),
  setActiveTab: (v) => set({ activeTab: v }),
  setFilters: (f) => set(s => ({ filters: { ...s.filters, ...f } })),

  toggleCollapsed: (id) => set(s => {
    const next = new Set(s.collapsed)
    if (next.has(id)) next.delete(id); else next.add(id)
    return { collapsed: next }
  }),
  togglePinned: (id) => set(s => {
    const next = new Set(s.pinnedTaskIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    return { pinnedTaskIds: next }
  }),

  openTaskModal: (task = null) => set({ taskModal: { open: true, task } }),
  closeTaskModal: () => set({ taskModal: { open: false, task: null } }),

  openProjectModal: () => set({ projectModal: { open: true } }),
  closeProjectModal: () => set({ projectModal: { open: false } }),

  openImportModal: () => set({ importModal: { open: true } }),
  closeImportModal: () => set({ importModal: { open: false } }),

  openResourceModal: (member = null) => set({ resourceModal: { open: true, member } }),
  closeResourceModal: () => set({ resourceModal: { open: false, member: null } }),

  // ─── Init ───────────────────────────────────────────────────
  init: async () => {
    try {
      const [mRes, pRes] = await Promise.all([
        sb.from('members').select('*').eq('active', true).order('name'),
        sb.from('projects').select('*').order('start_date'),
      ])
      if (mRes.error) throw mRes.error
      if (pRes.error) throw pRes.error
      set({ members: mRes.data || [], projects: pRes.data || [], connected: true })
    } catch (e) {
      console.error(e)
      set({ connected: false })
    }
  },

  loadProject: async (projectId) => {
    const { projects } = get()
    const project = projects.find(p => p.id === projectId)
    if (!project) return
    try {
      const [tRes, dRes] = await Promise.all([
        sb.from('tasks').select('*').eq('project_id', projectId).order('order_index'),
        sb.from('task_dependencies').select('*'),
      ])
      if (tRes.error) throw tRes.error
      if (dRes.error) throw dRes.error
      const tasks = tRes.data || []
      const ids = new Set(tasks.map(t => t.id))
      const deps = (dRes.data || []).filter(d => ids.has(d.predecessor_id) && ids.has(d.successor_id))
      set({ currentProject: project, tasks, deps, page: 'gantt', collapsed: new Set(), activeTab: 'gantt' })
    } catch (e) {
      console.error(e)
    }
  },

  reloadProject: async () => {
    const { currentProject } = get()
    if (currentProject) await get().loadProject(currentProject.id)
  },

  // ─── Members CRUD ───────────────────────────────────────────
  reloadMembers: async () => {
    const { data } = await sb.from('members').select('*').order('name')
    if (data) set({ members: data })
  },

  saveMember: async (payload, id = null) => {
    if (id) {
      const { error } = await sb.from('members').update(payload).eq('id', id)
      if (error) throw error
    } else {
      const { error } = await sb.from('members').insert(payload)
      if (error) throw error
    }
    await get().reloadMembers()
  },

  deleteMember: async (id) => {
    const { error } = await sb.from('members').delete().eq('id', id)
    if (error) throw error
    await get().reloadMembers()
  },

  // ─── Task CRUD ──────────────────────────────────────────────
  saveTask: async (payload, id, predsInput, visibleTasks) => {
    let savedId = id
    if (id) {
      const { error } = await sb.from('tasks').update(payload).eq('id', id)
      if (error) throw error
    } else {
      const { tasks, currentProject } = get()
      payload.project_id = currentProject.id
      payload.order_index = tasks.length + 1
      const { data, error } = await sb.from('tasks').insert(payload).select('id')
      if (error) throw error
      savedId = data[0]?.id
    }

    // Save predecessors
    if (savedId && predsInput !== undefined) {
      await sb.from('task_dependencies').delete().eq('successor_id', savedId)
      
      const parts = predsInput.split(';').map(s => s.trim()).filter(Boolean)
      const inserts = []
      for (const part of parts) {
        const m = part.match(/^(\d+)(FC|CC|FF|CF)?(([+-]\d+)d)?$/)
        if (!m) continue
        const rowNum = parseInt(m[1])
        const typeStr = m[2] || 'FC'
        const lag = m[3] ? parseInt(m[3]) : 0
        const predTask = visibleTasks[rowNum - 1]
        if (!predTask) continue
        const typeMap = { FC: 'finish_to_start', CC: 'start_to_start', FF: 'finish_to_finish', CF: 'start_to_finish' }
        inserts.push({
          predecessor_id: predTask.id,
          successor_id: savedId,
          dependency_type: typeMap[typeStr] || 'finish_to_start',
          lag_days: lag,
        })
      }
      if (inserts.length) {
        await sb.from('task_dependencies').insert(inserts)
      }
    }
    await get().reloadProject()
    return savedId
  },

  deleteTask: async (id) => {
    await sb.from('task_dependencies').delete().or(`predecessor_id.eq.${id},successor_id.eq.${id}`)
    const { error } = await sb.from('tasks').delete().eq('id', id)
    if (error) throw error
    await get().reloadProject()
  },

  indentTask: async (taskId) => {
    const { tasks } = get()
    const { childrenMap } = buildHierarchy(tasks)
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    // Find siblings at same level and same parent
    const siblings = (childrenMap[task.parent_task_id || 'ROOT'] || [])
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    const idx = siblings.findIndex(s => s.id === taskId)
    if (idx === 0) return // no previous sibling to nest under

    const newParent = siblings[idx - 1]
    await sb.from('tasks').update({ parent_task_id: newParent.id }).eq('id', taskId)
    await get().reloadProject()
  },

  outdentTask: async (taskId) => {
    const { tasks } = get()
    const task = tasks.find(t => t.id === taskId)
    if (!task || !task.parent_task_id) return // already root
    const parent = tasks.find(t => t.id === task.parent_task_id)
    const grandParentId = parent?.parent_task_id || null
    await sb.from('tasks').update({ parent_task_id: grandParentId }).eq('id', taskId)
    await get().reloadProject()
  },

  linkTasks: async (fromId, toId) => {
    const dep = { predecessor_id: fromId, successor_id: toId, dependency_type: 'finish_to_start', lag_days: 0 }
    await sb.from('task_dependencies').upsert(dep, { onConflict: 'predecessor_id,successor_id' })
    await get().reloadProject()
  },

  saveProject: async (payload) => {
    const { currentProject } = get()
    const { error } = await sb.from('projects').update(payload).eq('id', currentProject.id)
    if (error) throw error
    set(s => ({
      currentProject: { ...s.currentProject, ...payload },
      projects: s.projects.map(p => p.id === currentProject.id ? { ...p, ...payload } : p),
    }))
  },

  // ─── Import from MS Project ─────────────────────────────────
  importMSProject: async (parsedData) => {
    const { currentProject, members, tasks: existingTasks } = get()
    if (!currentProject) return

    const { tasks: importTasks } = parsedData

    // Delete existing tasks? We'll INSERT new ones and let user choose via modal
    // Map resource names to member IDs
    const memberNameMap = {}
    members.forEach(m => { memberNameMap[m.name.toLowerCase()] = m.id })

    // First pass: insert all tasks, get IDs
    const uidToId = {}
    const baseOrder = existingTasks.length

    for (let i = 0; i < importTasks.length; i++) {
      const t = importTasks[i]
      const payload = {
        project_id: currentProject.id,
        name: t.name,
        start_date: t.start_date,
        end_date: t.end_date,
        is_milestone: t.is_milestone,
        progress: t.progress,
        description: t.description,
        status: t.status,
        priority: t.priority,
        bar_color: t.bar_color,
        order_index: baseOrder + i + 1,
        assigned_to: t._resourceName ? (memberNameMap[t._resourceName.toLowerCase()] || null) : null,
      }
      const { data, error } = await sb.from('tasks').insert(payload).select('id')
      if (error) throw error
      uidToId[t._importUID] = data[0].id
    }

    // Second pass: set parent_task_id
    for (const t of importTasks) {
      if (t._parentUID) {
        const newId = uidToId[t._importUID]
        const parentId = uidToId[t._parentUID]
        if (newId && parentId) {
          await sb.from('tasks').update({ parent_task_id: parentId }).eq('id', newId)
        }
      }
    }

    // Third pass: dependencies
    for (const t of importTasks) {
      const succId = uidToId[t._importUID]
      if (!succId) continue
      for (const pl of t._predecessorLinks) {
        const predId = uidToId[pl.predUID]
        if (!predId || predId === succId) continue
        await sb.from('task_dependencies').insert({
          predecessor_id: predId,
          successor_id: succId,
          dependency_type: pl.type,
          lag_days: pl.lag,
        }).then(() => {})
      }
    }

    await get().reloadProject()
    return importTasks.length
  },
}))
