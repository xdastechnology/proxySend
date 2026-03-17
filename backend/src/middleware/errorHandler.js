const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
        code: err.code,
      },
      req: {
        method: req.method,
        url: req.url,
        userId: req.session?.userId,
      },
    },
    'Unhandled error'
  );

  // Multer v1 and v2 error codes
  if (
    err.code === 'LIMIT_FILE_SIZE' ||
    err.message?.includes('File too large') ||
    err.message?.includes('LIMIT_FILE_SIZE')
  ) {
    return res.status(413).json({ error: 'File too large' });
  }

  if (
    err.code === 'LIMIT_UNEXPECTED_FILE' ||
    err.message?.includes('Unexpected field')
  ) {
    return res.status(400).json({ error: 'Unexpected file field' });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'Duplicate entry' });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message || 'Internal server error';

  res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;