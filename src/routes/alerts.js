const alertsRouter = express.Router();

// GET /api/alerts/active - Alertas activas del sistema
alertsRouter.get('/active', async (req, res) => {
  try {
    console.log('🚨 Obteniendo alertas activas...');

    // Conductores críticos (>10 días sin inspección)
    const conductoresCriticosQuery = `
      SELECT 
        conductor_nombre,
        dias_sin_inspeccion,
        ultima_inspeccion,
        placa_asignada,
        campo_coordinacion
      FROM conductores_estado
      WHERE estado = 'rojo' AND dias_sin_inspeccion > 10
      ORDER BY dias_sin_inspeccion DESC
      LIMIT 20
    `;

    // Vehículos con fallas críticas
    const vehiculosCriticosQuery = `
      SELECT 
        placa_vehiculo,
        fallas_criticas,
        fallas_menores,
        ultimo_conductor,
        observaciones_recientes,
        ultima_inspeccion
      FROM vehiculos_estado
      WHERE estado IN ('naranja', 'rojo') AND fallas_criticas > 0
      ORDER BY fallas_criticas DESC
      LIMIT 15
    `;

    // Fatiga crítica reciente (últimos 3 días)
    const fatigaCriticaQuery = `
      SELECT 
        i.conductor_nombre,
        i.placa_vehiculo,
        i.marca_temporal,
        cf.score_fatiga,
        cf.dormido_7_horas,
        cf.libre_fatiga,
        cf.condiciones_conducir,
        cf.medicamentos_alerta
      FROM control_fatiga cf
      JOIN inspecciones i ON cf.inspeccion_id = i.id
      WHERE cf.estado_fatiga = 'rojo'
        AND i.marca_temporal >= CURRENT_DATE - INTERVAL '3 days'
      ORDER BY i.marca_temporal DESC
      LIMIT 10
    `;

    // Elementos críticos fallando frecuentemente
    const elementosCriticosQuery = `
      SELECT 
        ei.elemento,
        COUNT(*) as frecuencia_falla,
        COUNT(DISTINCT i.placa_vehiculo) as vehiculos_afectados,
        MAX(i.marca_temporal) as ultima_falla
      FROM elementos_inspeccion ei
      JOIN inspecciones i ON ei.inspeccion_id = i.id
      WHERE NOT ei.cumple 
        AND ei.es_critico
        AND i.marca_temporal >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY ei.elemento
      HAVING COUNT(*) >= 3
      ORDER BY frecuencia_falla DESC
      LIMIT 10
    `;

    const [
      conductoresCriticosResult,
      vehiculosCriticosResult, 
      fatigaCriticaResult,
      elementosCriticosResult
    ] = await Promise.all([
      query(conductoresCriticosQuery),
      query(vehiculosCriticosQuery),
      query(fatigaCriticaQuery),
      query(elementosCriticosQuery)
    ]);

    // Formatear alertas
    const alertas = {
      conductoresCriticos: conductoresCriticosResult.rows.map(row => ({
        tipo: 'CONDUCTOR_CRITICO',
        severidad: row.dias_sin_inspeccion > 15 ? 'URGENTE' : 'ALTA',
        titulo: `Conductor ${row.conductor_nombre} - ${row.dias_sin_inspeccion} días sin inspección`,
        descripcion: `El conductor no ha realizado inspección vehicular desde ${new Date(row.ultima_inspeccion).toLocaleDateString('es-CO')}`,
        datos: {
          conductor: row.conductor_nombre,
          diasSinInspeccion: parseInt(row.dias_sin_inspeccion),
          ultimaInspeccion: row.ultima_inspeccion,
          placaAsignada: row.placa_asignada,
          campoCoordinacion: row.campo_coordinacion
        },
        accionRecomendada: 'Programar inspección inmediata',
        fechaDeteccion: new Date().toISOString()
      })),

      vehiculosCriticos: vehiculosCriticosResult.rows.map(row => ({
        tipo: 'VEHICULO_CRITICO',
        severidad: row.fallas_criticas > 2 ? 'URGENTE' : 'ALTA',
        titulo: `Vehículo ${row.placa_vehiculo} - ${row.fallas_criticas} fallas críticas`,
        descripcion: `El vehículo presenta múltiples fallas críticas que comprometen la seguridad`,
        datos: {
          placa: row.placa_vehiculo,
          fallasCriticas: parseInt(row.fallas_criticas),
          fallasMenores: parseInt(row.fallas_menores),
          ultimoConductor: row.ultimo_conductor,
          observaciones: row.observaciones_recientes,
          ultimaInspeccion: row.ultima_inspeccion
        },
        accionRecomendada: row.fallas_criticas > 2 ? 'Retirar de servicio inmediatamente' : 'Mantenimiento correctivo urgente',
        fechaDeteccion: new Date().toISOString()
      })),

      fatigaCritica: fatigaCriticaResult.rows.map(row => ({
        tipo: 'FATIGA_CRITICA',
        severidad: 'URGENTE',
        titulo: `${row.conductor_nombre} - Estado de fatiga crítico`,
        descripcion: `El conductor presenta condiciones inadecuadas para conducir de forma segura`,
        datos: {
          conductor: row.conductor_nombre,
          placa: row.placa_vehiculo,
          fechaEvaluacion: row.marca_temporal,
          scoreFatiga: parseInt(row.score_fatiga),
          problemas: {
            sueño: !row.dormido_7_horas,
            fatiga: !row.libre_fatiga,
            condiciones: !row.condiciones_conducir,
            medicamentos: row.medicamentos_alerta
          }
        },
        accionRecomendada: 'Suspender actividades de conducción hasta evaluación médica',
        fechaDeteccion: new Date().toISOString()
      })),

      elementosCriticos: elementosCriticosResult.rows.map(row => ({
        tipo: 'ELEMENTO_CRITICO_FRECUENTE',
        severidad: 'MEDIA',
        titulo: `${row.elemento} - Fallas frecuentes`,
        descripcion: `Este elemento crítico está fallando repetidamente en múltiples vehículos`,
        datos: {
          elemento: row.elemento,
          frecuenciaFalla: parseInt(row.frecuencia_falla),
          vehiculosAfectados: parseInt(row.vehiculos_afectados),
          ultimaFalla: row.ultima_falla
        },
        accionRecomendada: 'Revisar procedimientos de mantenimiento preventivo',
        fechaDeteccion: new Date().toISOString()
      }))
    };

    // Contar alertas por severidad
    const todasLasAlertas = [
      ...alertas.conductoresCriticos,
      ...alertas.vehiculosCriticos,
      ...alertas.fatigaCritica,
      ...alertas.elementosCriticos
    ];

    const contadores = {
      total: todasLasAlertas.length,
      urgente: todasLasAlertas.filter(a => a.severidad === 'URGENTE').length,
      alta: todasLasAlertas.filter(a => a.severidad === 'ALTA').length,
      media: todasLasAlertas.filter(a => a.severidad === 'MEDIA').length,
      baja: todasLasAlertas.filter(a => a.severidad === 'BAJA').length
    };

    res.json({
      success: true,
      data: {
        alertas,
        contadores,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error obteniendo alertas activas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/alerts/summary - Resumen de alertas por período
alertsRouter.get('/summary', async (req, res) => {
  try {
    const { periodo = 'semana' } = req.query; // 'dia', 'semana', 'mes'

    let intervalClause;
    switch (periodo) {
      case 'dia':
        intervalClause = 'INTERVAL \'24 hours\'';
        break;
      case 'semana':
        intervalClause = 'INTERVAL \'7 days\'';
        break;
      case 'mes':
        intervalClause = 'INTERVAL \'30 days\'';
        break;
      default:
        intervalClause = 'INTERVAL \'7 days\'';
    }

    console.log(`📈 Generando resumen de alertas - período: ${periodo}`);

    // Nuevos conductores críticos
    const nuevosCriticosQuery = `
      SELECT COUNT(*) as cantidad
      FROM conductores_estado
      WHERE estado = 'rojo' 
        AND dias_sin_inspeccion > 10
        AND ultima_inspeccion >= CURRENT_TIMESTAMP - ${intervalClause}
    `;

    // Nuevos vehículos con fallas críticas
    const nuevosVehiculosFallasQuery = `
      SELECT COUNT(*) as cantidad
      FROM vehiculos_estado
      WHERE fallas_criticas > 0
        AND ultima_inspeccion >= CURRENT_TIMESTAMP - ${intervalClause}
    `;

    // Casos de fatiga crítica
    const fatigaCriticaQuery = `
      SELECT COUNT(*) as cantidad
      FROM control_fatiga cf
      JOIN inspecciones i ON cf.inspeccion_id = i.id
      WHERE cf.estado_fatiga = 'rojo'
        AND i.marca_temporal >= CURRENT_TIMESTAMP - ${intervalClause}
    `;

    // Evolución de alertas por día
    const evolucionQuery = `
      SELECT 
        DATE(marca_temporal) as fecha,
        COUNT(DISTINCT CASE WHEN dias_sin_inspeccion > 10 THEN conductor_nombre END) as conductores_criticos,
        COUNT(DISTINCT CASE WHEN (
          SELECT COUNT(*) FROM elementos_inspeccion ei 
          WHERE ei.inspeccion_id = i.id AND NOT ei.cumple AND ei.es_critico
        ) > 0 THEN placa_vehiculo END) as vehiculos_con_fallas,
        COUNT(CASE WHEN cf.estado_fatiga = 'rojo' THEN 1 END) as casos_fatiga_critica
      FROM inspecciones i
      LEFT JOIN control_fatiga cf ON i.id = cf.inspeccion_id
      LEFT JOIN conductores_estado ce ON i.conductor_nombre = ce.conductor_nombre
      WHERE i.marca_temporal >= CURRENT_TIMESTAMP - ${intervalClause}
      GROUP BY DATE(marca_temporal)
      ORDER BY fecha DESC
    `;

    const [
      nuevosCriticosResult,
      nuevosVehiculosResult,
      fatigaCriticaResult,
      evolucionResult
    ] = await Promise.all([
      query(nuevosCriticosQuery),
      query(nuevosVehiculosFallasQuery),
      query(fatigaCriticaQuery),
      query(evolucionQuery)
    ]);

    const resumen = {
      periodo,
      nuevosEnPeriodo: {
        conductoresCriticos: parseInt(nuevosCriticosResult.rows[0].cantidad),
        vehiculosConFallas: parseInt(nuevosVehiculosResult.rows[0].cantidad),
        casosFatigaCritica: parseInt(fatigaCriticaResult.rows[0].cantidad)
      },
      evolucionDiaria: evolucionResult.rows.map(row => ({
        fecha: row.fecha,
        conductoresCriticos: parseInt(row.conductores_criticos || 0),
        vehiculosConFallas: parseInt(row.vehiculos_con_fallas || 0),
        casosFatigaCritica: parseInt(row.casos_fatiga_critica || 0)
      }))
    };

    res.json({
      success: true,
      data: resumen,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`Error generando resumen de alertas (${req.query.periodo}):`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/alerts/acknowledge - Marcar alerta como vista/resuelta
alertsRouter.post('/acknowledge', async (req, res) => {
  try {
    const { tipo, identificador, accion = 'vista', comentarios = '' } = req.body;

    console.log(`✅ Marcando alerta como ${accion}: ${tipo} - ${identificador}`);

    // En una implementación completa, aquí se guardaría el estado de la alerta
    // Por simplicidad, solo validamos los parámetros y retornamos confirmación

    if (!tipo || !identificador) {
      return res.status(400).json({
        success: false,
        error: 'Tipo e identificador son requeridos'
      });
    }

    const tiposValidos = [
      'CONDUCTOR_CRITICO',
      'VEHICULO_CRITICO', 
      'FATIGA_CRITICA',
      'ELEMENTO_CRITICO_FRECUENTE'
    ];

    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de alerta inválido'
      });
    }

    // Simular guardado en log de alertas
    const logEntry = {
      tipo,
      identificador,
      accion,
      comentarios,
      fechaAccion: new Date().toISOString(),
      usuario: 'sistema' // En implementación real, obtener del token
    };

    res.json({
      success: true,
      data: {
        mensaje: `Alerta marcada como ${accion} exitosamente`,
        logEntry
      }
    });

  } catch (error) {
    console.error('Error marcando alerta:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/alerts/notifications - Configuración de notificaciones
alertsRouter.get('/notifications', async (req, res) => {
  try {
    // Configuración predeterminada de notificaciones
    const configuracion = {
      conductoresCriticos: {
        habilitado: true,
        umbralDias: 10,
        severidad: 'ALTA',
        canales: ['sistema', 'email']
      },
      vehiculosCriticos: {
        habilitado: true,
        umbralFallasCriticas: 1,
        severidad: 'ALTA',
        canales: ['sistema']
      },
      fatigaCritica: {
        habilitado: true,
        scoreMinimo: 2,
        severidad: 'URGENTE',
        canales: ['sistema', 'sms']
      },
      elementosFrecuentes: {
        habilitado: true,
        frecuenciaMinima: 3,
        severidad: 'MEDIA',
        canales: ['sistema']
      }
    };

    res.json({
      success: true,
      data: configuracion,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error obteniendo configuración de notificaciones:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = { reportsRouter, alertsRouter };