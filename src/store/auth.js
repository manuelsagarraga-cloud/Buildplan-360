import { create } from 'zustand'
import { sb } from '../lib/supabase'

/**
 * Store de autenticación — replica el comportamiento de la versión en producción.
 *
 * Flujo:
 *   1) Al arrancar, mira si hay sesión guardada (getSession).
 *   2) Escucha cambios de sesión (onAuthStateChange): login / logout / refresh.
 *   3) Cuando hay usuario, resuelve su "member" y su rol:
 *        - primero busca en members por user_id
 *        - si no aparece, busca por email (minúscula) como respaldo
 *        - si el rol no es uno conocido, cae a 'viewer'
 *   4) Deriva permisos: canEdit (admin/editor), canParticipate (admin/editor/participant),
 *      isSuperAdmin (super_admin).
 *
 * El aislamiento por empresa NO se maneja acá: lo hace la base (RLS + get_my_company_id()).
 * Este store solo autentica y expone el rol para pintar/ocultar la UI.
 */

const ROLES_VALIDOS = ['super_admin', 'admin', 'editor', 'participant', 'viewer']

function derivarPermisos(role) {
  const r = (role || 'viewer').toLowerCase()
  const rol = ROLES_VALIDOS.includes(r) ? r : 'viewer'
  return {
    role: rol,
    isSuperAdmin: rol === 'super_admin',
    canEdit: rol === 'super_admin' || rol === 'admin' || rol === 'editor',
    canParticipate: ['super_admin', 'admin', 'editor', 'participant'].includes(rol),
  }
}

export const useAuth = create((set, get) => ({
  // ─── Estado ───────────────────────────────────────────────
  authReady: false,        // ya resolvimos si hay sesión o no
  session: null,           // sesión de Supabase (o null)
  user: null,              // auth.users (o null)
  currentMember: null,     // fila de members del usuario (o null)
  role: 'viewer',
  isSuperAdmin: false,
  canEdit: false,
  canParticipate: false,
  authError: '',
  signingIn: false,

  // ─── Resolver el member + rol del usuario logueado ────────
  resolveMember: async (user) => {
    if (!user) {
      set({ currentMember: null, ...derivarPermisos('viewer') })
      return
    }
    try {
      // 1) por user_id
      let { data: member } = await sb
        .from('members').select('*').eq('user_id', user.id).maybeSingle()
      // 2) respaldo por email
      if (!member && user.email) {
        const r = await sb
          .from('members').select('*').eq('email', user.email.toLowerCase()).maybeSingle()
        member = r.data || null
      }
      set({ currentMember: member || null, ...derivarPermisos(member?.role) })
    } catch (e) {
      console.error('No se pudo resolver el rol del usuario:', e)
      set({ currentMember: null, ...derivarPermisos('viewer') })
    }
  },

  // ─── Arranque: sesión existente + suscripción a cambios ───
  initAuth: async () => {
    try {
      const { data: { session } } = await sb.auth.getSession()
      set({ session, user: session?.user || null })
      if (session?.user) await get().resolveMember(session.user)
    } catch (e) {
      console.error('initAuth:', e)
    } finally {
      set({ authReady: true })
    }

    // Reaccionar a login / logout / refresh de token
    sb.auth.onAuthStateChange(async (_event, session) => {
      set({ session, user: session?.user || null })
      if (session?.user) await get().resolveMember(session.user)
      else set({ currentMember: null, ...derivarPermisos('viewer') })
    })
  },

  // ─── Login ────────────────────────────────────────────────
  signIn: async (email, password) => {
    set({ signingIn: true, authError: '' })
    try {
      const { error } = await sb.auth.signInWithPassword({
        email: (email || '').trim().toLowerCase(),
        password: password || '',
      })
      if (error) {
        // Mensajes equivalentes a los de producción
        const msg = /confirm/i.test(error.message)
          ? 'Tenés que confirmar tu email antes de ingresar.'
          : 'Email o contraseña incorrectos.'
        set({ authError: msg })
        return false
      }
      return true
    } catch (e) {
      set({ authError: 'No se pudo conectar. Reintentá en un momento.' })
      return false
    } finally {
      set({ signingIn: false })
    }
  },

  // ─── Logout ───────────────────────────────────────────────
  signOut: async () => {
    try { await sb.auth.signOut() } catch (e) { console.error(e) }
    set({
      session: null, user: null, currentMember: null,
      ...derivarPermisos('viewer'), authError: '',
    })
  },
}))
