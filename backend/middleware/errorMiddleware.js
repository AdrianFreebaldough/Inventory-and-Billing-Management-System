import logger from "../utils/logger.js";

export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

export const globalErrorHandler = (err, req, res, next) => {
  const statusCode = Number(err?.statusCode || err?.status || 500);
  const safeStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500;

  logger.error("Request failed", {
    method: req.method,
    path: req.originalUrl,
    statusCode: safeStatus,
    errorMessage: err?.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "production" ? undefined : err?.stack,
  });

  res.status(safeStatus).json({
    message: safeStatus === 500 ? "Internal server error" : err?.message,
  });
};