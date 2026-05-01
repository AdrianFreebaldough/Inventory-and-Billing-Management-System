import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    trim: true,
    default: 'Services'
  },
  price: {
    type: Number,
    required: true,
    validate: {
      validator: function (v) {
        return v > 0;
      },
      message: "Price must be greater than zero.",
    },
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active'
  }
}, { 
  timestamps: true 
});

export default mongoose.model('Service', serviceSchema);
