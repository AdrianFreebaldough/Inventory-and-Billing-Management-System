import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/user.js";
import ActivityLog from "../models/activityLog.js";
import STAFF_ActivityLog from "../models/STAFF_activityLog.js";
import { escapeRegex } from "../utils/accountIdUtils.js";

const OWNER_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OWNER_normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const OWNER_isValidEmail = (value) => OWNER_EMAIL_REGEX.test(OWNER_normalizeEmail(value));

const OWNER_toDisplayName = (userLike) => {
	const explicitName = String(userLike?.name || userLike?.actorName || "").trim();
	if (explicitName) return explicitName;

	const email = String(userLike?.email || userLike?.actorEmail || "").trim();
	if (email.includes("@")) {
		return email.split("@")[0];
	}
	if (email) return email;

	const role = String(userLike?.role || userLike?.actorRole || "").trim().toUpperCase();
	if (role === "OWNER") return "Owner";
	if (role === "STAFF") return "Staff";

	return "Unknown User";
};

const OWNER_normalizeUserStatus = (user) => {
	if (user?.status === "Archived" || user?.archivedAt) {
		return "Archived";
	}

	if (user?.status === "Inactive") {
		return "Inactive";
	}

	if (user?.status === "Active") {
		return "Active";
	}

	return user?.isActive === false ? "Inactive" : "Active";
};

const OWNER_categorizeAction = (rawAction) => {
	const action = String(rawAction || "").toLowerCase();

	if (action.includes("payment") || action.includes("billing")) return "Payment";
	if (action.includes("request")) return "Request";
	if (action.includes("inventory") || action.includes("product") || action.includes("stock") || action.includes("item")) return "Inventory";
	return "User Management";
};

const OWNER_extractDescriptionFromLegacyDetails = (details) => {
	if (!details) return "No description provided";

	if (typeof details === "string") return details;
	if (typeof details?.notes === "string" && details.notes.trim()) return details.notes;
	if (typeof details?.message === "string" && details.message.trim()) return details.message;

	try {
		return JSON.stringify(details);
	} catch {
		return "No description provided";
	}
};

const OWNER_buildActivitySearchRegex = (value) => {
	const trimmed = String(value || "").trim();
	if (!trimmed) return null;
	return new RegExp(trimmed, "i");
};

const OWNER_logActivity = async ({ req, actionType, description, category, entityType = "User", entityId = null, details = null }) => {
	const actor = await User.findById(req.user.id).select("name email role").lean();

	const actorRole = String(req.user.role || actor?.role || "").toUpperCase() || "OWNER";
	const actorEmail = String(actor?.email || req.user.email || "").trim() || null;

	await ActivityLog.create({
		actorId: req.user.id,
		actorRole,
		actorName: OWNER_toDisplayName(actor),
		actorEmail,
		actionType,
		description,
		category,
		action: actionType,
		performedBy: req.user.id,
		entityType,
		entityId,
		details: details || {
			description,
			category,
		},
	});
};

const OWNER_mapStaffUser = (user) => ({
	id: user._id,
	name: OWNER_toDisplayName(user),
	role: "STAFF",
	accountId: user.email,
	email: user.email,
	status: OWNER_normalizeUserStatus(user),
	archivedAt: user.archivedAt || null,
	archiveReason: user.archiveReason || null,
	createdAt: user.createdAt,
	updatedAt: user.updatedAt,
});

export const OWNER_getStaffUsers = async (req, res) => {
	try {
		const searchRegex = OWNER_buildActivitySearchRegex(req.query.search);
		const requestedStatus = String(req.query.status || "").trim();

		const baseFilter = { role: "staff" };
		if (searchRegex) {
			baseFilter.$or = [
				{ name: searchRegex },
				{ email: searchRegex },
			];
		}

		const staffUsers = await User.find(baseFilter)
			.select("name email role status isActive archivedAt archiveReason createdAt updatedAt")
			.sort({ createdAt: -1 })
			.lean();

		const mapped = staffUsers.map(OWNER_mapStaffUser);
		const filteredByStatus = requestedStatus
			? mapped.filter((user) => user.status.toLowerCase() === requestedStatus.toLowerCase())
			: mapped;

		return res.status(200).json({
			message: "Staff users fetched successfully",
			count: filteredByStatus.length,
			data: filteredByStatus,
		});
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};

export const OWNER_createStaffUser = async (req, res) => {
	try {
		const { name, accountId, email, password } = req.body;

		const normalizedName = String(name || "").trim();
		const normalizedEmail = OWNER_normalizeEmail(email || accountId);
		const plainPassword = String(password || "");

		if (!normalizedName || !normalizedEmail || !plainPassword) {
			return res.status(400).json({ message: "name, email, and password are required" });
		}

		if (!OWNER_isValidEmail(normalizedEmail)) {
			return res.status(400).json({ message: "A valid email is required" });
		}

		if (plainPassword.length < 6) {
			return res.status(400).json({ message: "password must be at least 6 characters" });
		}

		const existingUser = await User.findOne({
			email: {
				$regex: `^${escapeRegex(normalizedEmail)}$`,
				$options: "i",
			},
		}).lean();
		if (existingUser) {
			return res.status(409).json({ message: "Email already exists" });
		}

		const hashedPassword = await bcrypt.hash(plainPassword, 10);

		const createdUser = await User.create({
			name: normalizedName,
			email: normalizedEmail,
			password: hashedPassword,
			role: "staff",
			status: "Active",
			isActive: true,
			archivedAt: null,
			archiveReason: null,
		});

		await OWNER_logActivity({
			req,
			actionType: "Added User",
			description: "Owner created a new staff account",
			category: "User Management",
			entityType: "User",
			entityId: createdUser._id,
			details: {
				targetUserId: createdUser._id,
				targetEmail: createdUser.email,
				targetName: OWNER_toDisplayName(createdUser),
			},
		});

		return res.status(201).json({
			message: "Staff user created successfully",
			data: OWNER_mapStaffUser(createdUser.toObject()),
		});
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};

export const OWNER_updateStaffUser = async (req, res) => {
	try {
		const { id } = req.params;
		const { name, accountId, email } = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ message: "Invalid user id" });
		}

		const staffUser = await User.findOne({ _id: id, role: "staff" });
		if (!staffUser) {
			return res.status(404).json({ message: "Staff user not found" });
		}

		const nextName = name !== undefined ? String(name).trim() : staffUser.name;
		const nextEmail = accountId !== undefined || email !== undefined
			? OWNER_normalizeEmail(accountId || email)
			: staffUser.email;

		if (!nextName || !nextEmail) {
			return res.status(400).json({ message: "name and email are required" });
		}
		if (!OWNER_isValidEmail(nextEmail)) {
			return res.status(400).json({ message: "A valid email is required" });
		}

		const emailAlreadyUsed = await User.findOne({
			_id: { $ne: staffUser._id },
			email: {
				$regex: `^${escapeRegex(nextEmail)}$`,
				$options: "i",
			},
		}).lean();

		if (emailAlreadyUsed) {
			return res.status(409).json({ message: "Email is already in use" });
		}

		staffUser.name = nextName;
		staffUser.email = nextEmail;
		staffUser.role = "staff";

		await staffUser.save();

		await OWNER_logActivity({
			req,
			actionType: "Updated User",
			description: "Owner updated staff account information",
			category: "User Management",
			entityType: "User",
			entityId: staffUser._id,
			details: {
				targetUserId: staffUser._id,
				targetEmail: staffUser.email,
				targetName: OWNER_toDisplayName(staffUser),
			},
		});

		return res.status(200).json({
			message: "Staff user updated successfully",
			data: OWNER_mapStaffUser(staffUser.toObject()),
		});
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};

export const OWNER_archiveStaffUser = async (req, res) => {
	try {
		const { id } = req.params;
		const { archiveReason } = req.body;

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ message: "Invalid user id" });
		}

		const normalizedReason = String(archiveReason || "").trim();
		if (!normalizedReason) {
			return res.status(400).json({ message: "archiveReason is required" });
		}

		const staffUser = await User.findOne({ _id: id, role: "staff" });
		if (!staffUser) {
			return res.status(404).json({ message: "Staff user not found" });
		}

		staffUser.status = "Archived";
		staffUser.isActive = false;
		staffUser.archivedAt = new Date();
		staffUser.archiveReason = normalizedReason;
		staffUser.role = "staff";

		await staffUser.save();

		await OWNER_logActivity({
			req,
			actionType: "Archived User",
			description: `Owner archived staff account. Reason: ${normalizedReason}`,
			category: "User Management",
			entityType: "User",
			entityId: staffUser._id,
			details: {
				targetUserId: staffUser._id,
				targetEmail: staffUser.email,
				archiveReason: normalizedReason,
			},
		});

		return res.status(200).json({
			message: "Staff user archived successfully",
			data: OWNER_mapStaffUser(staffUser.toObject()),
		});
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};

const OWNER_mapUnifiedActivityLog = (log) => {
	const actor = log?.performedBy && typeof log.performedBy === "object" ? log.performedBy : null;

	const actorRole = String(log?.actorRole || actor?.role || "").toUpperCase() || "OWNER";
	const actionType = String(log?.actionType || log?.action || "Activity").trim();
	const category = log?.category || OWNER_categorizeAction(actionType);

	return {
		id: log._id,
		actorId: log.actorId || actor?._id || log.performedBy || null,
		actorRole,
		actorName: OWNER_toDisplayName({
			name: log.actorName || actor?.name,
			email: log.actorEmail || actor?.email,
			role: actorRole,
		}),
		actorEmail: log.actorEmail || actor?.email || null,
		actionType,
		description: log.description || OWNER_extractDescriptionFromLegacyDetails(log.details),
		category,
		createdAt: log.createdAt,
	};
};

const OWNER_mapStaffActivityLog = (log) => {
	const staff = log?.staffId && typeof log.staffId === "object" ? log.staffId : null;
	const actionType = String(log.actionType || "Activity").trim();
	const category = OWNER_categorizeAction(actionType);

	return {
		id: log._id,
		actorId: staff?._id || log.staffId || null,
		actorRole: "STAFF",
		actorName: OWNER_toDisplayName(staff),
		actorEmail: staff?.email || null,
		actionType,
		description: log.description || "No description provided",
		category,
		createdAt: log.createdAt,
	};
};

export const OWNER_getActivityLogs = async (req, res) => {
	try {
		const searchValue = String(req.query.search || "").trim().toLowerCase();
		const categoryFilter = String(req.query.category || "").trim().toLowerCase();

		const [ownerLogs, staffLogs] = await Promise.all([
			ActivityLog.find({})
				.populate("performedBy", "name email role")
				.sort({ createdAt: -1 })
				.lean(),
			STAFF_ActivityLog.find({})
				.populate("staffId", "name email role")
				.sort({ createdAt: -1 })
				.lean(),
		]);

		const unifiedLogs = [
			...ownerLogs.map(OWNER_mapUnifiedActivityLog),
			...staffLogs.map(OWNER_mapStaffActivityLog),
		];

		const filtered = unifiedLogs
			.filter((log) => {
				const matchesCategory = !categoryFilter || String(log.category || "").toLowerCase() === categoryFilter;

				if (!matchesCategory) return false;
				if (!searchValue) return true;

				return [
					log.actorName,
					log.actorEmail,
					log.actionType,
					log.description,
				].some((value) => String(value || "").toLowerCase().includes(searchValue));
			})
			.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

		return res.status(200).json({
			message: "Activity logs fetched successfully",
			count: filtered.length,
			data: filtered,
		});
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};
