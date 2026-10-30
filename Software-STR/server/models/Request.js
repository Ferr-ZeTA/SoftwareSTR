import mongoose from 'mongoose'

export const LOCAL_STATUS = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  NO_APROBADA: 'No Aprobada',
}

// Estado del envio de la decision al endpoint de SAP.
export const SAP_PUSH_STATUS = {
  // Sin decidir todavia.
  NO_APLICA: 'no_aplica',
  ENVIADO: 'enviado',
  FALLIDO: 'fallido',
}

// La API conserva los datos operativos; solo se guarda su identificador para
// enlazar decisiones locales con la solicitud externa correspondiente.
const referenceFields = {
  externalId: { type: String, required: true, unique: true, index: true },
  country: { type: String, enum: ['GT', 'SV'], required: true, index: true },
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

// Estado de aprobacion, posposicion, auditoria y envio a SAP.
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
  approvalDeferredAt: { type: Date, default: null },
  approvalDeferredBy: { type: String, default: null },
  approvalHistory: { type: [decisionSchema], default: [] },
  // --- Escritura de la decision en SAP ---
  // Resultado de registrar la decision en SAP. La llamada es sincronica: pasa
  // al enviar el formulario del correo, asi que esto es constancia de lo que
  // respondio SAP, no una cola.
  sapPushStatus: {
    type: String,
    enum: Object.values(SAP_PUSH_STATUS),
    default: SAP_PUSH_STATUS.NO_APLICA,
    index: true,
  },
  sapPushAt: { type: Date, default: null },
  sapPushError: { type: String, default: null },
  sapPushCode: { type: String, default: null },
  // Usuario de SAP con el que se autorizo. La clave nunca se guarda.
  sapAuthorizedBy: { type: String, default: null },
}

const requestSchema = new mongoose.Schema(
  { ...referenceFields, ...localFields },
  { timestamps: true, strict: true },
)

requestSchema.index({ country: 1, deletedLocally: 1, localStatus: 1 })

// Estado inicial de una referencia que aun no tiene decisiones locales.
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
  approvalDeferredAt: null,
  approvalDeferredBy: null,
  approvalHistory: [],
  sapPushStatus: SAP_PUSH_STATUS.NO_APLICA,
  sapPushAt: null,
  sapPushError: null,
  sapPushCode: null,
  sapAuthorizedBy: null,
}

export const Request = mongoose.model('Request', requestSchema)
