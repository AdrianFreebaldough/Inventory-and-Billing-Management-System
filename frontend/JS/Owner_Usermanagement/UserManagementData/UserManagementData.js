const API_BASE_URL = window.IBMS_API_BASE_URL || "http://localhost:3000";
const TOKEN_KEYS = ["token", "authToken", "jwtToken", "ibmsToken"];

const getAuthToken = () => {
	for (const key of TOKEN_KEYS) {
		const token = localStorage.getItem(key);
		if (token && token.trim()) {
			return token.trim();
		}
	}

	return "";
};

const buildQueryString = (query = {}) => {
	const params = new URLSearchParams();

	Object.entries(query).forEach(([key, value]) => {
		if (value === undefined || value === null) return;
		const normalized = String(value).trim();
		if (!normalized) return;
		params.set(key, normalized);
	});

	const asString = params.toString();
	return asString ? `?${asString}` : "";
};

const request = async (path, options = {}) => {
	const token = getAuthToken();

	if (!token) {
		const error = new Error("Authentication token not found. Please log in again.");
		error.status = 401;
		throw error;
	}

	const headers = {
		...(options.headers || {}),
		Authorization: `Bearer ${token}`,
	};

	if (options.body && !headers["Content-Type"]) {
		headers["Content-Type"] = "application/json";
	}

	const response = await fetch(`${API_BASE_URL}${path}`, {
		...options,
		headers,
	});

	const rawText = await response.text();
	let payload = null;

	if (rawText) {
		try {
			payload = JSON.parse(rawText);
		} catch {
			payload = { message: rawText };
		}
	}

	if (!response.ok) {
		const error = new Error(payload?.message || `Request failed (${response.status})`);
		error.status = response.status;
		throw error;
	}

	return payload;
};

export const fetchOwnerUsers = async ({ search = "", status = "" } = {}) => {
	const query = buildQueryString({ search, status });
	const payload = await request(`/api/owner/users${query}`, { method: "GET" });
	return Array.isArray(payload?.data) ? payload.data : [];
};

export const updateOwnerUser = async (userId, { name, email }) => {
	const payload = await request(`/api/owner/users/${userId}`, {
		method: "PUT",
		body: JSON.stringify({ name, email }),
	});

	return payload?.data || null;
};

export const createOwnerUser = async ({ name, email, password }) => {
	const payload = await request("/api/owner/users", {
		method: "POST",
		body: JSON.stringify({ name, email, password }),
	});

	return payload?.data || null;
};

export const archiveOwnerUser = async (userId, archiveReason) => {
	const payload = await request(`/api/owner/users/${userId}/archive`, {
		method: "PUT",
		body: JSON.stringify({ archiveReason }),
	});

	return payload?.data || null;
};

export const fetchOwnerActivityLogs = async ({ search = "", category = "" } = {}) => {
	const query = buildQueryString({ search, category });
	const payload = await request(`/api/owner/activity-logs${query}`, { method: "GET" });
	return Array.isArray(payload?.data) ? payload.data : [];
};
