import mongoose from 'mongoose'

export const ROLES = {
  GERENTE_GENERAL: 'GERENTE_GENERAL',
  GERENTE_REGIONAL: 'GERENTE_REGIONAL',
}

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true },
    // Obligatorio solo para GERENTE_REGIONAL: filtra el listado del lado del servidor.
    country: {
      type: String,
      enum: ['GT', 'SV', null],
      default: null,
      required: function () {
        return this.role === ROLES.GERENTE_REGIONAL
      },
    },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
)

userSchema.methods.scopeFilter = function () {
  return this.role === ROLES.GERENTE_GENERAL ? {} : { country: this.country }
}

export const User = mongoose.model('User', userSchema)
