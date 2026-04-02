const sanitizeObjectInPlace = (value) => {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => sanitizeObjectInPlace(item));
    return;
  }

  for (const key of Object.keys(value)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete value[key];
      continue;
    }

    sanitizeObjectInPlace(value[key]);
  }
};

const sanitizeRequest = (req, res, next) => {
  sanitizeObjectInPlace(req.body);
  sanitizeObjectInPlace(req.params);

  // In Express 5, req.query is getter-based, so mutate in-place only.
  if (req.query && typeof req.query === "object") {
    sanitizeObjectInPlace(req.query);
  }

  next();
};

export default sanitizeRequest;