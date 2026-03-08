import STAFF_ActivityLog from "../models/STAFF_activityLog.js";

const STAFF_MAJOR_ACTION_TYPES = [
  "billing-create",
  "billing-complete",
  "billing-void",
  "add-item-request",
  "restock-request",
  "archive-item",
  "restore-item",
  "stock-request-sent",
  "expense-submitted",
  "quantity-adjustment-request",
];

const STAFF_parsePagination = (query) => {
  const page = Number.parseInt(query.page, 10);
  const limit = Number.parseInt(query.limit, 10);

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10,
  };
};

export const STAFF_getMyActivityLogs = async (req, res) => {
  try {
    const { page, limit } = STAFF_parsePagination(req.query);
    const skip = (page - 1) * limit;

    const filter = {
      staffId: req.user.id,
      actionType: { $in: STAFF_MAJOR_ACTION_TYPES },
    };

    if (req.query.actionType) {
      const requestedActionType = String(req.query.actionType).trim();
      if (!STAFF_MAJOR_ACTION_TYPES.includes(requestedActionType)) {
        return res.status(200).json({
          page,
          limit,
          total: 0,
          totalPages: 1,
          data: [],
        });
      }

      filter.actionType = requestedActionType;
    }

    if (req.query.status) {
      filter.status = String(req.query.status).trim();
    }

    const [logs, total] = await Promise.all([
      STAFF_ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      STAFF_ActivityLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      data: logs.map((log) => ({
        id: log._id,
        staffId: log.staffId,
        actionType: log.actionType,
        targetItemId: log.targetItemId,
        description: log.description,
        status: log.status,
        timestamp: log.createdAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
