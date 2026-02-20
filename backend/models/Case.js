const mongoose = require('mongoose');

const caseSchema = new mongoose.Schema({
  radiologistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  patientDetails: {
    patientName: { type: String, required: true },
    patientId: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    modality: {
      type: String,
      enum: ['CT', 'MRI', 'X-Ray', 'Ultrasound', 'Microscopy', 'Other'],
      required: true,
    },
    bodyPart: { type: String, required: true },
    clinicalNotes: { type: String, default: '' },
    studyDate: { type: Date, required: true },
  },
  originalImages: [{ type: String }],     // file paths
  supportImages: [{ type: String }],       // support set image paths
  supportLabels: [{ type: String }],       // support set label paths
  segmentedImages: [{ type: String }],     // mask file paths
  status: {
    type: String,
    enum: ['created', 'uploading', 'processing', 'completed', 'error'],
    default: 'created',
  },
  errorMessage: { type: String, default: '' },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for fast queries by radiologist
caseSchema.index({ radiologistId: 1, createdAt: -1 });

module.exports = mongoose.model('Case', caseSchema);
