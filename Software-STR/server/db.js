import mongoose from 'mongoose'

export async function connectDB() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI no está configurada')
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'strflow' })
  return mongoose.connection
}
