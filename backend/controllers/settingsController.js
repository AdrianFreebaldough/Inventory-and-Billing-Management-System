import Settings from '../models/Settings.js';
import logger from '../utils/logger.js';

export const getSettings = async (req, res) => {
  try {
    const settings = await Settings.getInstance();
    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    logger.error('Failed to fetch settings', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const settings = await Settings.getInstance();
    const { billing, profile, inventory, security } = req.body;

    if (billing) {
      settings.billing = { ...settings.billing, ...billing };
    }
    if (profile) {
      settings.profile = { ...settings.profile, ...profile };
    }
    if (inventory) {
      settings.inventory = { ...settings.inventory, ...inventory };
    }
    if (security) {
      settings.security = { ...settings.security, ...security };
    }

    await settings.save();
    
    logger.info('Settings updated successfully', { updatedBy: req.user.id });
    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    logger.error('Failed to update settings', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};
