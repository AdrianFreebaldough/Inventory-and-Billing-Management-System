import STAFF_Expense from "../models/STAFF_expense.js";
import Notification from "../models/Notification.js";
import STAFF_ActivityLog from "../models/STAFF_activityLog.js";
import User from "../models/user.js";

// Staff: Create expense
export const STAFF_createExpense = async (req, res) => {
  try {
    const { title, category, amount, description, date, receiptImage } = req.body;

    if (!title || !category || !amount) {
      return res.status(400).json({ message: "Title, category, and amount are required" });
    }

    const expense = await STAFF_Expense.create({
      title,
      category,
      amount,
      description: description || "",
      date: date || new Date(),
      staffId: req.user.id,
      staffName: req.user.name || "Staff",
      receiptImage: receiptImage || null,
      status: "Pending",
    });

    // Create a notification for each active owner.
    const owners = await User.find({
      role: "owner",
      isActive: true,
      status: { $ne: "Archived" },
    })
      .select("_id")
      .lean();

    if (owners.length) {
      await Notification.insertMany(
        owners.map((owner) => ({
          userId: owner._id,
          role: "owner",
          message: `New expense submitted by ${req.user.name} - ${title}`,
          type: "expense_submitted",
          redirectUrl: "expenses",
          relatedId: expense._id,
        }))
      );
    }

    await STAFF_ActivityLog.create({
      staffId: req.user.id,
      actionType: "expense-submitted",
      targetItemId: null,
      description: `Submitted expense \"${title}\" (${category})`,
      status: "pending",
    });

    return res.status(201).json({
      message: "Expense created successfully",
      data: expense,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Staff: Get own expenses
export const STAFF_getExpenses = async (req, res) => {
  try {
    const expenses = await STAFF_Expense.find({ staffId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      count: expenses.length,
      data: expenses,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Owner: Get all expenses with filters
export const OWNER_getExpenses = async (req, res) => {
  try {
    const { startDate, endDate, staffName, category, status } = req.query;

    const filter = {};

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (staffName) {
      filter.staffName = { $regex: staffName, $options: "i" };
    }

    if (category) {
      filter.category = category;
    }

    if (status) {
      filter.status = status;
    }

    const expenses = await STAFF_Expense.find(filter)
      .sort({ createdAt: -1 })
      .populate("staffId", "name email")
      .lean();

    // Calculate summary
    const summary = {
      totalExpenses: expenses.reduce((sum, exp) => sum + exp.amount, 0),
      pendingCount: expenses.filter((e) => e.status === "Pending").length,
      approvedCount: expenses.filter((e) => e.status === "Approved").length,
    };

    return res.status(200).json({
      count: expenses.length,
      summary,
      data: expenses,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Owner: Update expense status
export const OWNER_updateExpenseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["Pending", "Reviewed", "Approved"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const expense = await STAFF_Expense.findById(id);

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    expense.status = status;
    expense.reviewedBy = req.user.id;
    expense.reviewedAt = new Date();

    await expense.save();

    // Create notification for staff
    await Notification.create({
      userId: expense.staffId,
      role: "staff",
      message: `Your expense "${expense.title}" has been ${status.toLowerCase()}`,
      type: status === "Approved" ? "expense_approved" : "expense_reviewed",
      redirectUrl: "expenses",
      relatedId: expense._id,
    });

    return res.status(200).json({
      message: "Expense status updated",
      data: expense,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Owner: Get expense summary
export const OWNER_getExpenseSummary = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayExpenses = await STAFF_Expense.aggregate([
      { $match: { date: { $gte: todayStart }, status: "Approved" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const weekExpenses = await STAFF_Expense.aggregate([
      { $match: { date: { $gte: weekStart }, status: "Approved" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const monthExpenses = await STAFF_Expense.aggregate([
      { $match: { date: { $gte: monthStart }, status: "Approved" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    return res.status(200).json({
      data: {
        today: todayExpenses[0]?.total || 0,
        thisWeek: weekExpenses[0]?.total || 0,
        thisMonth: monthExpenses[0]?.total || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
};
