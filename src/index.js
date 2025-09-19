const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { initDatabase } = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Importar rutas
const uploadRoutes = require('./routes/upload');
const dashboardRoutes = require('./routes/dashboard');
const driversRoutes = require('./routes/drivers');
const vehiclesRoutes = require('./routes/vehicles');
const { fatigueRouter } = require('./routes/fatigue');
const { searchRouter } = require('./routes/search');
const { reportsRouter } = require('./routes/reports');
const { alertsRouter } = require('./routes/alerts');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Demasiadas solicitudes desde esta IP, intente de nuevo más tarde.'
  }
});

// Rate limiting más permisivo para uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 uploads por 15 minutos
  message: {
    error: 'Demasiadas cargas de archivos, intente de nuevo más tarde.'
  }
});

// Middlewares globales
app.use(helmet());
app.use(compression());
app.use(limiter);
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const path = req.path;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  console.log(`${timestamp} - ${method} ${path} - ${userAgent}`);
  
  // Log de queries en desarrollo
  if (process.env.NODE_ENV !== 'production' && Object.keys(req.query).length > 0) {
    console.log(`  Query params:`, req.query);
  }
  
  next();
});

// Health check mejorado
app.get('/health', async (req, res) => {
  try {
    // Verificar conexión a base de datos
    const { query } = require('./config/database');
    await query('SELECT NOW() as timestamp');
    
    res.json({ 
      status: 'OK',
      service: 'Sistema de Inspección Vehicular API',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: 'Connected',
      uptime: process.uptime()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      service: 'Sistema de Inspección Vehicular API',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

// Endpoint de información de la API
app.get('/api', (req, res) => {
  res.json({
    service: 'Sistema de Inspección Vehicular API',
    version: '1.0.0',
    description: 'API REST para el manejo de inspecciones vehiculares con análisis automático',
    endpoints: {
      upload: '/api/upload - Carga de archivos Excel',
      dashboard: '/api/dashboard - Métricas y estadísticas',
      drivers: '/api/drivers - Gestión de conductores',
      vehicles: '/api/vehicles - Gestión de vehículos',
      fatigue: '/api/fatigue - Control de fatiga',
      search: '/api/search - Búsqueda predictiva',
      reports: '/api/reports - Generación de reportes',
      alerts: '/api/alerts - Sistema de alertas'
    },
    documentation: 'Consulte la documentación completa en /api/docs',
    healthCheck: '/health',
    timestamp: new Date().toISOString()
  });
});

// Rutas de la API
app.use('/api/upload', uploadLimiter, uploadRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/drivers', driversRoutes);
app.use('/api/vehicles', vehiclesRoutes);
app.use('/api/fatigue', fatigueRouter);
app.use('/api/search', searchRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/alerts', alertsRouter);

// Endpoint de documentación básica
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'Sistema de Inspección Vehicular - API Documentation',
    version: '1.0.0',
    description: 'API completa para el manejo automatizado de inspecciones vehiculares',
    baseURL: `${req.protocol}://${req.get('host')}/api`,
    endpoints: [
      {
        path: '/upload/validate',
        method: 'POST',
        description: 'Validar archivo Excel antes de insertar',
        parameters: 'multipart/form-data con archivo excel'
      },
      {
        path: '/upload/process',
        method: 'POST', 
        description: 'Procesar e insertar datos del Excel',
        parameters: 'multipart/form-data con archivo excel'
      },
      {
        path: '/upload/months',
        method: 'GET',
        description: 'Obtener meses disponibles en BD'
      },
      {
        path: '/dashboard/metrics',
        method: 'GET',
        description: 'Métricas principales del dashboard'
      },
      {
        path: '/dashboard/charts',
        method: 'GET', 
        description: 'Datos para gráficas del dashboard'
      },
      {
        path: '/drivers/status',
        method: 'GET',
        description: 'Estados de conductores por colores'
      },
      {
        path: '/drivers/list/:status',
        method: 'GET',
        description: 'Lista de conductores por estado (verde/amarillo/rojo)'
      },
      {
        path: '/drivers/:nombre/history',
        method: 'GET',
        description: 'Historial completo de un conductor'
      },
      {
        path: '/drivers/critical',
        method: 'GET',
        description: 'Conductores que requieren atención inmediata'
      },
      {
        path: '/vehicles/status',
        method: 'GET',
        description: 'Estados de vehículos por colores'
      },
      {
        path: '/vehicles/list/:status', 
        method: 'GET',
        description: 'Lista de vehículos por estado'
      },
      {
        path: '/vehicles/:placa/history',
        method: 'GET',
        description: 'Historial completo de un vehículo'
      },
      {
        path: '/vehicles/failures',
        method: 'GET',
        description: 'Análisis de fallas por categorías'
      },
      {
        path: '/fatigue/status',
        method: 'GET',
        description: 'Estados de control de fatiga'
      },
      {
        path: '/fatigue/critical',
        method: 'GET',
        description: 'Conductores con problemas críticos de fatiga'
      },
      {
        path: '/search/predictive',
        method: 'GET',
        description: 'Búsqueda predictiva global',
        parameters: 'q (query), limit (opcional)'
      },
      {
        path: '/search/advanced',
        method: 'GET', 
        description: 'Búsqueda avanzada con filtros múltiples'
      },
      {
        path: '/reports/generate',
        method: 'GET',
        description: 'Generar reportes personalizados',
        parameters: 'mes, año, tipo (completo/fatiga/fallas/conductores)'
      },
      {
        path: '/alerts/active',
        method: 'GET',
        description: 'Alertas activas del sistema'
      }
    ],
    timestamp: new Date().toISOString()
  });
});

// Middleware de manejo de errores
app.use(notFound);
app.use(errorHandler);

// Inicializar base de datos y servidor
async function startServer() {
  try {
    console.log('🚀 Iniciando Sistema de Inspección Vehicular API...');
    
    // Verificar variables de entorno críticas
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL no está configurada');
    }
    
    // Inicializar y migrar base de datos
    await initDatabase();
    console.log('✅ Base de datos inicializada correctamente');
    
    // Solo iniciar servidor en desarrollo (Vercel maneja en producción)
    if (process.env.NODE_ENV !== 'production') {
      app.listen(PORT, () => {
        console.log(`\n🌟 Servidor corriendo en puerto ${PORT}`);
        console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`📊 Health check: http://localhost:${PORT}/health`);
        console.log(`📚 Documentación: http://localhost:${PORT}/api/docs`);
        console.log(`🔧 API Base: http://localhost:${PORT}/api\n`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Manejo de señales de terminación
process.on('SIGTERM', async () => {
  console.log('📴 Recibida señal SIGTERM, cerrando servidor...');
  const { closePool } = require('./config/database');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n📴 Recibida señal SIGINT, cerrando servidor...');
  const { closePool } = require('./config/database');
  await closePool();
  process.exit(0);
});

// Para Vercel en producción
if (process.env.NODE_ENV === 'production') {
  // En producción, Vercel maneja el servidor
  console.log('🌐 Configurando para Vercel...');
  
  // Inicializar base de datos al cargar el módulo
  initDatabase().catch(error => {
    console.error('❌ Error inicializando base de datos en Vercel:', error);
  });
  
  module.exports = app;
} else {
  // En desarrollo, iniciar el servidor normalmente
  startServer();
}