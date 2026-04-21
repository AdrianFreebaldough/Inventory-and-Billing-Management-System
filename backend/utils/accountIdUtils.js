import User from "../models/user.js";

export const ACCOUNT_ID_PREFIX = "ACC";
export const ACCOUNT_ID_REGEX = /^ACC-\d{4}-\d{4}$/i;

export const normalizeAccountId = (value) => String(value || "").trim().toUpperCase();

export const isValidAccountId = (value) => ACCOUNT_ID_REGEX.test(normalizeAccountId(value));

export const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const buildAccountIdForYear = ({ year, sequence }) => {
  return `${ACCOUNT_ID_PREFIX}-${year}-${String(sequence).padStart(4, "0")}`;
};

export const getNextAvailableAccountId = async ({ year = new Date().getFullYear() } = {}) => {
  const yearString = String(year);
  const pattern = new RegExp(`^${ACCOUNT_ID_PREFIX}-${escapeRegex(yearString)}-(\\d{4})$`, "i");

  const existing = await User.find({
    email: { $regex: pattern },
  })
    .select("email")
    .lean();

  let maxSequence = 0;
  for (const row of existing) {
    const candidate = normalizeAccountId(row?.email);
    const match = candidate.match(pattern);
    if (!match) continue;

    const numeric = Number(match[1]);
    if (Number.isFinite(numeric) && numeric > maxSequence) {
      maxSequence = numeric;
    }
  }

  return buildAccountIdForYear({
    year,
    sequence: maxSequence + 1,
  });
};
