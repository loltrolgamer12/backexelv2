# Sistema de Inspección Vehicular - Backend API

API REST completa para el Sistema de Inspección Vehicular HQ-FO-40, diseñada para automatizar y centralizar el análisis de inspecciones diarias de vehículos con base de datos PostgreSQL (Neon) y despliegue en Vercel.

## 🚀 Características Principales

- **Carga Anti-Duplicados**: Procesamiento inteligente de archivos Excel con validación de duplicados
- **Dashboard Ejecutivo**: Métricas en tiempo real con análisis automático por estados
- **Control de Fatiga**: Monitoreo avanzado basado en 4 preguntas críticas
- **Análisis de Fallas**: Categorización automática con alertas por criticidad
- **Búsqueda Predictiva**: Búsqueda global instantánea en menos de 300ms
- **Reportes Dinámicos**: Generación de informes personalizables
- **Sistema de Alertas**: Notificaciones automáticas para situaciones críticas

## 🏗️ Arquitectura Técnica

```
├── src/
│   ├── config/
│   │   ├── database.js          # Configuración PostgreSQL + Neon
│   │   └── migrate.js           # Migraciones automáticas
│   ├── middleware/
│   │   └── errorHandler.js      # Manejo centralizado de errores
│   ├── routes/
│   │   ├── upload.js            # Carga de archivos Excel
│   │   ├── dashboard.js         # Métricas y estadísticas
│   │   ├── drivers.js           # Gestión de conductores
│   │   ├── vehicles.js          # Gestión de vehículos
│   │   ├── fatigue.js           # Control de fatiga
│   │   ├── search.js            # Búsqueda predictiva
│   │   ├── reports.js           # Generación de reportes
│   │   └── alerts.js            # Sistema de alertas
│   └── index.js                 # Servidor principal
├── package.json
├── vercel.json                  # Configuración Vercel
└── .env.example
```

## 📦 Instalación y Configuración

### 1. Clonar el Repositorio
```bash
git clone <repository-url>
cd sistema