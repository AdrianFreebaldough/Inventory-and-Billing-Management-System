import express from 'express';
import { protect, authorizeRoles } from '../middleware/AuthMiddlewareUser.js';
import { getSettings, updateSettings } from '../controllers/settingsController.js';

const router = express.Router();

// Any authenticated user can read configuration options
router.get('/', protect, getSettings);

// Only administrators/owners can alter environment rules
router.put('/', protect, authorizeRoles('OWNER'), updateSettings);

export default router;
