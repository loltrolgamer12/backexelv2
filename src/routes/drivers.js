const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

// GET /api/drivers/status - Estados de conductores por colores
router.get('/status', async (req, res) => {
  try {
    console.log('👥 Obteniendo estados de conductores...');

    // Contadores por estado
    const statusQuery = `
      SELECT 
        estado,
        COUNT(*) as cantidad
      FROM conductores_estado
      GROUP BY estado
      ORDER BY 
        CASE estado 
          WHEN 'verde' THEN 1 
          WHEN 'amarillo' THEN 2 
          WHEN 'rojo' THEN 3 
          ELSE 4 
        END
    `;

    const statusResult = await query(statusQuery);
    const estados = {
      verde: 0,
      amarillo: 0,
      rojo: 0
    };

    statusResult.rows.forEach(row => {
      estados[row.estado] = parseInt(row.cantidad);
    });

    // Detalles adicionales
    const detallesQuery = `
      SELECT 
        estado,
        AVG(dias_sin_inspeccion) as promedio_dias,
        MAX(dias_sin_inspeccion) as max_dias,
        MIN(dias_sin_inspeccion) as min_dias
      FROM conductores_estado
      GROUP BY estado
    `;

    const detallesResult = await query(detallesQuery);
    const detalles = {};
    
    detallesResult.rows.forEach(row => {
      detalles[row.estado] = {
        promedioDias: Math.round(parseFloat(row.promedio_dias || 0)),
        maxDias: parseInt(row.max_dias || 0),
        minDias: parseInt(row.min_dias || 0)
      };
    });

    res.json({
      success: true,
      data: {
        estados,
        detalles,
        total: Object.values(estados).reduce((sum, count) => sum + count, 0),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error obteniendo estados de conductores:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/drivers/list/:status - Lista de conductores por estado
router.get('/list/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const { page = 1, limit = 20, search = '' } = req.query;

    if (!['verde', 'amarillo', 'rojo'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Estado inválido. Use: verde, amarillo, rojo'
      });
    }

    console.log(`👥 Obteniendo conductores con estado: ${status}`);

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Query principal con filtros
    let whereClause = 'WHERE ce.estado = $1';
    let queryParams = [status];
    let paramIndex = 2;

    if (search.trim()) {
      whereClause += ` AND ce.conductor_nombre ILIKE $${paramIndex}`;
      queryParams.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const conductoresQuery = `
      SELECT 
        ce.conductor_nombre,
        ce.ultima_inspeccion,
        ce.dias_sin_inspeccion,
        ce.estado,
        ce.total_inspecciones,
        ce.placa_asignada,
        ce.campo_coordinacion,
        ce.contrato,
        -- Última fatiga registrada
        (SELECT cf.estado_fatiga 
         FROM control_fatiga cf 
         JOIN inspecciones i ON cf.inspeccion_id = i.id
         WHERE i.conductor_nombre = ce.conductor_nombre
         ORDER BY i.marca_temporal DESC 
         LIMIT 1) as ultimo_estado_fatiga,
        -- Total de fallas en última inspección
        (SELECT COUNT(*) 
         FROM elementos_inspeccion ei
         JOIN inspecciones i ON ei.inspeccion_id = i.id
         WHERE i.conductor_nombre = ce.conductor_nombre
           AND NOT ei.cumple
         ORDER BY i.marca_temporal DESC
         LIMIT 1) as fallas_ultima_inspeccion
      FROM conductores_estado ce
      ${whereClause}
      ORDER BY ce.dias_sin_inspeccion DESC, ce.conductor_nombre ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(parseInt(limit), offset);

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM conductores_estado ce
      ${whereClause}
    `;

    const [conductoresResult, countResult] = await Promise.all([
      query(conductoresQuery, queryParams),
      query(countQuery, queryParams.slice(0, -2)) // Remover limit y offset
    ]);

    const conductores = conductoresResult.rows.map(row => ({
      nombre: row.conductor_nombre,
      ultimaInspeccion: row.ultima_inspeccion,
      diasSinInspeccion: parseInt(row.dias_sin_inspeccion),
      estado: row.estado,
      totalInspecciones: parseInt(row.total_inspecciones),
      placaAsignada: row.placa_asignada,
      campoCoordinacion: row.campo_coordinacion,
      contrato: row.contrato,
      ultimoEstadoFatiga: row.ultimo_estado_fatiga,
      fallasUltimaInspeccion: parseInt(row.fallas_ultima_inspeccion || 0),
      // Calcular prioridad de atención
      prioridad: row.dias_sin_inspeccion > 15 ? 'alta' : 
                row.dias_sin_inspeccion > 10 ? 'media' : 'baja'
    }));

    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: {
        conductores,
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
          search
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error(`Error obteniendo lista de conductores ${req.params.status}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/drivers/:nombre/history - Historial de un conductor específico
router.get('/:nombre/history', async (req, res) => {
  try {
    const { nombre } = req.params;
    const { limit = 50 } = req.query;

    console.log(`📋 Obteniendo historial del conductor: ${nombre}`);

    // Inspecciones del conductor
    const historialQuery = `
      SELECT 
        i.id,
        i.marca_temporal,
        i.placa_vehiculo,
        i.kilometraje,
        i.turno,
        i.observaciones,
        i.campo_coordinacion,
        -- Score de fatiga
        cf.score_fatiga,
        cf.estado_fatiga,
        cf.dormido_7_horas,
        cf.libre_fatiga,
        cf.condiciones_conducir,
        cf.medicamentos_alerta,
        -- Conteo de fallas
        (SELECT COUNT(*) 
         FROM elementos_inspeccion ei 
         WHERE ei.inspeccion_id = i.id AND NOT ei.cumple) as total_fallas,
        (SELECT COUNT(*) 
         FROM elementos_inspeccion ei 
         WHERE ei.inspeccion_id = i.id AND NOT ei.cumple AND ei.es_critico) as fallas_criticas
      FROM inspecciones i
      LEFT JOIN control_fatiga cf ON i.id = cf.inspeccion_id
      WHERE UPPER(i.conductor_nombre) = UPPER($1)
      ORDER BY i.marca_temporal DESC
      LIMIT $2
    `;

    const historialResult = await query(historialQuery, [nombre, parseInt(limit)]);

    if (historialResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conductor no encontrado'
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
      placaVehiculo: row.placa_vehiculo,
      kilometraje: row.kilometraje,
      turno: row.turno,
      observaciones: row.observaciones,
      campoCoordinacion: row.campo_coordinacion,
      controlFatiga: {
        score: parseInt(row.score_fatiga || 0),
        estado: row.estado_fatiga,
        dormido7Horas: row.dormido_7_horas,
        libreFatiga: row.libre_fatiga,
        condicionesConducir: row.condiciones_conducir,
        medicamentosAlerta: row.medicamentos_alerta
      },
      fallas: {
        total: parseInt(row.total_fallas || 0),
        criticas: parseInt(row.fallas_criticas || 0),
        detalle: fallasPorInspeccion[row.id] || []
      }
    }));

    // Estadísticas del conductor
    const estadisticasQuery = `
      SELECT 
        COUNT(*) as total_inspecciones,
        AVG(cf.score_fatiga) as promedio_fatiga,
        SUM(CASE WHEN cf.estado_fatiga = 'rojo' THEN 1 ELSE 0 END) as episodios_fatiga_critica,
        COUNT(DISTINCT i.placa_vehiculo) as vehiculos_conducidos,
        AVG(
          (SELECT COUNT(*) 
           FROM elementos_inspeccion ei 
           WHERE ei.inspeccion_id = i.id AND NOT ei.cumple)
        ) as promedio_fallas_por_inspeccion
      FROM inspecciones i
      LEFT JOIN control_fatiga cf ON i.id = cf.inspeccion_id
      WHERE UPPER(i.conductor_nombre) = UPPER($1)
    `;

    const estadisticasResult = await query(estadisticasQuery, [nombre]);
    const estadisticas = estadisticasResult.rows[0];

    // Tendencia temporal (último mes vs mes anterior)
    const tendenciaQuery = `
      SELECT 
        CASE 
          WHEN i.marca_temporal >= CURRENT_DATE - INTERVAL '30 days' THEN 'ultimo_mes'
          WHEN i.marca_temporal >= CURRENT_DATE - INTERVAL '60 days' THEN 'mes_anterior'
          ELSE 'anterior'
        END as periodo,
        COUNT(*) as inspecciones,
        AVG(cf.score_fatiga) as promedio_fatiga,
        AVG(
          (SELECT COUNT(*) 
           FROM elementos_inspeccion ei 
           WHERE ei.inspeccion_id = i.id AND NOT ei.cumple)
        ) as promedio_fallas
      FROM inspecciones i
      LEFT JOIN control_fatiga cf ON i.id = cf.inspeccion_id
      WHERE UPPER(i.conductor_nombre) = UPPER($1)
        AND i.marca_temporal >= CURRENT_DATE - INTERVAL '60 days'
      GROUP BY periodo
    `;

    const tendenciaResult = await query(tendenciaQuery, [nombre]);
    const tendencia = tendenciaResult.rows.reduce((acc, row) => {
      acc[row.periodo] = {
        inspecciones: parseInt(row.inspecciones),
        promedioFatiga: Math.round(parseFloat(row.promedio_fatiga || 0) * 10) / 10,
        promedioFallas: Math.round(parseFloat(row.promedio_fallas || 0) * 10) / 10
      };
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        conductor: {
          nombre,
          estadisticas: {
            totalInspecciones: parseInt(estadisticas.total_inspecciones),
            promedioFatiga: Math.round(parseFloat(estadisticas.promedio_fatiga || 0) * 10) / 10,
            episodiosFatigaCritica: parseInt(estadisticas.episodios_fatiga_critica || 0),
            vehiculosConducidos: parseInt(estadisticas.vehiculos_conducidos),
            promedioFallasPorInspeccion: Math.round(parseFloat(estadisticas.promedio_fallas_por_inspeccion || 0) * 10) / 10
          },
          tendencia
        },
        historial,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error(`Error obteniendo historial del conductor ${req.params.nombre}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/drivers/critical - Conductores críticos que requieren atención inmediata
router.get('/critical', async (req, res) => {
  try {
    console.log('⚠️ Obteniendo conductores críticos...');

    const criticosQuery = `
      SELECT 
        ce.conductor_nombre,
        ce.dias_sin_inspeccion,
        ce.ultima_inspeccion,
        ce.placa_asignada,
        ce.campo_coordinacion,
        ce.contrato,
        -- Razón de criticidad
        CASE 
          WHEN ce.dias_sin_inspeccion > 15 THEN 'Más de 15 días sin inspección'
          WHEN ce.dias_sin_inspeccion > 10 THEN 'Más de 10 días sin inspección'
          ELSE 'Estado crítico por fatiga'
        END as razon_criticidad,
        -- Última fatiga crítica
        (SELECT cf.estado_fatiga 
         FROM control_fatiga cf 
         JOIN inspecciones i ON cf.inspeccion_id = i.id
         WHERE i.conductor_nombre = ce.conductor_nombre
           AND cf.estado_fatiga = 'rojo'
         ORDER BY i.marca_temporal DESC 
         LIMIT 1) as ultima_fatiga_critica,
        -- Score de riesgo (calculado)
        CASE 
          WHEN ce.dias_sin_inspeccion > 15 THEN 100
          WHEN ce.dias_sin_inspeccion > 10 THEN 80 + ce.dias_sin_inspeccion
          WHEN ce.dias_sin_inspeccion > 7 THEN 60 + ce.dias_sin_inspeccion
          ELSE 40 + ce.dias_sin_inspeccion
        END as score_riesgo
      FROM conductores_estado ce
      WHERE ce.estado = 'rojo' 
         OR ce.dias_sin_inspeccion > 10
         OR EXISTS (
           SELECT 1 FROM control_fatiga cf
           JOIN inspecciones i ON cf.inspeccion_id = i.id
           WHERE i.conductor_nombre = ce.conductor_nombre
             AND cf.estado_fatiga = 'rojo'
             AND i.marca_temporal >= CURRENT_DATE - INTERVAL '7 days'
         )
      ORDER BY score_riesgo DESC, ce.dias_sin_inspeccion DESC
      LIMIT 50
    `;

    const criticosResult = await query(criticosQuery);

    const conductoresCriticos = criticosResult.rows.map(row => ({
      nombre: row.conductor_nombre,
      diasSinInspeccion: parseInt(row.dias_sin_inspeccion),
      ultimaInspeccion: row.ultima_inspeccion,
      placaAsignada: row.placa_asignada,
      campoCoordinacion: row.campo_coordinacion,
      contrato: row.contrato,
      razonCriticidad: row.razon_criticidad,
      ultimaFatigaCritica: row.ultima_fatiga_critica,
      scoreRiesgo: parseInt(row.score_riesgo),
      nivelUrgencia: row.score_riesgo >= 90 ? 'URGENTE' : 
                    row.score_riesgo >= 70 ? 'ALTA' : 
                    row.score_riesgo >= 50 ? 'MEDIA' : 'BAJA',
      diasHastaLimite: Math.max(0, 15 - parseInt(row.dias_sin_inspeccion))
    }));

    // Estadísticas de criticidad
    const estadisticasCriticidad = {
      total: conductoresCriticos.length,
      urgente: conductoresCriticos.filter(c => c.nivelUrgencia === 'URGENTE').length,
      alta: conductoresCriticos.filter(c => c.nivelUrgencia === 'ALTA').length,
      media: conductoresCriticos.filter(c => c.nivelUrgencia === 'MEDIA').length,
      baja: conductoresCriticos.filter(c => c.nivelUrgencia === 'BAJA').length
    };

    res.json({
      success: true,
      data: {
        conductoresCriticos,
        estadisticasCriticidad,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error obteniendo conductores críticos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/drivers/analytics - Análisis avanzado de conductores
router.get('/analytics', async (req, res) => {
  try {
    console.log('📊 Generando análisis avanzado de conductores...');

    // Distribución por campo/coordinación
    const distribucionQuery = `
      SELECT 
        campo_coordinacion,
        COUNT(*) as total_conductores,
        SUM(CASE WHEN estado = 'verde' THEN 1 ELSE 0 END) as conductores_verde,
        SUM(CASE WHEN estado = 'amarillo' THEN 1 ELSE 0 END) as conductores_amarillo,
        SUM(CASE WHEN estado = 'rojo' THEN 1 ELSE 0 END) as conductores_rojo,
        AVG(dias_sin_inspeccion) as promedio_dias_sin_inspeccion,
        AVG(total_inspecciones) as promedio_inspecciones_por_conductor
      FROM conductores_estado
      WHERE campo_coordinacion IS NOT NULL AND campo_coordinacion != ''
      GROUP BY campo_coordinacion
      ORDER BY total_conductores DESC
    `;

    const distribucionResult = await query(distribucionQuery);
    const distribucionPorCampo = distribucionResult.rows.map(row => ({
      campoCoordinacion: row.campo_coordinacion,
      totalConductores: parseInt(row.total_conductores),
      conductoresVerde: parseInt(row.conductores_verde),
      conductoresAmarillo: parseInt(row.conductores_amarillo),
      conductoresRojo: parseInt(row.conductores_rojo),
      promedioDiasSinInspeccion: Math.round(parseFloat(row.promedio_dias_sin_inspeccion)),
      promedioInspeccionesPorConductor: Math.round(parseFloat(row.promedio_inspecciones_por_conductor)),
      porcentajeCumplimiento: Math.round((parseInt(row.conductores_verde) / parseInt(row.total_conductores)) * 100)
    }));

    // Evolución de cumplimiento por semanas
    const evolucionQuery = `
      SELECT 
        DATE_TRUNC('week', marca_temporal) as semana,
        COUNT(DISTINCT conductor_nombre) as conductores_activos,
        COUNT(*) as total_inspecciones,
        AVG(
          EXTRACT(DAY FROM (
            LEAD(marca_temporal) OVER (
              PARTITION BY conductor_nombre 
              ORDER BY marca_temporal
            ) - marca_temporal
          ))
        ) as promedio_dias_entre_inspecciones
      FROM inspecciones
      WHERE marca_temporal >= CURRENT_DATE - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', marca_temporal)
      ORDER BY semana DESC
      LIMIT 12
    `;

    const evolucionResult = await query(evolucionQuery);
    const evolucionCumplimiento = evolucionResult.rows.map(row => ({
      semana: row.semana,
      semanaTexto: new Date(row.semana).toLocaleDateString('es-CO', { 
        day: 'numeric',
        month: 'short' 
      }),
      conductoresActivos: parseInt(row.conductores_activos),
      totalInspecciones: parseInt(row.total_inspecciones),
      promedioDiasEntreInspecciones: Math.round(parseFloat(row.promedio_dias_entre_inspecciones || 0))
    })).reverse();

    // Ranking de conductores más consistentes
    const consistentesQuery = `
      SELECT 
        ce.conductor_nombre,
        ce.total_inspecciones,
        ce.dias_sin_inspeccion,
        -- Calcular consistencia basada en regularidad
        CASE 
          WHEN ce.total_inspecciones >= 20 AND ce.dias_sin_inspeccion <= 3 THEN 'Excelente'
          WHEN ce.total_inspecciones >= 15 AND ce.dias_sin_inspeccion <= 5 THEN 'Muy Bueno'
          WHEN ce.total_inspecciones >= 10 AND ce.dias_sin_inspeccion <= 7 THEN 'Bueno'
          WHEN ce.total_inspecciones >= 5 AND ce.dias_sin_inspeccion <= 10 THEN 'Regular'
          ELSE 'Deficiente'
        END as nivel_consistencia,
        -- Score de consistencia
        (
          (ce.total_inspecciones * 2) + 
          (CASE WHEN ce.dias_sin_inspeccion <= 3 THEN 20
                WHEN ce.dias_sin_inspeccion <= 5 THEN 15
                WHEN ce.dias_sin_inspeccion <= 7 THEN 10
                WHEN ce.dias_sin_inspeccion <= 10 THEN 5
                ELSE 0 END)
        ) as score_consistencia,
        ce.campo_coordinacion
      FROM conductores_estado ce
      WHERE ce.total_inspecciones >= 5
      ORDER BY score_consistencia DESC
      LIMIT 15
    `;

    const consistentesResult = await query(consistentesQuery);
    const conductoresConsistentes = consistentesResult.rows.map(row => ({
      nombre: row.conductor_nombre,
      totalInspecciones: parseInt(row.total_inspecciones),
      diasSinInspeccion: parseInt(row.dias_sin_inspeccion),
      nivelConsistencia: row.nivel_consistencia,
      scoreConsistencia: parseInt(row.score_consistencia),
      campoCoordinacion: row.campo_coordinacion
    }));

    // Patrones de inspección por día de la semana
    const patronesQuery = `
      SELECT 
        EXTRACT(DOW FROM marca_temporal) as dia_semana,
        COUNT(*) as total_inspecciones,
        COUNT(DISTINCT conductor_nombre) as conductores_unicos,
        AVG(
          (SELECT COUNT(*) 
           FROM elementos_inspeccion ei 
           WHERE ei.inspeccion_id = i.id AND NOT ei.cumple)
        ) as promedio_fallas
      FROM inspecciones i
      WHERE marca_temporal >= CURRENT_DATE - INTERVAL '60 days'
      GROUP BY EXTRACT(DOW FROM marca_temporal)
      ORDER BY dia_semana
    `;

    const patronesResult = await query(patronesQuery);
    const patronesPorDia = patronesResult.rows.map(row => ({
      diaSemana: parseInt(row.dia_semana),
      diaSemanaTexto: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][parseInt(row.dia_semana)],
      totalInspecciones: parseInt(row.total_inspecciones),
      conductoresUnicos: parseInt(row.conductores_unicos),
      promedioFallas: Math.round(parseFloat(row.promedio_fallas || 0) * 10) / 10
    }));

    // Predicciones simples basadas en tendencias
    const prediccionesQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE dias_sin_inspeccion BETWEEN 8 AND 10) as proximos_a_vencer_amarillo,
        COUNT(*) FILTER (WHERE dias_sin_inspeccion BETWEEN 11 AND 13) as proximos_a_vencer_rojo,
        COUNT(*) FILTER (WHERE estado = 'verde' AND dias_sin_inspeccion >= 4) as riesgo_pasar_amarillo,
        COUNT(*) FILTER (WHERE estado = 'amarillo' AND dias_sin_inspeccion >= 9) as riesgo_pasar_rojo
      FROM conductores_estado
    `;

    const prediccionesResult = await query(prediccionesQuery);
    const predicciones = {
      proximosAVencerAmarillo: parseInt(prediccionesResult.rows[0].proximos_a_vencer_amarillo),
      proximosAVencerRojo: parseInt(prediccionesResult.rows[0].proximos_a_vencer_rojo),
      riesgoPasarAmarillo: parseInt(prediccionesResult.rows[0].riesgo_pasar_amarillo),
      riesgoPasarRojo: parseInt(prediccionesResult.rows[0].riesgo_pasar_rojo)
    };

    res.json({
      success: true,
      data: {
        distribucionPorCampo,
        evolucionCumplimiento,
        conductoresConsistentes,
        patronesPorDia,
        predicciones,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error generando análisis de conductores:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;