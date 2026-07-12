import React, { useState } from 'react'
import { useStore } from '../store/index.js'
import { toast } from './Toast.jsx'

/**
 * Botón que exporta la vista del Gantt actual a PDF.
 * Usa html2canvas + jsPDF cargados desde CDN para no aumentar el bundle.
 * Se engancha en el ProjectHeader.
 */
export function ExportPDF() {
  const { currentProject } = useStore()
  const [exporting, setExporting] = useState(false)

  async function exportToPDF() {
    setExporting(true)
    try {
      // Cargar librerías desde CDN si no están ya
      if (!window.html2canvas) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
      }
      if (!window.jspdf) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
      }

      // Capturar el área del Gantt
      const target = document.getElementById('ganttRightBody') || document.querySelector('.gantt-split') || document.querySelector('.main-content')
      if (!target) { toast('No se encontró el área del Gantt', 'error'); return }

      toast('Generando PDF…')
      const canvas = await window.html2canvas(target, { scale: 1.5, useCORS: true, allowTaint: true })
      const imgData = canvas.toDataURL('image/jpeg', 0.85)

      const { jsPDF } = window.jspdf
      const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait', unit: 'px', format: [canvas.width, canvas.height] })
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height)
      pdf.save(`${currentProject?.name || 'gantt'}-${new Date().toISOString().slice(0,10)}.pdf`)
      toast('PDF exportado')
    } catch (e) {
      console.error(e)
      toast('Error al exportar PDF: ' + e.message, 'error')
    } finally {
      setExporting(false)
    }
  }

  if (!currentProject) return null

  return (
    <button className="btn" onClick={exportToPDF} disabled={exporting} title="Exportar Gantt a PDF">
      {exporting ? '⏳ Generando…' : '📄 PDF'}
    </button>
  )
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src; s.onload = resolve; s.onerror = reject
    document.head.appendChild(s)
  })
}
