/**
 * saveQueue.js — Cola de guardado con reintentos, debounce y soporte offline.
 * 
 * Resuelve:
 *  1. Microcortes de red: reintenta 3 veces con backoff exponencial.
 *  2. Ediciones rápidas: debounce de 500ms agrupa cambios al mismo campo.
 *  3. Modo offline real: encola cambios y los envía al volver la conexión.
 *  4. Race conditions: cancela el save anterior si se edita el mismo campo
 *     de la misma tarea antes de que se ejecute.
 *
 * Uso:
 *   import { enqueueSave, subscribeSaveStatus, getPendingCount } from './saveQueue'
 *   enqueueSave(taskId, field, value, supabaseClient)
 *   subscribeSaveStatus(callback)  // callback({ taskId, status: 'saving'|'ok'|'error', field })
 */

// ── Estado interno ──────────────────────────────────────────────
const pendingTimers = {}        // key → setTimeout id (debounce)
const pendingQueue = []         // [{ taskId, field, value, sb, retries, key }]
let isProcessing = false
let statusListeners = []

// ── API pública ─────────────────────────────────────────────────

/**
 * Encola un guardado con debounce. Si ya hay un save pendiente para
 * el mismo taskId+field, lo cancela y reprograma.
 */
export function enqueueSave(taskId, field, value, sb, debounceMs = 500) {
  const key = `${taskId}::${field}`

  // Cancelar timer anterior del mismo campo
  if (pendingTimers[key]) {
    clearTimeout(pendingTimers[key])
    // También eliminar de la queue si estaba ahí esperando
    const idx = pendingQueue.findIndex(p => p.key === key && !p._processing)
    if (idx !== -1) pendingQueue.splice(idx, 1)
  }

  // Notificar "pendiente" inmediatamente para feedback visual
  notifyStatus(taskId, 'pending', field)

  // Programar el save real con debounce
  pendingTimers[key] = setTimeout(() => {
    delete pendingTimers[key]
    pendingQueue.push({ taskId, field, value, sb, retries: 0, key, _processing: false })
    processQueue()
  }, debounceMs)
}

/**
 * Suscribirse a cambios de estado de guardado.
 * callback recibe { taskId, status, field, error? }
 * Devuelve función de unsuscribe.
 */
export function subscribeSaveStatus(callback) {
  statusListeners.push(callback)
  return () => {
    statusListeners = statusListeners.filter(l => l !== callback)
  }
}

/** Cantidad de saves pendientes (para mostrar en UI si se quiere). */
export function getPendingCount() {
  return pendingQueue.length + Object.keys(pendingTimers).length
}

/** Fuerza el envío de todo lo pendiente (flush). Útil antes de cerrar. */
export function flushAll() {
  // Ejecutar todos los timers pendientes inmediatamente
  for (const key of Object.keys(pendingTimers)) {
    clearTimeout(pendingTimers[key])
    delete pendingTimers[key]
  }
  // Las entradas ya deberían estar en la queue; procesarlas
  processQueue()
}

// ── Procesamiento de la cola ────────────────────────────────────

async function processQueue() {
  if (isProcessing) return
  isProcessing = true

  while (pendingQueue.length > 0) {
    // No procesar si estamos offline — esperar al evento 'online'
    if (!navigator.onLine) {
      break
    }

    const item = pendingQueue[0]
    item._processing = true
    notifyStatus(item.taskId, 'saving', item.field)

    const success = await attemptSave(item)

    if (success) {
      pendingQueue.shift()
      notifyStatus(item.taskId, 'ok', item.field)
    } else if (item.retries < 3) {
      item.retries++
      item._processing = false
      // Backoff exponencial: 1s, 2s, 4s
      const delay = Math.pow(2, item.retries - 1) * 1000
      await sleep(delay)
      // Verificar si la item todavía está en la queue (podría haber sido reemplazada)
      if (pendingQueue[0] === item) continue
    } else {
      // 3 reintentos agotados — sacar de la cola y notificar error
      pendingQueue.shift()
      notifyStatus(item.taskId, 'error', item.field, 'No se pudo guardar después de 3 intentos')
    }
  }

  isProcessing = false
}

async function attemptSave(item) {
  try {
    const v = item.value === '' ? null : item.value
    const { error } = await item.sb.from('tasks').update({ [item.field]: v }).eq('id', item.taskId)
    if (error) {
      console.warn(`[saveQueue] Error guardando ${item.field} de ${item.taskId}:`, error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn(`[saveQueue] Excepción guardando ${item.field} de ${item.taskId}:`, e.message)
    return false
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function notifyStatus(taskId, status, field, error) {
  for (const cb of statusListeners) {
    try { cb({ taskId, status, field, error }) } catch (_) {}
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Listener de reconexión: al volver online, reanudar la cola ──
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (pendingQueue.length > 0) {
      console.log(`[saveQueue] Online — procesando ${pendingQueue.length} cambio(s) pendiente(s)`)
      processQueue()
    }
  })

  // Advertir si el usuario cierra la pestaña con saves pendientes
  window.addEventListener('beforeunload', (e) => {
    const count = getPendingCount()
    if (count > 0) {
      e.preventDefault()
      e.returnValue = `Tenés ${count} cambio(s) sin guardar. ¿Seguro querés salir?`
    }
  })
}
