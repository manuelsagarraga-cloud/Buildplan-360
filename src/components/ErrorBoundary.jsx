import React from 'react'

/**
 * ErrorBoundary — Captura errores de React para que la app
 * no se ponga en blanco. Muestra un mensaje amigable y permite
 * recargar o volver a la home.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    console.error('[ErrorBoundary] Error capturado:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    // Intentar volver al Centro de Proyectos limpiando el estado
    try {
      window.location.hash = ''
      window.location.reload()
    } catch (_) {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: 40,
          background: 'var(--bg, #0f1117)', color: 'var(--text-1, #e2e8f0)',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          <div style={{
            maxWidth: 480, textAlign: 'center',
            background: 'var(--surface, #1a1d2e)', borderRadius: 16,
            padding: '40px 32px', border: '1px solid var(--border, #2a2d3e)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>
              Algo salió mal
            </h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-2, #94a3b8)', lineHeight: 1.5 }}>
              Ocurrió un error inesperado. Tus datos están seguros en el servidor.
              Podés recargar la página para continuar.
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--brand, #6366f1)', color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Recargar página
              </button>
              <button
                onClick={this.handleGoHome}
                style={{
                  padding: '10px 20px', borderRadius: 8,
                  border: '1px solid var(--border, #2a2d3e)',
                  background: 'transparent', color: 'var(--text-2, #94a3b8)',
                  fontSize: 14, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Volver al inicio
              </button>
            </div>

            {/* Detalle técnico colapsable */}
            <details style={{ marginTop: 24, textAlign: 'left' }}>
              <summary style={{
                fontSize: 12, color: 'var(--text-3, #64748b)', cursor: 'pointer',
                userSelect: 'none',
              }}>
                Detalle técnico (para soporte)
              </summary>
              <pre style={{
                marginTop: 8, padding: 12, borderRadius: 8,
                background: 'var(--bg, #0f1117)', fontSize: 11,
                color: 'var(--danger, #ef4444)', overflow: 'auto',
                maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {this.state.error?.toString()}
                {'\n\n'}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
