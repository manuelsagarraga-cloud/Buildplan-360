import React, { useState, useEffect } from 'react'

/**
 * Input de texto con estado local para edición inline en la grilla.
 * Mantiene el valor mientras el usuario escribe y guarda al salir (blur/Enter).
 * Escape descarta el cambio.
 */
export function InlineText({ value, onSave, disabled, placeholder = '—' }) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])

  function commit() {
    if (local !== value) onSave(local)
  }

  return (
    <input
      className="inline-text"
      value={local}
      disabled={disabled}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.target.blur() } if (e.key === 'Escape') { setLocal(value); e.target.blur() } }}
      style={{ fontSize: 10 }}
    />
  )
}
