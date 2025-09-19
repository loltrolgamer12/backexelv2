const notFound = (req, res, next) => {
  const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  // Si ya hay un status code, usarlo, sino usar 500
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  // Errores específicos de PostgreSQL
  if (err.code) {
    switch (err.code) {
      case '23505': // duplicate key violation
        statusCode = 409;
        message = 'Registro duplicado detectado';
        break;
      case '23503': // foreign key violation
        statusCode = 400;
        message = 'Referencia inválida en base de datos';
        break;
      case '23502': // not null violation
        statusCode = 400;
        message = 'Campo requerido faltante';
        break;
      case '22001': // string data right truncation
        statusCode = 400;
        message = 'Datos demasiado largos para el campo';
        break;
      case 'ECONNREFUSED':
        statusCode = 503;
        message = 'Error de conexión a la base de datos';
        break;
      default:
        statusCode = 500;
        message = 'Error interno del servidor';
    }
  }

  // Errores de validación
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Error de validación de datos';
  }

  // Errores de JWT (si se implementa autenticación)
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token inválido';
  }

  // Errores de Multer (uploads)
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message = 'Archivo demasiado grande';
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    statusCode = 400;
    message = 'Demasiados archivos';
  }

  // Log del error completo en desarrollo
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      statusCode
    });
  }

  // Respuesta del error
  const response = {
    success: false,
    error: message,
    statusCode,
    timestamp: new Date().toISOString()
  };

  // Incluir stack trace solo en desarrollo
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
    response.details = {
      code: err.code,
      name: err.name,
      originalMessage: err.message
    };
  }

  res.status(statusCode).json(response);
};

// Middleware para validar JSON
const validateJSON = (err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'JSON inválido en la solicitud',
      timestamp: new Date().toISOString()
    });
  }
  next(err);
};

// Middleware para timeout
const timeoutHandler = (timeout = 30000) => {
  return (req, res, next) => {
    res.setTimeout(timeout, () => {
      res.status(408).json({
        success: false,
        error: 'Tiempo de espera agotado',
        timestamp: new Date().toISOString()
      });
    });
    next();
  };
};

module.exports = {
  notFound,
  errorHandler,
  validateJSON,
  timeoutHandler
};