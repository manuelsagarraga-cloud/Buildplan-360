import { createClient } from '@supabase/supabase-js'

// ── Bauvek (proyecto qpqoqrroplkyyelkqnxo) ──
export const SUPABASE_URL = 'https://qpqoqrroplkyyelkqnxo.supabase.co'
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwcW9xcnJvcGxreXllbGtxbnhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MzkyMDEsImV4cCI6MjA5NjIxNTIwMX0.FQRiAZme5S-0TVOfQxUdRfxmyI1VXXDBqNJor3w22x4'

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

// ─── Constants ───────────────────────────────────────────────
export const TASK_TYPES = {
  'General': ['OBRAS','PROYECTOS','GESTIONES'],
  'Proyecto': ['Upgrades','ID+D','Infraestructura','Edificio','Vivienda','RFQ','Solped','Documentación Inicial','Oficina Técnica'],
  'Obra': ['Edificio','Vivienda','Infraestructura','Nexos','Obras Anexas','Upgrades','Actas y Gestiones'],
  'Gestión': ['Aprobaciones de Proyectos y Loteos','Factibilidades','Cierre y Finales de Obra','Aprobación PH y Apto Escritura','Gestión de Pagos','Pólizas'],
  'Costo': ['Análisis de Ofertas','Análisis de Acompañamiento a Proyectos','Análisis de Pedidos a Comercial'],
  'Comercial': ['Definición Comercial','Minuta'],
  'Legales': ['Escritura','Hipoteca'],
  'Alertas': ['Alerta Proyectos','Alerta Gestiones','Alerta Obra','Alerta Producción'],
  'Indicador': [],
  'Pre-Entrega & Entrega': ['Validación','Entrega'],
  'Compras y Finanzas': ['Licitación','Adjudicación y Contratación','Pago Anticipo'],
  'Vencimiento': [],
  'Brasil CL': ['Solicitud a CL','Solicitud a PINE'],
}

export const CATEGORY_COLORS = {
  'General':'#607D8B','Proyecto':'#2196F3','Obra':'#FF9800','Gestión':'#9C27B0',
  'Costo':'#4CAF50','Comercial':'#F44336','Legales':'#795548','Alertas':'#FF5722',
  'Indicador':'#009688','Pre-Entrega & Entrega':'#CDDC39','Compras y Finanzas':'#3F51B5',
  'Vencimiento':'#E91E63','Brasil CL':'#00BCD4',
}

export const STATUS_LABELS = {
  pending: 'Pendiente', in_progress: 'En progreso', completed: 'Completada', blocked: 'Bloqueada',
}
export const PRIORITY_LABELS = {
  low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica',
}
export const PROJECT_STATUS_LABELS = {
  planning: 'Planificación', active: 'En curso', on_hold: 'En pausa',
  completed: 'Completado', cancelled: 'Cancelado',
}

export const PROVINCIAS = [
  'Internacional','Paraguay','Buenos Aires','Chubut','Córdoba','Mendoza',
  'Neuquén','Salta','San Juan','Tucumán','I+D+I & Área de Costos',
  'Cronograma Inactivo - En Revisión','Otros Cronogramas',
]

export const CICLOS_VIDA = [
  '1-Landbanking','2-En Proyecto','3-En Stand By Financiero','4-En Licitación de obra',
  '5-En Obra','6-Entregado','7-En Escrituración','8-Entregado y Escriturado','Otros Cronogramas',
]

export const DEP_TYPE_ABBR = {
  finish_to_start: 'FC', start_to_start: 'CC', finish_to_finish: 'FF', start_to_finish: 'CF',
}
export const DEP_ABBR_TYPE = { FC: 'finish_to_start', CC: 'start_to_start', FF: 'finish_to_finish', CF: 'start_to_finish' }
