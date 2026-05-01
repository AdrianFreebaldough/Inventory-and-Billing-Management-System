import mongoose from 'mongoose';

const serviceRequestSchema = new mongoose.Schema({
  requestType: {
    type: String,
    enum: ['Add', 'Edit Name', 'Edit Price', 'Edit Category', 'Archive', 'Restore'],
    required: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    default: null
  },
  requestedChanges: {
    name: { type: String },
    price: { type: Number },
    category: { type: String }
  },
  originalValues: {
    name: { type: String },
    price: { type: Number },
    category: { type: String }
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  staffName: {
    type: String,
    required: true
  },
  approvalStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  approvalDate: {
    type: Date,
    default: null
  }
}, { 
  timestamps: true 
});

export default mongoose.model('ServiceRequest', serviceRequestSchema);
