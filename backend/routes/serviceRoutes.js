import express from 'express';
import { protect, authorizeRoles } from '../middleware/AuthMiddlewareUser.js';
import {
  getServices,
  adminAddService,
  adminEditService,
  adminArchiveService,
  adminRestoreService,
  submitServiceRequest,
  getServiceRequests,
  approveServiceRequest,
  rejectServiceRequest
} from '../controllers/serviceController.js';

const router = express.Router();

// Services reading
router.get('/', protect, getServices);

// Direct Admin Control
router.post('/', protect, authorizeRoles('OWNER', 'ADMIN'), adminAddService);
router.put('/:id', protect, authorizeRoles('OWNER', 'ADMIN'), adminEditService);
router.patch('/:id/archive', protect, authorizeRoles('OWNER', 'ADMIN'), adminArchiveService);
router.patch('/:id/restore', protect, authorizeRoles('OWNER', 'ADMIN'), adminRestoreService);

// Service Requests Workflow
router.post('/requests', protect, submitServiceRequest);
router.get('/requests', protect, getServiceRequests);
router.put('/requests/:id/approve', protect, authorizeRoles('OWNER', 'ADMIN'), approveServiceRequest);
router.put('/requests/:id/reject', protect, authorizeRoles('OWNER', 'ADMIN'), rejectServiceRequest);

export default router;
