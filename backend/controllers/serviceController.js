import Service from '../models/Service.js';
import ServiceRequest from '../models/ServiceRequest.js';
import logger from '../utils/logger.js';

// GET active services
export const getServices = async (req, res) => {
  try {
    // Admin can view all, staff/billing usually only view active
    const query = req.user.role === 'OWNER' ? {} : { status: 'active' };
    const services = await Service.find(query).sort({ createdAt: -1 });
    
    // Find all pending requests to flag active locks
    const pendingRequests = await ServiceRequest.find({ approvalStatus: 'Pending' });
    const pendingServiceIds = pendingRequests.map(r => r.serviceId?.toString()).filter(Boolean);
    
    const data = services.map(s => {
      const plain = s.toObject();
      plain.hasPendingRequest = pendingServiceIds.includes(plain._id.toString());
      return plain;
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Failed to fetch services', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN Add Service
export const adminAddService = async (req, res) => {
  try {
    const { name, price, category } = req.body;
    if (!name || price === undefined || price <= 0) {
      return res.status(400).json({ success: false, message: 'Valid Name and Price greater than 0 required' });
    }

    const service = await Service.create({ 
      name, 
      price, 
      category: category || 'Services', 
      status: 'active' 
    });

    // Create auto-approved request for audit history
    await ServiceRequest.create({
      requestType: 'Add',
      serviceId: service._id,
      requestedChanges: { name, price, category: category || 'Services' },
      requestedBy: req.user.id,
      staffName: req.user.name || 'Admin',
      approvalStatus: 'Approved',
      approvalDate: new Date()
    });

    logger.info('Admin added service directly', { serviceId: service._id });
    return res.status(201).json({ success: true, data: service });
  } catch (error) {
    logger.error('Admin failed to add service', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN Edit Service
export const adminEditService = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category } = req.body;

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const originalValues = { name: service.name, price: service.price, category: service.category };
    const requestedChanges = {};

    if (name && name !== service.name) {
      service.name = name;
      requestedChanges.name = name;
    }
    if (category && category !== service.category) {
      service.category = category;
      requestedChanges.category = category;
    }
    if (price !== undefined) {
      const numPrice = Number(price);
      if (numPrice <= 0) return res.status(400).json({ success: false, message: 'Price must be greater than 0' });
      if (numPrice !== service.price) {
        service.price = numPrice;
        requestedChanges.price = numPrice;
      }
    }

    if (Object.keys(requestedChanges).length === 0 && !req.body.forceLog) {
      return res.status(200).json({ success: true, data: service, message: 'No changes detected' });
    }

    await service.save();

    // Determine specific request type for audit
    let requestType = 'Edit Name';
    const keys = Object.keys(requestedChanges);
    if (keys.length === 1) {
      if (keys[0] === 'price') requestType = 'Edit Price';
      if (keys[0] === 'category') requestType = 'Edit Category';
    } else if (keys.length > 1) {
      // If multiple, use a generic label or stick to Edit Name as 'Edit Service' if we expanded enum
      requestType = 'Edit Name'; 
    }

    // Create auto-approved request for audit history
    await ServiceRequest.create({
      requestType, 
      serviceId: id,
      requestedChanges,
      originalValues, 
      requestedBy: req.user.id,
      staffName: req.user.name || 'Admin',
      approvalStatus: 'Approved',
      approvalDate: new Date()
    });

    logger.info('Admin edited service directly', { serviceId: id });
    return res.status(200).json({ success: true, data: service });
  } catch (error) {
    logger.error('Admin failed to edit service', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN Archive Service
export const adminArchiveService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    service.status = 'archived';
    await service.save();

    // Create auto-approved request for audit history
    await ServiceRequest.create({
      requestType: 'Archive',
      serviceId: id,
      requestedChanges: {},
      requestedBy: req.user.id,
      staffName: req.user.name || 'Admin',
      approvalStatus: 'Approved',
      approvalDate: new Date()
    });

    logger.info('Admin archived service directly', { serviceId: id });
    return res.status(200).json({ success: true, data: service });
  } catch (error) {
    logger.error('Admin failed to archive service', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN Restore Service
export const adminRestoreService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    service.status = 'active';
    await service.save();

    // Create auto-approved request for audit history
    await ServiceRequest.create({
      requestType: 'Restore',
      serviceId: id,
      requestedChanges: {},
      requestedBy: req.user.id,
      staffName: req.user.name || 'Admin',
      approvalStatus: 'Approved',
      approvalDate: new Date()
    });

    logger.info('Admin restored service directly', { serviceId: id });
    return res.status(200).json({ success: true, data: service });
  } catch (error) {
    logger.error('Admin failed to restore service', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// STAFF Submit Request
export const submitServiceRequest = async (req, res) => {
  try {
    const { requestType, serviceId, requestedChanges } = req.body;
    if (!requestType) {
      return res.status(400).json({ success: false, message: 'Request type required' });
    }

    let originalValues = null;
    if (serviceId && requestType.startsWith('Edit')) {
      const service = await Service.findById(serviceId);
      if (service) {
        originalValues = { name: service.name, price: service.price, category: service.category };
      }
    }

    const request = await ServiceRequest.create({
      requestType,
      serviceId: serviceId || null,
      requestedChanges: requestedChanges || {},
      originalValues,
      requestedBy: req.user.id,
      staffName: req.user.name || 'Staff User',
      approvalStatus: 'Pending'
    });

    logger.info('Staff submitted service request', { requestId: request._id });
    return res.status(201).json({ success: true, data: request });
  } catch (error) {
    logger.error('Staff failed to submit request', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET Service Requests
export const getServiceRequests = async (req, res) => {
  try {
    const query = req.user.role === 'OWNER' ? {} : { requestedBy: req.user.id };
    const requests = await ServiceRequest.find(query)
      .populate('serviceId')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: requests });
  } catch (error) {
    logger.error('Failed to fetch service requests', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN Approve Request
export const approveServiceRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await ServiceRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.approvalStatus !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Request already resolved' });
    }

    // Apply logic based on Request Type
    if (request.requestType === 'Add') {
      const { name, price, category } = request.requestedChanges;
      const newService = await Service.create({ 
        name, 
        price, 
        category: category || 'Services', 
        status: 'active' 
      });
      request.serviceId = newService._id;
    } else {
      const service = await Service.findById(request.serviceId);
      if (!service) {
        return res.status(404).json({ success: false, message: 'Target service missing' });
      }

      if (request.requestType.startsWith('Edit')) {
        if (request.requestedChanges.name) service.name = request.requestedChanges.name;
        if (request.requestedChanges.price !== undefined && request.requestedChanges.price > 0) {
          service.price = request.requestedChanges.price;
        }
        if (request.requestedChanges.category) service.category = request.requestedChanges.category;
      } else if (request.requestType === 'Archive') {
        service.status = 'archived';
      } else if (request.requestType === 'Restore') {
        service.status = 'active';
      }
      await service.save();
    }

    request.approvalStatus = 'Approved';
    request.approvalDate = new Date();
    await request.save();

    logger.info('Admin approved service request', { requestId: id });
    return res.status(200).json({ success: true, data: request });
  } catch (error) {
    logger.error('Failed to approve service request', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN Reject Request
export const rejectServiceRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await ServiceRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.approvalStatus !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Request already resolved' });
    }

    request.approvalStatus = 'Rejected';
    request.approvalDate = new Date();
    await request.save();

    logger.info('Admin rejected service request', { requestId: id });
    return res.status(200).json({ success: true, data: request });
  } catch (error) {
    logger.error('Failed to reject service request', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};
