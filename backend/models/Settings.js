import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  // Billing Controls
  billing: {
    vatRate: { type: Number, default: 12 },
    loyaltyDiscount: { type: Number, default: 50 },
    markupRate: { type: Number, default: 0 },
    minimumProfitMargin: { type: Number, default: 10 },
    priceMode: { type: String, enum: ['cost_markup', 'manual'], default: 'cost_markup' },
    autoPriceRecalculation: { type: Boolean, default: false }
  },
  // Clinic Profile
  profile: {
    clinicName: { type: String, default: 'Inventory and Billing Management System' },
    clinicAddress: { type: String, default: '' },
    clinicPhone: { type: String, default: '' },
    clinicEmail: { type: String, default: '' },
    clinicLogo: { type: String, default: '' }
  },
  // Inventory Controls
  inventory: {
    invLowStockThreshold: { type: Number, default: 10 },
    invWarningPeriod: { type: Number, default: 90 },
    categories: { type: [String], default: ['Tablets', 'Capsules', 'Syrup', 'Injectables'] }
  },
  // System & Security
  security: {
    retentionPeriod: { type: String, default: '1 year' },
    sessionTimeout: { type: String, default: '30 minutes' }
  }
}, { timestamps: true });

// Ensure only a single settings document can exist
settingsSchema.statics.getInstance = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      billing: {},
      profile: {},
      inventory: {},
      security: {}
    });
  }
  return settings;
};

export default mongoose.model('Settings', settingsSchema);
