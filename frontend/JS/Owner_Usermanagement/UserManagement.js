import {
	fetchOwnerUsers,
	createOwnerUser,
	updateOwnerUser,
	archiveOwnerUser,
	fetchOwnerActivityLogs,
} from "./UserManagementData/UserManagementData.js";

let users = [];
let activityLogs = [];
let currentView = "users";
let isLoading = false;
let pendingAddUser = null;
let pendingEditUser = null;
let pendingArchiveUserId = null;
let currentEditUserId = null;

const userFilterOptions = [
	{ value: "All", label: "All Status" },
	{ value: "Active", label: "Active" },
	{ value: "Inactive", label: "Inactive" },
	{ value: "Archived", label: "Archived" },
];

const activityFilterOptions = [
	{ value: "All Activities", label: "All Activities" },
	{ value: "Payments", label: "Payments" },
	{ value: "Inventory", label: "Inventory" },
	{ value: "User Management", label: "User Management" },
	{ value: "Requests", label: "Requests" },
];

const normalizeUser = (user) => ({
	id: user?.id || user?._id,
	name: String(user?.name || "").trim() || "Unnamed Staff",
	role: String(user?.role || "STAFF").toUpperCase(),
	email: String(user?.email || "").trim(),
	status: String(user?.status || "Active").trim(),
	archivedAt: user?.archivedAt || null,
	archiveReason: user?.archiveReason || null,
});

const normalizeCategory = (category) => {
	const value = String(category || "").trim().toLowerCase();
	if (value === "payment" || value === "payments") return "Payments";
	if (value === "request" || value === "requests") return "Requests";
	if (value === "inventory") return "Inventory";
	return "User Management";
};

const normalizeActivity = (activity) => ({
	id: activity?.id || activity?._id,
	timestampRaw: activity?.createdAt || new Date().toISOString(),
	timestamp: formatTimestamp(activity?.createdAt),
	name: String(activity?.actorName || "").trim() || "Unknown User",
	email: String(activity?.actorEmail || "").trim() || "N/A",
	actionType: String(activity?.actionType || "Activity").trim(),
	description: String(activity?.description || "No description provided").trim(),
	category: normalizeCategory(activity?.category),
});

function formatTimestamp(value) {
	if (!value) return "N/A";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return date.toLocaleString("en-PH", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
	});
}

function getStatusBadgeClass(status) {
	if (status === "Active") return "bg-emerald-100 text-emerald-700";
	if (status === "Archived") return "bg-red-100 text-red-700";
	return "bg-gray-100 text-gray-700";
}

function openModal(modalId) {
	const modal = document.getElementById(modalId);
	if (!modal) return;
	modal.classList.remove("hidden");
	modal.classList.add("flex");
}

function closeModal(modalId) {
	const modal = document.getElementById(modalId);
	if (!modal) return;
	modal.classList.add("hidden");
	modal.classList.remove("flex");
}

function closeAllModals() {
	[
		"addUserModal",
		"confirmAddModal",
		"editUserModal",
		"confirmSaveModal",
		"archiveModal",
		"confirmArchiveModal",
	].forEach(closeModal);
}

function setLoadingState(value) {
	isLoading = value;
	const emptyState = document.getElementById("emptyState");
	if (!emptyState) return;

	if (value) {
		emptyState.textContent = "Loading...";
		emptyState.classList.remove("hidden");
	}
}

function showMessage(message) {
	const emptyState = document.getElementById("emptyState");
	if (!emptyState) return;
	emptyState.textContent = message;
	emptyState.classList.remove("hidden");
}

function getCurrentTokenRole() {
	const tokenKeys = ["token", "authToken", "jwtToken", "ibmsToken"];

	for (const key of tokenKeys) {
		const token = localStorage.getItem(key);
		if (!token || !token.trim()) continue;

		const parts = token.split(".");
		if (parts.length < 2) continue;

		try {
			const payload = JSON.parse(atob(parts[1]));
			const role = String(payload?.role || "").toUpperCase();
			if (role) return role;
		} catch {
			return "";
		}
	}

	return "";
}

function handleAuthError(error) {
	if (error?.status === 401) {
		showMessage("Session expired. Please log in again.");
		setTimeout(() => {
			window.location.href = "../../HTML/loginPage/loginPage.html";
		}, 1000);
		return true;
	}

	if (error?.status === 403) {
		showMessage("Access denied. OWNER permissions are required.");
		return true;
	}

	return false;
}

function renderFilterOptions() {
	const statusFilter = document.getElementById("statusFilter");
	if (!statusFilter) return;

	const options = currentView === "users" ? userFilterOptions : activityFilterOptions;
	statusFilter.innerHTML = options
		.map((option) => `<option value="${option.value}">${option.label}</option>`)
		.join("");
}

function updateViewControls() {
	const usersTab = document.getElementById("usersTab");
	const activityLogTab = document.getElementById("activityLogTab");
	const userActionControls = document.getElementById("userActionControls");
	const userSearchInput = document.getElementById("userSearchInput");
	const usersTable = document.getElementById("usersTable");
	const activityLogTable = document.getElementById("activityLogTable");
	const addUserBtn = document.getElementById("addUserBtn");

	if (!usersTab || !activityLogTab || !userSearchInput || !usersTable || !activityLogTable) return;

	const role = getCurrentTokenRole();
	const isOwner = role === "OWNER";

	if (!isOwner) {
		if (addUserBtn) addUserBtn.classList.add("hidden");
		userActionControls?.classList.add("hidden");
	} else if (addUserBtn) {
		addUserBtn.disabled = false;
		addUserBtn.classList.remove("opacity-60", "cursor-not-allowed", "hidden");
		addUserBtn.removeAttribute("title");
	}

	if (currentView === "users") {
		usersTab.className = "px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium";
		activityLogTab.className = "px-4 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium";
		userSearchInput.placeholder = "Search users";
		usersTable.classList.remove("hidden");
		activityLogTable.classList.add("hidden");
		if (isOwner) {
			userActionControls?.classList.remove("hidden");
		}
	} else {
		usersTab.className = "px-4 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium";
		activityLogTab.className = "px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium";
		userSearchInput.placeholder = "Search by Name or Activity...";
		usersTable.classList.add("hidden");
		activityLogTable.classList.remove("hidden");
		userActionControls?.classList.add("hidden");
	}
}

function getFilteredUsers() {
	const searchInput = document.getElementById("userSearchInput");
	const statusFilter = document.getElementById("statusFilter");

	const searchValue = (searchInput?.value || "").trim().toLowerCase();
	const statusValue = statusFilter?.value || "All";

	return users.filter((user) => {
		const matchesSearch =
			user.name.toLowerCase().includes(searchValue) ||
			user.role.toLowerCase().includes(searchValue) ||
			user.email.toLowerCase().includes(searchValue);

		const matchesStatus = statusValue === "All" || user.status === statusValue;

		return matchesSearch && matchesStatus;
	});
}

function getFilteredActivities() {
	const searchInput = document.getElementById("userSearchInput");
	const statusFilter = document.getElementById("statusFilter");

	const searchValue = (searchInput?.value || "").trim().toLowerCase();
	const categoryValue = statusFilter?.value || "All Activities";

	return activityLogs.filter((activity) => {
		const matchesSearch =
			activity.name.toLowerCase().includes(searchValue) ||
			activity.email.toLowerCase().includes(searchValue) ||
			activity.actionType.toLowerCase().includes(searchValue) ||
			activity.description.toLowerCase().includes(searchValue);

		const matchesCategory = categoryValue === "All Activities" || activity.category === categoryValue;

		return matchesSearch && matchesCategory;
	});
}

function getActivityIconMarkup(category) {
	if (category === "Payments") {
		return `

		`;
	}

	if (category === "Inventory") {
		return `

		`;
	}

	if (category === "Requests") {
		return `

		`;
	}

	return `

	`;
}

function renderUsersTable() {
	const tableBody = document.getElementById("userTableBody");
	const emptyState = document.getElementById("emptyState");
	if (!tableBody || !emptyState) return;

	const filteredUsers = getFilteredUsers();

	tableBody.innerHTML = filteredUsers
		.map((user) => {
			const badgeClass = getStatusBadgeClass(user.status);
			const isArchived = user.status === "Archived";

			return `
				<tr class="hover:bg-slate-50 transition-colors">
					<td class="px-4 py-3 text-sm text-slate-900 font-medium">${user.name}</td>
					<td class="px-4 py-3 text-sm text-slate-700">${user.role}</td>
					<td class="px-4 py-3 text-sm text-slate-700">${user.email}</td>
					<td class="px-4 py-3 text-sm">
						<span class="inline-flex px-3 py-1 rounded-full text-xs font-medium ${badgeClass}">${user.status}</span>
					</td>
					<td class="px-4 py-3">
						<div class="flex items-center gap-2">
							<button type="button" class="edit-user-btn p-2 rounded-md text-blue-600 hover:bg-blue-50 ${isArchived ? "opacity-40 cursor-not-allowed" : ""}" data-id="${user.id}" title="Edit" ${isArchived ? "disabled" : ""}>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 pointer-events-none">
									<path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931ZM19.5 7.125 16.862 4.487" />
								</svg>
							</button>
							<button type="button" class="archive-user-btn p-2 rounded-md text-red-600 hover:bg-red-50 ${isArchived ? "opacity-40 cursor-not-allowed" : ""}" data-id="${user.id}" title="Archive" ${isArchived ? "disabled" : ""}>
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 pointer-events-none">
									<path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.866 12.142A2.25 2.25 0 0 1 17.14 21.75H6.86a2.25 2.25 0 0 1-2.244-2.108L3.75 7.5m3 0V6A2.25 2.25 0 0 1 9 3.75h6A2.25 2.25 0 0 1 17.25 6v1.5m-10.5 0h10.5" />
								</svg>
							</button>
						</div>
					</td>
				</tr>
			`;
		})
		.join("");

	if (isLoading) return;

	emptyState.textContent = "No users found for your current filters.";
	emptyState.classList.toggle("hidden", filteredUsers.length > 0);
}

function renderActivityTable() {
	const activityTableBody = document.getElementById("activityTableBody");
	const emptyState = document.getElementById("emptyState");
	if (!activityTableBody || !emptyState) return;

	const filteredActivities = getFilteredActivities();

	activityTableBody.innerHTML = filteredActivities
		.map((activity) => {
			const iconMarkup = getActivityIconMarkup(activity.category);
			return `
				<tr>
					<td class="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">${activity.timestamp}</td>
					<td class="px-4 py-3 text-sm text-slate-900 font-medium">${activity.name}</td>
					<td class="px-4 py-3 text-sm text-slate-700">${activity.email}</td>
					<td class="px-4 py-3">
						<div class="flex items-start gap-3">
							${iconMarkup}
							<div>
								<p class="text-sm font-medium text-slate-900">${activity.actionType}</p>
								<p class="text-xs text-slate-500 mt-1">${activity.description}</p>
							</div>
						</div>
					</td>
				</tr>
			`;
		})
		.join("");

	if (isLoading) return;

	emptyState.textContent = "No activities found for your current filters.";
	emptyState.classList.toggle("hidden", filteredActivities.length > 0);
}

function renderCurrentView() {
	if (currentView === "users") {
		renderUsersTable();
		return;
	}
	renderActivityTable();
}

function setEditFormValues(user) {
	const editName = document.getElementById("editName");
	const editRole = document.getElementById("editRole");
	const editEmail = document.getElementById("editEmail");
	const editStatus = document.getElementById("editStatus");

	if (!editName || !editRole || !editEmail || !editStatus) return;

	editName.value = user.name;
	editRole.value = user.role;
	editRole.setAttribute("readonly", "readonly");
	editEmail.value = user.email;
	editStatus.value = user.status;
	editStatus.setAttribute("disabled", "disabled");
}

async function loadUsersFromApi() {
	try {
		setLoadingState(true);
		const staffUsers = await fetchOwnerUsers();
		users = staffUsers.map(normalizeUser);
		renderUsersTable();
	} catch (error) {
		if (!handleAuthError(error)) {
			showMessage(error.message || "Failed to load users.");
		}
	} finally {
		setLoadingState(false);
		renderUsersTable();
	}
}

async function loadActivityLogsFromApi() {
	try {
		setLoadingState(true);
		const logs = await fetchOwnerActivityLogs();
		activityLogs = logs.map(normalizeActivity);
		renderActivityTable();
	} catch (error) {
		if (!handleAuthError(error)) {
			showMessage(error.message || "Failed to load activity logs.");
		}
	} finally {
		setLoadingState(false);
		renderActivityTable();
	}
}

async function refreshCurrentViewFromApi() {
	if (currentView === "users") {
		await loadUsersFromApi();
		return;
	}
	await loadActivityLogsFromApi();
}

async function switchView(view) {
	if (view !== "users" && view !== "activity") return;
	currentView = view;

	const userSearchInput = document.getElementById("userSearchInput");
	if (userSearchInput) userSearchInput.value = "";

	renderFilterOptions();
	updateViewControls();
	await refreshCurrentViewFromApi();
}

async function submitPendingEdit() {
	if (!pendingEditUser) return;

	try {
		setLoadingState(true);
		await updateOwnerUser(pendingEditUser.id, {
			name: pendingEditUser.name,
			email: pendingEditUser.email,
		});
		pendingEditUser = null;
		currentEditUserId = null;
		closeModal("confirmSaveModal");
		await loadUsersFromApi();
		showMessage("User updated successfully.");
	} catch (error) {
		if (!handleAuthError(error)) {
			showMessage(error.message || "Failed to update user.");
		}
	} finally {
		setLoadingState(false);
		renderUsersTable();
	}
}

async function submitArchive() {
	if (!pendingArchiveUserId) return;

	const archiveReason = document.getElementById("archiveReason")?.value.trim();
	if (!archiveReason) {
		showMessage("Archive reason is required.");
		closeModal("confirmArchiveModal");
		openModal("archiveModal");
		return;
	}

	try {
		setLoadingState(true);
		await archiveOwnerUser(pendingArchiveUserId, archiveReason);
		pendingArchiveUserId = null;
		closeModal("confirmArchiveModal");
		const reasonInput = document.getElementById("archiveReason");
		if (reasonInput) reasonInput.value = "";
		await loadUsersFromApi();
		showMessage("User archived successfully.");
	} catch (error) {
		if (!handleAuthError(error)) {
			showMessage(error.message || "Failed to archive user.");
		}
	} finally {
		setLoadingState(false);
		renderUsersTable();
	}
}

function bindEvents() {
	const usersTab = document.getElementById("usersTab");
	const activityLogTab = document.getElementById("activityLogTab");
	const userSearchInput = document.getElementById("userSearchInput");
	const statusFilter = document.getElementById("statusFilter");
	const addUserBtn = document.getElementById("addUserBtn");
	const archivedAccountBtn = document.getElementById("archivedAccountBtn");
	const addUserForm = document.getElementById("addUserForm");
	const confirmAddBtn = document.getElementById("confirmAddBtn");
	const editUserForm = document.getElementById("editUserForm");
	const confirmSaveBtn = document.getElementById("confirmSaveBtn");
	const archiveProceedBtn = document.getElementById("archiveProceedBtn");
	const confirmArchiveBtn = document.getElementById("confirmArchiveBtn");
	const tableBody = document.getElementById("userTableBody");

	usersTab?.addEventListener("click", () => {
		switchView("users");
	});

	activityLogTab?.addEventListener("click", () => {
		switchView("activity");
	});

	userSearchInput?.addEventListener("input", renderCurrentView);
	statusFilter?.addEventListener("change", renderCurrentView);

	archivedAccountBtn?.addEventListener("click", () => {
		if (currentView !== "users" || !statusFilter) return;
		statusFilter.value = "Archived";
		renderUsersTable();
	});

	addUserBtn?.addEventListener("click", () => {
		openModal("addUserModal");
	});

	addUserForm?.addEventListener("submit", (event) => {
		event.preventDefault();

		const addName = document.getElementById("addName")?.value.trim();
		const addEmail = document.getElementById("addEmail")?.value.trim();
		const addPassword = document.getElementById("addPassword")?.value;

		if (!addName || !addEmail || !addPassword) {
			showMessage("Name, email, and password are required.");
			return;
		}

		if (addPassword.length < 6) {
			showMessage("Password must be at least 6 characters.");
			return;
		}

		pendingAddUser = {
			name: addName,
			email: addEmail,
			password: addPassword,
		};

		closeModal("addUserModal");
		openModal("confirmAddModal");
	});

	confirmAddBtn?.addEventListener("click", async () => {
		if (!pendingAddUser) return;

		try {
			setLoadingState(true);
			await createOwnerUser(pendingAddUser);
			pendingAddUser = null;
			document.getElementById("addUserForm")?.reset();
			closeModal("confirmAddModal");
			await loadUsersFromApi();
			showMessage("Staff account created successfully.");
		} catch (error) {
			if (!handleAuthError(error)) {
				showMessage(error.message || "Failed to create staff account.");
			}
		} finally {
			setLoadingState(false);
			renderUsersTable();
		}
	});

	tableBody?.addEventListener("click", (event) => {
		if (currentView !== "users") return;

		const editButton = event.target.closest(".edit-user-btn");
		const archiveButton = event.target.closest(".archive-user-btn");

		if (editButton) {
			if (editButton.hasAttribute("disabled")) return;

			const userId = String(editButton.dataset.id || "");
			const user = users.find((item) => String(item.id) === userId);
			if (!user || user.role === "OWNER" || user.status === "Archived") return;

			currentEditUserId = user.id;
			setEditFormValues(user);
			openModal("editUserModal");
			return;
		}

		if (archiveButton) {
			if (archiveButton.hasAttribute("disabled")) return;

			const userId = String(archiveButton.dataset.id || "");
			const user = users.find((item) => String(item.id) === userId);
			if (!user || user.role === "OWNER") {
				showMessage("Owner accounts cannot be archived.");
				return;
			}

			if (user.status === "Archived") {
				showMessage("User is already archived.");
				return;
			}

			pendingArchiveUserId = user.id;
			const archiveUserLabel = document.getElementById("archiveUserLabel");
			if (archiveUserLabel) {
				archiveUserLabel.textContent = `Account: ${user.name}`;
			}
			openModal("archiveModal");
		}
	});

	editUserForm?.addEventListener("submit", (event) => {
		event.preventDefault();
		if (!currentEditUserId) return;

		const editName = document.getElementById("editName")?.value.trim();
		const editEmail = document.getElementById("editEmail")?.value.trim();

		if (!editName || !editEmail) {
			showMessage("Name and email are required.");
			return;
		}

		pendingEditUser = {
			id: currentEditUserId,
			name: editName,
			email: editEmail,
		};

		closeModal("editUserModal");
		openModal("confirmSaveModal");
	});

	confirmSaveBtn?.addEventListener("click", submitPendingEdit);

	archiveProceedBtn?.addEventListener("click", () => {
		closeModal("archiveModal");
		openModal("confirmArchiveModal");
	});

	confirmArchiveBtn?.addEventListener("click", submitArchive);

	document.querySelectorAll("[data-close]").forEach((button) => {
		button.addEventListener("click", () => {
			const modalId = button.getAttribute("data-close");
			if (!modalId) return;

			if (modalId === "confirmAddModal") pendingAddUser = null;
			if (modalId === "confirmSaveModal") pendingEditUser = null;
			if (modalId === "confirmArchiveModal" || modalId === "archiveModal") {
				pendingArchiveUserId = null;
				const archiveReason = document.getElementById("archiveReason");
				if (archiveReason) archiveReason.value = "";
			}

			closeModal(modalId);
		});
	});

	document.querySelectorAll(".fixed.inset-0").forEach((overlay) => {
		overlay.addEventListener("click", (event) => {
			if (event.target === overlay) {
				closeAllModals();
			}
		});
	});
}

export async function initUserManagement() {
	users = [];
	activityLogs = [];
	currentView = "users";
	isLoading = false;
	pendingAddUser = null;
	pendingEditUser = null;
	pendingArchiveUserId = null;
	currentEditUserId = null;

	bindEvents();
	renderFilterOptions();
	updateViewControls();
	await loadUsersFromApi();
}
