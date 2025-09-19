const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

// GET /api/vehicles/status - Estados de vehículos por colores
router.get('/status', async (req, res) => {
  try {
    console.log('🚗 Obteniendo estados de vehículos...');

    // Contadores por estado
    const statusQuery = `
      SELECT 
        estado,
        COUNT(*) as cantidad,
        SUM(fallas_criticas) as total_fallas_criticas,
        SUM(fallas_menores) as total_fallas_menores
      FROM vehiculos_estado
      GROUP BY estado
      ORDER BY 
        CASE estado 
          WHEN 'verde' THEN 1 
          WHEN 'amarillo' THEN 2 
          WHEN 'naranja' THEN 3
          WHEN 'rojo' THEN 4 
          ELSE 5 
        END
    `;

    const statusResult = await query(statusQuery);
    const estados = {
      verde: { cantidad: 0, fallasCriticas: 0, fallasMenores: 0 },
      amarillo: { cantidad: 0, fallasCriticas: 0, fallasMenores: 0 },
      naranja: { cantidad: 0, fallasCriticas: 0, fallasMenores: 0 },
      rojo: { cantidad: 0, fallasCriticas: 0, fallasMenores: 0 }
    };

    statusResult.rows.forEach(row => {
      estados[row.estado] = {
        cantidad: parseInt(row.cantidad),
        fallasCriticas: parseInt(row.total_fallas_criticas || 0),
        fallasMenores: parseInt(row.total_fallas_menores || 0)
      };
    });

    // Estadísticas adicionales
    const estadisticasQuery = `
      SELECT 
        COUNT(*) as total_vehiculos,
        AVG(total_inspecciones) as promedio_inspecciones,
        COUNT(*) FILTER (WHERE ultima_inspeccion >= CURRENT_DATE - INTERVAL '7 days') as inspeccionados_semana,
        COUNT(*) FILTER (WHERE fallas_criticas > 0) as con_fallas_criticas,
        COUNT(*) FILTER (WHERE observaciones_recientes IS NOT NULL AND observaciones_recientes != '') as con_observaciones
      FROM vehiculos_estado
    `;

    const estadisticasResult = await query(estadisticasQuery);
    const estadisticas = estadisticasResult.rows[0];

    res.json({
      success: true,
      data: {
        estados,
        estadisticas: {
          totalVehiculos: parseInt(estadisticas.total_vehiculos),
          promedioInspecciones: Math.round(parseFloat(estadisticas.promedio_inspecciones || 0)),
          inspeccionadosSemana: parseInt(estadisticas.inspeccionados_semana),
          conFallasCriticas: parseInt(estadisticas.con_fallas_criticas),
          conObservaciones: parseInt(estadisticas.con_observaciones)
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error obteniendo estados de vehículos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/vehicles/list/:status - Lista de vehículos por estado
router.get('/list/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const { page = 1, limit = 20, search = '', campo = '', tipo_falla = '' } = req.query;

    if (!['verde', 'amarillo', 'naranja', 'rojo'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Estado inválido. Use: verde, amarillo, naranja, rojo'
      });
    }

    console.log(`🚗 Obteniendo vehículos con estado: ${status}`);

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Construir query con filtros
    let whereClause = 'WHERE ve.estado = $1';
    let queryParams = [status];
    let paramIndex = 2;

    if (search.trim()) {
      whereClause += ` AND ve.placa_vehiculo ILIKE $${paramIndex}`;
      queryParams.push(`%${search.trim().toUpperCase()}%`);
      paramIndex++;
    }

    if (campo.trim()) {
      whereClause += ` AND ve.campo_coordinacion ILIKE $${paramIndex}`;
      queryParams.push(`%${campo.trim()}%`);
      paramIndex++;
    }

    const vehiculosQuery = `
      SELECT 
        ve.placa_vehiculo,
        ve.ultima_inspeccion,
        ve.ultimo_conductor,
        ve.estado,
        ve.fallas_criticas,
        ve.fallas_menores,
        ve.total_inspecciones,
        ve.observaciones_recientes,
        ve.campo_coordinacion,
        -- Último kilometraje registrado
        (SELECT kilometraje 
         FROM inspecciones i 
         WHERE i.placa_vehiculo = ve.placa_vehiculo 
         ORDER BY i.marca_temporal DESC 
         LIMIT 1) as ultimo_kilometraje,
        -- Días desde última inspección
        EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ve.ultima_inspeccion))::integer as dias_sin_inspeccion
      FROM vehiculos_estado ve
      ${whereClause}
      ORDER BY 
        ve.fallas_criticas DESC, 
        ve.fallas_menores DESC,
        ve.ultima_inspeccion DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(parseInt(limit), offset);

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM vehiculos_estado ve
      ${whereClause}
    `;

    const [vehiculosResult, countResult] = await Promise.all([
      query(vehiculosQuery, queryParams),
      query(countQuery, queryParams.slice(0, -2))
    ]);

    // Obtener fallas específicas para cada vehículo
    const placas = vehiculosResult.rows.map(row => row.placa_vehiculo);
    
    if (placas.length > 0) {
      const fallasEspecificasQuery = `
        SELECT 
          i.placa_vehiculo,
          ei.elemento,
          ei.es_critico,
          i.marca_temporal
        FROM elementos_inspeccion ei
        JOIN inspecciones i ON ei.inspeccion_id = i.id
        WHERE i.placa_vehiculo = ANY($1) 
          AND NOT ei.cumple
          AND i.marca_temporal = (
            SELECT MAX(marca_temporal) 
            FROM inspecciones i2 
            WHERE i2.placa_vehiculo = i.placa_vehiculo
          )
        ORDER BY ei.es_critico DESC, ei.elemento ASC
      `;

      const fallasResult = await query(fallasEspecificasQuery, [placas]);
      
      // Agrupar fallas por vehículo
      const fallasPorVehiculo = {};
      fallasResult.rows.forEach(row => {
        if (!fallasPorVehiculo[row.placa_vehiculo]) {
          fallasPorVehiculo[row.placa_vehiculo] = [];
        }
        fallasPorVehiculo[row.placa_vehiculo].push({
          elemento: row.elemento,
          esCritico: row.es_critico,
          fechaDeteccion: row.marca_temporal
        });
      });

      var vehiculos = vehiculosResult.rows.map(row => ({
        placa: row.placa_vehiculo,
        ultimaInspeccion: row.ultima_inspeccion,
        ultimoConductor: row.ultimo_conductor,
        estado: row.estado,
        fallasCriticas: parseInt(row.fallas_criticas),
        fallasMenores: parseInt(row.fallas_menores),
        totalInspecciones: parseInt(row.total_inspecciones),
        observacionesRecientes: row.observaciones_recientes,
        campoCoordinacion: row.campo_coordinacion,
        ultimoKilometraje: parseInt(row.ultimo_kilometraje || 0),
        diasSinInspeccion: parseInt(row.dias_sin_inspeccion || 0),
        fallasEspecificas: fallasPorVehiculo[row.placa_vehiculo] || [],
        // Calcular prioridad de mantenimiento
        prioridadMantenimiento: row.fallas_criticas > 2 ? 'URGENTE' :
                               row.fallas_criticas > 0 ? 'ALTA' :
                               row.fallas_menores > 3 ? 'MEDIA' : 'BAJA',
        // Estado operativo
        estadoOperativo: row.fallas_criticas > 2 ? 'FUERA_DE_SERVICIO' :
                        row.fallas_criticas > 0 ? 'RESTRICCIONES' : 'OPERATIVO'
      }));
    } else {
      var vehiculos = [];
    }

    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: {
        vehiculos,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
          hasNext: offset + parseInt(limit) < total,
          hasPrev: parseInt(page) > 1
        },
        filters: {
          status,
          search,
          campo,
          tipo_falla
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error(`Error obteniendo lista de vehículos ${req.params.status}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/vehicles/:placa/history - Historial de un vehículo específico
router.get('/:placa/history', async (req, res) => {
  try {
    const { placa } = req.params;
    const { limit = 50 } = req.query;

    console.log(`📋 Obteniendo historial del vehículo: ${placa}`);

    // Inspecciones del vehículo
    const historialQuery = `
      SELECT 
        i.id,
        i.marca_temporal,
        i.conductor_nombre,
        i.kilometraje,
        i.turno,
        i.observaciones,
        i.campo_coordinacion,
        -- Conteo de fallas
        (SELECT COUNT(*) 
         FROM elementos_inspeccion ei 
         WHERE ei.inspeccion_id = i.id AND NOT ei.cumple) as total_fallas,
        (SELECT COUNT(*) 
         FROM elementos_inspeccion ei 
         WHERE ei.inspeccion_id = i.id AND NOT ei.cumple AND ei.es_critico) as fallas_criticas,
        -- Estado de fatiga del conductor
        cf.estado_fatiga,
        cf.score_fatiga
      FROM inspecciones i
      LEFT JOIN control_fatiga cf ON i.id = cf.inspeccion_id
      WHERE UPPER(i.placa_vehiculo) = UPPER($1)
      ORDER BY i.marca_temporal DESC
      LIMIT $2
    `;

    const historialResult = await query(historialQuery, [placa, parseInt(limit)]);

    if (historialResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Vehículo no encontrado'
      });
    }

    // Obtener fallas específicas para cada inspección
    const inspeccionesIds = historialResult.rows.map(row => row.id);
    
    const fallasQuery = `
      SELECT 
        ei.inspeccion_id,
        ei.elemento,
        ei.es_critico
      FROM elementos_inspeccion ei
      WHERE ei.inspeccion_id = ANY($1) AND NOT ei.cumple
      ORDER BY ei.es_critico DESC, ei.elemento ASC
    `;

    const fallasResult = await query(fallasQuery, [inspeccionesIds]);
    
    // Agrupar fallas por inspección
    const fallasPorInspeccion = {};
    fallasResult.rows.forEach(row => {
      if (!fallasPorInspeccion[row.inspeccion_id]) {
        fallasPorInspeccion[row.inspeccion_id] = [];
      }
      fallasPorInspeccion[row.inspeccion_id].push({
        elemento: row.elemento,
        esCritico: row.es_critico
      });
    });

    // Formatear historial
    const historial = historialResult.rows.map(row => ({
      id: row.id,
      fechaInspeccion: row.marca_temporal,
      conductorNombre: row.conductor_nombre,
      kilometraje: row.kilometraje,
      turno: row.turno,
      observaciones: row.observaciones,
      campoCoordinacion: row.campo_coordinacion,
      fallas: {
        total: parseInt(row.total_fallas || 0),
        criticas: parseInt(row.fallas_criticas || 0),
        detalle: fallasPorInspeccion[row.id] || []
      },
      estadoFatigaConductor: row.estado_fatiga,
      scoreFatigaConductor: parseInt(row.score_fatiga || 0)
    }));

    // Estadísticas del vehículo
    const estadisticasQuery = `
      SELECT 
        COUNT(*) as total_inspecciones,
        COUNT(DISTINCT conductor_nombre) as conductores_diferentes,
        AVG(kilometraje) as promedio_kilometraje,
        MAX(kilometraje) - MIN(kilometraje) as diferencia_kilometraje,
        AVG(
          (SELECT COUNT(*) 
           FROM elementos_inspeccion ei 
           WHERE ei.inspeccion_id = i.id AND NOT ei.cumple)
        ) as promedio_fallas_por_inspeccion,
        SUM(
          (SELECT COUNT(*) 
           FROM elementos_inspeccion ei 
           WHERE ei.inspeccion_id = i.id AND NOT ei.cumple AND ei.es_critico)
        ) as total_fallas_criticas_historicas
      FROM inspecciones i
      WHERE UPPER(i.placa_vehiculo) = UPPER($1)
    `;

    const estadisticasResult = await query(estadisticasQuery, [placa]);
    const estadisticas = estadisticasResult.rows[0];

    // Evolución de fallas en el tiempo
    const evolucionFallasQuery = `
      SELECT 
        DATE_TRUNC('week', i.marca_temporal) as semana,
        AVG(
          (SELECT COUNT(*) 
           FROM elementos_inspeccion ei 
           WHERE ei.inspeccion_id = i.id AND NOT ei.cumple)
        ) as promedio_fallas,
        AVG(
          (SELECT COUNT(*) 
           FROM elementos_inspeccion ei 
           WHERE ei.inspeccion_id = i.id AND NOT ei.cumple AND ei.es_critico)
        ) as promedio_fallas_criticas,
        COUNT(*) as inspecciones_semana
      FROM inspecciones i
      WHERE UPPER(i.placa_vehiculo) = UPPER($1)
        AND i.marca_temporal >= CURRENT_DATE - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', i.marca_temporal)
      ORDER BY semana DESC
      LIMIT 12
    `;

    const evolucionResult = await query(evolucionFallasQuery, [placa]);
    const evolucionFallas = evolucionResult.rows.map(row => ({
      semana: row.semana,
      semanaTexto: new Date(row.semana).toLocaleDateString('es-CO', { 
        day: 'numeric',
        month: 'short' 
      }),
      promedioFallas: Math.round(parseFloat(row.promedio_fallas || 0) * 10) / 10,
      promedioFallasCriticas: Math.round(parseFloat(row.promedio_fallas_criticas || 0) * 10) / 10,
      inspeccionesSemana: parseInt(row.inspecciones_semana)
    })).reverse();

    // Top elementos que más fallan en este vehículo
    const topFallasElementosQuery = `
      SELECT 
        ei.elemento,
        COUNT(*) as veces_fallado,
        ei.es_critico,
        MAX(i.marca_temporal) as ultima_falla
      FROM elementos_inspeccion ei
      JOIN inspecciones i ON ei.inspeccion_id = i.id
      WHERE UPPER(i.placa_vehiculo) = UPPER($1) AND NOT ei.cumple
      GROUP BY ei.elemento, ei.es_critico
      ORDER BY veces_fallado DESC, ei.es_critico DESC
      LIMIT 10
    `;

    const topFallasResult = await query(topFallasElementosQuery, [placa]);
    const topFallasElementos = topFallasResult.rows.map(row => ({
      elemento: row.elemento,
      vecesFallado: parseInt(row.veces_fallado),
      esCritico: row.es_critico,
      ultimaFalla: row.ultima_falla
    }));

    res.json({
      success: true,
      data: {
        vehiculo: {
          placa: placa.toUpperCase(),
          estadisticas: {
            totalInspecciones: parseInt(estadisticas.total_inspecciones),
            conductoresDiferentes: parseInt(estadisticas.conductores_diferentes),
            promedioKilometraje: Math.round(parseFloat(estadisticas.promedio_kilometraje || 0)),
            diferenciaKilometraje: parseInt(estadisticas.diferencia_kilometraje || 0),
            promedioFallasPorInspeccion: Math.round(parseFloat(estadisticas.promedio_fallas_por_inspeccion || 0) * 10) / 10,
            totalFallasCriticasHistoricas: parseInt(estadisticas.total_fallas_criticas_historicas || 0)
          },
          evolucionFallas,
          topFallasElementos
        },
        historial,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error(`Error obteniendo historial del vehículo ${req.params.placa}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/vehicles/failures - Análisis de fallas por categorías
router.get('/failures', async (req, res) => {
  try {
    console.log('🔧 Analizando fallas por categorías...');

    // Categorización de fallas por tipo
    const categoriasFallasQuery = `
      SELECT 
        CASE 
          WHEN ei.elemento LIKE '%LUCES%' OR ei.elemento LIKE '%DIRECCIONAL%' THEN 'Sistema de Iluminación'
          WHEN ei.elemento LIKE '%FRENO%' THEN 'Sistema de Frenos'
          WHEN ei.elemento LIKE '%DIRECCION%' OR ei.elemento LIKE '%SUSPENSION%' THEN 'Dirección y Suspensión'
          WHEN ei.elemento LIKE '%LLANTA%' OR ei.elemento LIKE '%PERNO%' THEN 'Neumáticos y Ruedas'
          WHEN ei.elemento LIKE '%FLUIDO%' OR ei.elemento LIKE '%ACEITE%' THEN 'Fluidos y Lubricantes'
          WHEN ei.elemento LIKE '%EXTINTOR%' OR ei.elemento LIKE '%BOTIQUIN%' THEN 'Equipos de Seguridad'
          WHEN ei.elemento LIKE '%ESPEJO%' OR ei.elemento LIKE '%VIDRIO%' THEN 'Visibilidad'
          WHEN ei.elemento LIKE '%DOCUMENTACION%' THEN 'Documentación'
          WHEN ei.elemento LIKE '%CINTURON%' THEN 'Sistemas de Retención'
          ELSE 'Otros'
        END as categoria,
        COUNT(*) as total_fallas,
        SUM(CASE WHEN ei.es_critico THEN 1 ELSE 0 END) as fallas_criticas,
        COUNT(DISTINCT i.placa_vehiculo) as vehiculos_afectados,
        ROUND(
          (COUNT(*)::numeric / 
           (SELECT COUNT(*) FROM elementos_inspeccion WHERE elemento = ei.elemento)::numeric) * 100, 
          2
        ) as porcentaje_fallas
      FROM elementos_inspeccion ei
      JOIN inspecciones i ON ei.inspeccion_id = i.id
      WHERE NOT ei.cumple
        AND i.marca_temporal >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY categoria
      ORDER BY total_fallas DESC
    `;

    const categoriasResult = await query(categoriasFallasQuery);
    const categoriasFallas = categoriasResult.rows.map(row => ({
      categoria: row.categoria,
      totalFallas: parseInt(row.total_fallas),
      fallasCriticas: parseInt(row.fallas_criticas),
      vehiculosAfectados: parseInt(row.vehiculos_afectados),
      porcentajeFallas: parseFloat(row.porcentaje_fallas),
      criticidad: row.fallas_criticas > row.total_fallas * 0.7 ? 'ALTA' : 
                 row.fallas_criticas > row.total_fallas * 0.3 ? 'MEDIA' : 'BAJA'
    }));

    // Top vehículos con más fallas críticas
    const vehiculosCriticosQuery = `
      SELECT 
        i.placa_vehiculo,
        COUNT(*) as total_fallas,
        SUM(CASE WHEN ei.es_critico THEN 1 ELSE 0 END) as fallas_criticas,
        MAX(i.marca_temporal) as ultima_inspeccion,
        MAX(i.conductor_nombre) as ultimo_conductor,
        MAX(i.campo_coordinacion) as campo_coordinacion,
        STRING_AGG(
          CASE WHEN ei.es_critico AND NOT ei.cumple THEN ei.elemento ELSE NULL END, 
          ', ' ORDER BY ei.elemento
        ) as elementos_criticos_fallando
      FROM inspecciones i
      JOIN elementos_inspeccion ei ON i.id = ei.inspeccion_id
      WHERE NOT ei.cumple 
        AND i.marca_temporal >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY i.placa_vehiculo
      HAVING SUM(CASE WHEN ei.es_critico THEN 1 ELSE 0 END) > 0
      ORDER BY fallas_criticas DESC, total_fallas DESC
      LIMIT 15
    `;

    const vehiculosCriticosResult = await query(vehiculosCriticosQuery);
    const vehiculosCriticos = vehiculosCriticosResult.rows.map(row => ({
      placa: row.placa_vehiculo,
      totalFallas: parseInt(row.total_fallas),
      fallasCriticas: parseInt(row.fallas_criticas),
      ultimaInspeccion: row.ultima_inspeccion,
      ultimoConductor: row.ultimo_conductor,
      campoCoordinacion: row.campo_coordinacion,
      elementosCriticosFallando: row.elementos_criticos_fallando?.split(', ').filter(e => e) || [],
      nivelRiesgo: row.fallas_criticas > 3 ? 'CRÍTICO' : 
                  row.fallas_criticas > 1 ? 'ALTO' : 'MEDIO'
    }));

    // Tendencia de fallas en el tiempo
    const tendenciaFallasQuery = `
      SELECT 
        DATE_TRUNC('week', i.marca_temporal) as semana,
        COUNT(*) as total_fallas,
        SUM(CASE WHEN ei.es_critico THEN 1 ELSE 0 END) as fallas_criticas,
        COUNT(DISTINCT i.placa_vehiculo) as vehiculos_con_fallas
      FROM inspecciones i
      JOIN elementos_inspeccion ei ON i.id = ei.inspeccion_id
      WHERE NOT ei.cumple 
        AND i.marca_temporal >= CURRENT_DATE - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', i.marca_temporal)
      ORDER BY semana DESC
      LIMIT 12
    `;

    const tendenciaResult = await query(tendenciaFallasQuery);
    const tendenciaFallas = tendenciaResult.rows.map(row => ({
      semana: row.semana,
      semanaTexto: new Date(row.semana).toLocaleDateString('es-CO', { 
        day: 'numeric',
        month: 'short' 
      }),
      totalFallas: parseInt(row.total_fallas),
      fallasCriticas: parseInt(row.fallas_criticas),
      vehiculosConFallas: parseInt(row.vehiculos_con_fallas)
    })).reverse();

    // Elementos más problemáticos globalmente
    const elementosProblematicosQuery = `
      SELECT 
        ei.elemento,
        COUNT(*) as veces_fallado,
        ei.es_critico,
        COUNT(DISTINCT i.placa_vehiculo) as vehiculos_afectados,
        MAX(i.marca_temporal) as ultima_falla,
        ROUND(
          (COUNT(*)::numeric / 
           NULLIF((SELECT COUNT(*) FROM elementos_inspeccion WHERE elemento = ei.elemento), 0)::numeric) * 100, 
          2
        ) as tasa_falla_porcentaje
      FROM elementos_inspeccion ei
      JOIN inspecciones i ON ei.inspeccion_id = i.id
      WHERE NOT ei.cumple 
        AND i.marca_temporal >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY ei.elemento, ei.es_critico
      ORDER BY veces_fallado DESC
      LIMIT 20
    `;

    const elementosResult = await query(elementosProblematicosQuery);
    const elementosProblematicos = elementosResult.rows.map(row => ({
      elemento: row.elemento,
      vecesFallado: parseInt(row.veces_fallado),
      esCritico: row.es_critico,
      vehiculosAfectados: parseInt(row.vehiculos_afectados),
      ultimaFalla: row.ultima_falla,
      tasaFallaPorcentaje: parseFloat(row.tasa_falla_porcentaje || 0),
      recomendacion: row.es_critico ? 'Inspección inmediata' : 
                    row.veces_fallado > 10 ? 'Revisión programada' : 'Monitorear'
    }));

    res.json({
      success: true,
      data: {
        categoriasFallas,
        vehiculosCriticos,
        tendenciaFallas,
        elementosProblematicos,
        resumen: {
          totalFallasUltimos90Dias: categoriasFallas.reduce((sum, cat) => sum + cat.totalFallas, 0),
          totalFallasCriticas: categoriasFallas.reduce((sum, cat) => sum + cat.fallasCriticas, 0),
          vehiculosConFallas: vehiculosCriticos.length,
          elementosMasProblematicos: elementosProblematicos.slice(0, 5).map(e => e.elemento)
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error analizando fallas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/vehicles/maintenance - Recomendaciones de mantenimiento
router.get('/maintenance', async (req, res) => {
  try {
    console.log('🔧 Generando recomendaciones de mantenimiento...');

    // Vehículos que requieren mantenimiento inmediato
    const mantenimientoInmediatoQuery = `
      SELECT 
        ve.placa_vehiculo,
        ve.fallas_criticas,
        ve.fallas_menores,
        ve.ultima_inspeccion,
        ve.ultimo_conductor,
        ve.observaciones_recientes,
        ve.campo_coordinacion,
        -- Elementos críticos fallando
        (SELECT STRING_AGG(ei.elemento, ', ')
         FROM elementos_inspeccion ei
         JOIN inspecciones i ON ei.inspeccion_id = i.id
         WHERE i.placa_vehiculo = ve.placa_vehiculo
           AND ei.es_critico
           AND NOT ei.cumple
           AND i.marca_temporal = ve.ultima_inspeccion) as elementos_criticos,
        -- Score de urgencia
        (ve.fallas_criticas * 10 + ve.fallas_menores * 2 + 
         EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ve.ultima_inspeccion))) as score_urgencia
      FROM vehiculos_estado ve
      WHERE ve.fallas_criticas > 0 
         OR ve.fallas_menores > 5
         OR EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ve.ultima_inspeccion)) > 30
      ORDER BY score_urgencia DESC
      LIMIT 20
    `;

    const mantenimientoResult = await query(mantenimientoInmediatoQuery);
    const vehiculosMantenimiento = mantenimientoResult.rows.map(row => ({
      placa: row.placa_vehiculo,
      fallasCriticas: parseInt(row.fallas_criticas),
      fallasMenores: parseInt(row.fallas_menores),
      ultimaInspeccion: row.ultima_inspeccion,
      ultimoConductor: row.ultimo_conductor,
      observacionesRecientes: row.observaciones_recientes,
      campoCoordinacion: row.campo_coordinacion,
      elementosCriticos: row.elementos_criticos?.split(', ').filter(e => e) || [],
      scoreUrgencia: parseInt(row.score_urgencia),
      tipoMantenimiento: row.fallas_criticas > 2 ? 'CORRECTIVO_URGENTE' :
                        row.fallas_criticas > 0 ? 'CORRECTIVO' :
                        row.fallas_menores > 5 ? 'PREVENTIVO' : 'REVISION',
      diasSinInspeccion: Math.floor((Date.now() - new Date(row.ultima_inspeccion).getTime()) / (1000 * 60 * 60 * 24))
    }));

    // Programación sugerida de mantenimientos
    const programacionQuery = `
      SELECT 
        ve.campo_coordinacion,
        COUNT(*) FILTER (WHERE ve.fallas_criticas > 2) as urgentes,
        COUNT(*) FILTER (WHERE ve.fallas_criticas > 0 AND ve.fallas_criticas <= 2) as altas,
        COUNT(*) FILTER (WHERE ve.fallas_menores > 3) as medias,
        COUNT(*) FILTER (WHERE EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ve.ultima_inspeccion)) > 30) as revision_general
      FROM vehiculos_estado ve
      WHERE ve.campo_coordinacion IS NOT NULL
      GROUP BY ve.campo_coordinacion
      ORDER BY urgentes DESC, altas DESC
    `;

    const programacionResult = await query(programacionQuery);
    const programacionPorCampo = programacionResult.rows.map(row => ({
      campoCoordinacion: row.campo_coordinacion,
      urgentes: parseInt(row.urgentes),
      altas: parseInt(row.altas),
      medias: parseInt(row.medias),
      revisionGeneral: parseInt(row.revision_general),
      totalVehiculos: parseInt(row.urgentes) + parseInt(row.altas) + parseInt(row.medias) + parseInt(row.revision_general)
    }));

    // Patrones de fallas para mantenimiento predictivo
    const patronesFallasQuery = `
      SELECT 
        ei.elemento,
        AVG(i.kilometraje) as kilometraje_promedio_falla,
        COUNT(*) as frecuencia_falla,
        AVG(
          EXTRACT(DAY FROM (
            i.marca_temporal - 
            LAG(i.marca_temporal) OVER (PARTITION BY i.placa_vehiculo ORDER BY i.marca_temporal)
          ))
        ) as dias_promedio_entre_fallas
      FROM elementos_inspeccion ei
      JOIN inspecciones i ON ei.inspeccion_id = i.id
      WHERE NOT ei.cumple 
        AND ei.es_critico
        AND i.marca_temporal >= CURRENT_DATE - INTERVAL '180 days'
      GROUP BY ei.elemento
      HAVING COUNT(*) >= 5
      ORDER BY frecuencia_falla DESC
      LIMIT 15
    `;

    const patronesResult = await query(patronesFallasQuery);
    const patronesMantenimiento = patronesResult.rows.map(row => ({
      elemento: row.elemento,
      kilometrajePromedioFalla: Math.round(parseFloat(row.kilometraje_promedio_falla || 0)),
      frecuenciaFalla: parseInt(row.frecuencia_falla),
      diasPromedioEntreFallas: Math.round(parseFloat(row.dias_promedio_entre_fallas || 0)),
      recomendacionMantenimiento: `Revisar cada ${Math.round(parseFloat(row.dias_promedio_entre_fallas || 30) * 0.7)} días`
    }));

    // Costos estimados (simulados basados en criticidad)
    const costosEstimados = vehiculosMantenimiento.map(vehiculo => ({
      placa: vehiculo.placa,
      costoEstimado: vehiculo.tipoMantenimiento === 'CORRECTIVO_URGENTE' ? 
        Math.round(vehiculo.fallasCriticas * 150000 + vehiculo.fallasMenores * 50000) :
        vehiculo.tipoMantenimiento === 'CORRECTIVO' ?
        Math.round(vehiculo.fallasCriticas * 100000 + vehiculo.fallasMenores * 40000) :
        Math.round(vehiculo.fallasMenores * 30000 + 80000), // Preventivo base
      monedaDisplay: 'COP'
    }));

    res.json({
      success: true,
      data: {
        vehiculosMantenimiento,
        programacionPorCampo,
        patronesMantenimiento,
        costosEstimados,
        resumen: {
          totalVehiculosMantenimiento: vehiculosMantenimiento.length,
          urgentes: vehiculosMantenimiento.filter(v => v.tipoMantenimiento === 'CORRECTIVO_URGENTE').length,
          correctivos: vehiculosMantenimiento.filter(v => v.tipoMantenimiento === 'CORRECTIVO').length,
          preventivos: vehiculosMantenimiento.filter(v => v.tipoMantenimiento === 'PREVENTIVO').length,
          costoTotalEstimado: costosEstimados.reduce((sum, c) => sum + c.costoEstimado, 0)
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error generando recomendaciones de mantenimiento:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;