import React, { useState } from 'react'
import { useAuth } from '../store/auth.js'

/**
 * Pantalla de login. Reproduce la de producción: panel de marca a la izquierda
 * y formulario a la derecha. Usa las mismas clases (login-*, brand-*) que ya
 * están estilizadas en index.css / el CSS de la app, para verse igual.
 */
export function LoginScreen() {
  const { signIn, signingIn, authError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!email || !password) return
    await signIn(email, password)
  }

  return (
    <div className="login-shell">
      {/* ── Panel de marca ── */}
      <aside className="login-brand">
        <div className="brand-grid" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="brand-grid-cell" />
          ))}
        </div>
        <div className="brand-overlay-content">
          <div className="brand-e-mark">B</div>
          <h1 className="brand-tagline">
            <span className="brand-tagline-main">Buildplan 360</span>
            <span className="brand-tagline-sub">Gestión de proyectos de construcción</span>
          </h1>
          <p className="brand-subline">Cronogramas, obra y control en un solo lugar.</p>
        </div>
      </aside>

      {/* ── Formulario ── */}
      <main className="login-form-panel">
        <form className="login-form" onSubmit={submit}>
          <h2 className="login-title">Bienvenido de nuevo</h2>
          <p className="login-subtitle">Ingresá tu email y contraseña</p>

          {authError && <div className="login-error-box">{authError}</div>}

          <label className="login-field">
            <span className="login-field-label">Email corporativo</span>
            <input
              type="email"
              className="login-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="nombre@empresa.com"
              required
            />
          </label>

          <label className="login-field">
            <span className="login-field-label">Contraseña</span>
            <input
              type="password"
              className="login-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </label>

          <button
            type="submit"
            className="login-btn-primary-block"
            disabled={signingIn}
          >
            {signingIn ? 'Ingresando…' : 'Ingresar'}
          </button>

          <p className="login-corp-foot">Acceso solo para usuarios autorizados.</p>
        </form>
      </main>
    </div>
  )
}
