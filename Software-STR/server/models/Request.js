import mongoose from 'mongoose'

export const LOCAL_STATUS = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  NO_APROBADA: 'No Aprobada',
}

// Una línea del traslado. Llega de la API; se reemplaza completa en cada sync.
const itemSchema = new mongoose.Schema(
  {
    modelo: { type: String, default: '' },
    descripcion: { type: String, default: '' },
    cantidad: { type: Number, default: 0 },
  },
  { _id: false },
)

// --- Campos de la API externa (GET). La sync los sobreescribe siempre. ---
const externalFields = {
  externalId: { type: String, required: true, unique: true, index: true },
  documento: { type: String, required: true },
  country: { type: String, enum: ['GT', 'SV'], required: true, index: true },
  fecha: { type: Date, default: null },
  clienteCodigo: { type: String, default: '' },
  clienteNombre: { type: String, default: '' },
  bodegaOrigen: { type: String, default: '' },
  bodegaDestino: { type: String, default: '' },
  tipoSolicitud: { type: String, default: '' },
  items: { type: [itemSchema], default: [] },
  totalLineas: { type: Number, default: 0 },
  totalCantidad: { type: Number, default: 0 },
  raw: { type: mongoose.Schema.Types.Mixed, default: [] },
}

// Una entrada del historial de decisiones. Solo se agrega, nunca se edita.
const decisionSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    previousStatus: { type: String, default: null },
    by: { type: String, default: null },
    via: { type: String, enum: ['correo', 'dashboard', 'sistema'], default: 'sistema' },
    at: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false },
)

// --- Campos de control local. La sync NUNCA los toca. ---
const localFields = {
  localStatus: {
    type: String,
    enum: Object.values(LOCAL_STATUS),
    default: LOCAL_STATUS.PENDIENTE,
    index: true,
  },
  internalNotes: { type: String, default: '' },
  deletedLocally: { type: Boolean, default: false, index: true },
  // Se guarda solo el hash SHA-256; el token plano viaja únicamente en el correo.
  approvalTokenHash: { type: String, default: null, index: true, sparse: true },
  approvalTokenExpiresAt: { type: Date, default: null },
  approvalTokenUsedAt: { type: Date, default: null },
  approvalDecidedAt: { type: Date, default: null },
  approvalDecidedBy: { type: String, default: null },
  approvalDecidedVia: { type: String, enum: ['correo', 'dashboard', 'sistema', null], default: null },
  approvalSentTo: { type: String, default: null },
  approvalHistory: { type: [decisionSchema], default: [] },
  // La API dejo de devolver este traslado. No se borra (perderiamos la
  // decision local), se marca para que la divergencia sea visible.
  missingFromApi: { type: Boolean, default: false, index: true },
  missingSince: { type: Date, default: null },
  lastSyncedAt: { type: Date, default: null },
}

const requestSchema = new mongoose.Schema(
  { ...externalFields, ...localFields },
  { timestamps: true },
)

requestSchema.index({ country: 1, fecha: -1 })
requestSchema.index({ country: 1, deletedLocally: 1, localStatus: 1 })

// Lista blanca que usa el servicio de sincronización para construir el $set.
export const EXTERNAL_FIELD_NAMES = Object.keys(externalFields)

// Valores locales iniciales: solo en $setOnInsert.
export const LOCAL_DEFAULTS = {
  localStatus: LOCAL_STATUS.PENDIENTE,
  internalNotes: '',
  deletedLocally: false,
  approvalTokenHash: null,
  approvalTokenExpiresAt: null,
  approvalTokenUsedAt: null,
  approvalDecidedAt: null,
  approvalDecidedBy: null,
  approvalDecidedVia: null,
  approvalSentTo: null,
  approvalHistory: [],
  missingFromApi: false,
  missingSince: null,
}

export const Request = mongoose.model('Request', requestSchema)
