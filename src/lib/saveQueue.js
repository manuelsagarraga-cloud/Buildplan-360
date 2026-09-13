/**
 * saveQueue.js v2 — Cola de guardado simplificada.
 *
 * Cambios vs v1:
 *  - SIN bloqueo optimista (generaba falsos conflictos con 2 usuarios)
 *  - Debounce por taskId+field: cancela el anterior si editás rápido
 *  - 5 reintentos con backoff
 *  - Soporte offline real
 *  - Puede guardar múltiples campos de una vez (para cascada)
 */

const pendingTimers = {}
const pendingQueue = []
let isProcessing = false
let statusListeners = []

// ── API pública ─────────────────────────────────────────────────

/** Encola un save individual con debounce. */
export function enqueueSave(taskId, field, value, sb, debounceMs = 500) {
  const key = `${taskId}::${field}`

  if (pendingTimers[key]) {
    clearTimeout(pendingTimers[key])
    const idx = pendingQueue.findIndex(p => p.key === key && !p._processing)
    if (idx !== -1) pendingQueue.splice(idx, 1)
  }

  notifyStatus(taskId, 'pending', field)

  pendingTimers[key] = setTimeout(() => {
    delete pendingTimers[key]
    pendingQueue.push({ taskId, fields: { [field]: value === '' ? null : value }, sb, retries: 0, key, _processing: false })
    processQueue()
  }, debounceMs)
}

/** Encola un save de múltiples campos sin debounce (para cascada). */
export function enqueueBatchSave(taskId, fieldsObj, sb) {
  const key = `${taskId}::batch_${Date.now()}`
  pendingQueue.push({ taskId, fields: fieldsObj, sb, retries: 0, key, _processing: false })
  processQueue()
}

export function subscribeSaveStatus(callback) {
  statusListeners.push(callback)
  return () => { statusListeners = statusListeners.filter(l => l !== callback) }
}

export function getPendingCount() {
  return pendingQueue.length + Object.keys(pendingTimers).length
}

export function waitForEmpty(waitMs = 60000) {
  return new Promise(resolve => {
    const start = Date.now()
    const check = () => {
      if (getPendingCount() === 0 || Date.now() - start > waitMs) { resolve(getPendingCount()); return }
      setTimeout(check, 500)
    }
    check()
  })
}

// ── Procesamiento ───────────────────────────────────────────────

async function processQueue() {
  if (isProcessing) return
  isProcessing = true

  while (pendingQueue.length > 0) {
    if (!navigator.onLine) break

    const item = pendingQueue[0]
    item._processing = true
    notifyStatus(item.taskId, 'saving', Object.keys(item.fields)[0])

    const ok = await attemptSave(item)

    if (ok) {
      pendingQueue.shift()
      notifyStatus(item.taskId, 'ok', Object.keys(item.fields)[0])
    } else if (item.retries < 5) {
      item.retries++
      item._processing = false
      const delay = item.retries * 2000
      await sleep(delay)
      continue
    } else {
      pendingQueue.shift()
      notifyStatus(item.taskId, 'error', Object.keys(item.fields)[0], 'No se pudo guardar después de 5 intentos.')
    }
  }

  isProcessing = false
}

async function attemptSave(item) {
  try {
    const savePromise = item.sb.from('tasks').update(item.fields).eq('id', item.taskId)
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 12000))
    const { error } = await Promise.race([savePromise, timeout])
    if (error) { console.warn('[saveQueue] Error:', item.taskId, error.message); return false }
    return true
  } catch (e) {
    console.warn('[saveQueue] Excepción:', item.taskId, e.message)
    return false
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function notifyStatus(taskId, status, field, error) {
  for (const cb of statusListeners) { try { cb({ taskId, status, field, error }) } catch (_) {} }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Online listener ─────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (pendingQueue.length > 0) {
      console.log(`[saveQueue] Online — ${pendingQueue.length} pendiente(s), enviando en 3s`)
      setTimeout(() => processQueue(), 3000)
    }
  })
  window.addEventListener('beforeunload', (e) => {
    if (getPendingCount() > 0) { e.preventDefault(); e.returnValue = 'Hay cambios sin guardar.' }
  })
}
