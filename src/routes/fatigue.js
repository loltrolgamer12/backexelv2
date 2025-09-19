const express = require('express');
const { query } = require('../config/database');

const fatigueRouter = express.Router();

// GET /api/fatigue/status - Estados de control de fatiga
fatigueRouter.get('/status', async (req, res) => {
  try {
    console.log('😴 Obteniendo estados de control de fatiga...');

    // Contadores por estado (últimos 30 días)
    const statusQuery = `
      SELECT 
        cf.estado_fatiga,
        COUNT(*) as cantidad,
        COUNT(DISTINCT i.conductor_nombre) as conductores_unicos
      FROM control_fatiga cf
      JOIN inspecciones i ON cf.inspeccion_id = i.id
      WHERE i.marca_temporal >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY cf.estado_fatiga
      ORDER BY 
        CASE cf.estado_fatiga 
          WHEN 'verde' THEN 1 
          WHEN 'amarillo' THEN 2 
          WHEN 'rojo' THEN 3 
          ELSE 4 
        END
    `;

    const statusResult = await query(statusQuery);
    const estados = {
      verde: { cantidad: 0, conductores: 0 },
      amarillo: { cantidad: 0, conductores: 0 },
      rojo: { cantidad: 0, conductores: 0 }
    };

    statusResult.rows.forEach(row => {
      estados[row.estado_fatiga] = {
        cantidad: parseInt(row.cantidad),
        conductores: parseInt(row.conductores_unicos)
      };
    });

    // Análisis por pregunta específica
    const analisisPreguntasQuery = `
      SELECT 
        SUM(CASE WHEN NOT dormido_7_horas THEN 1 ELSE 0 END) as problemas_sueño,
        SUM(CASE WHEN NOT libre_fatiga THEN 1 ELSE 0 END) as problemas_fatiga,
        SUM(CASE WHEN NOT condiciones_conducir THEN 1 ELSE 0 END) as problemas_condiciones,
        SUM(CASE WHEN medicamentos_alerta THEN 1 ELSE 0 END) as problemas_medicamentos,
        COUNT(*) as total_evaluaciones
      FROM control_fatiga cf
      JOIN inspecciones i ON cf.inspeccion_id = i.id
      WHERE i.marca_temporal >= CURRENT_DATE - INTERVAL '30 days'
    `;

    const analisisResult = await query(analisisPreguntasQuery);
    const analisisPorPregunta = analisisResult.rows[0];

    res.json({
      success: true,
      data: {
        estados,
        analisisPorPregunta: {
          problemasSueño: parseInt(analisisPorPregunta.problemas_sueño),
          problemasFatiga: parseInt(analisisPorPregunta.problemas_fatiga),
          problemasCondiciones: parseInt(analisisPorPregunta.problemas_condiciones),
          problemasMedicamentos: parseInt(analisisPorPregunta.problemas_medicamentos),
          totalEvaluaciones: parseInt(analisisPorPregunta.total_evaluaciones)
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error obteniendo estados de fatiga:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/fatigue/critical - Conductores con problemas críticos de fatiga
fatigueRouter.get('/critical', async (req, res) => {
  try {
    console.log('⚠️ Obteniendo conductores con fatiga crítica...');

    const criticosQuery = `
      SELECT 
        i.conductor_nombre,
        i.placa_vehiculo,
        i.marca_temporal,
        i.campo_coordinacion,
        cf.score_fatiga,
        cf.estado_fatiga,
        cf.dormido_7_horas,
        cf.libre_fatiga,
        cf.condiciones_conducir,
        cf.medicamentos_alerta,
        -- Contar problemas específicos
        (CASE WHEN NOT cf.dormido_7_horas THEN 1 ELSE 0 END +
         CASE WHEN NOT cf.libre_fatiga THEN 1 ELSE 0 END +
         CASE WHEN NOT cf.condiciones_conducir THEN 1 ELSE 0 END +
         CASE WHEN cf.medicamentos_alerta THEN 1 ELSE 0 END) as problemas_totales
      FROM control_fatiga cf
      JOIN inspecciones i ON cf.inspeccion_id = i.id
      WHERE cf.estado_fatiga = 'rojo'
        AND i.marca_temporal >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY i.marca_temporal DESC, problemas_totales DESC
    `;

    const criticosResult = await query(criticosQuery);
    const conductoresCriticos = criticosResult.rows.map(row => ({
      nombre: row.conductor_nombre,
      placa: row.placa_vehiculo,
      fechaEvaluacion: row.marca_temporal,
      campoCoordinacion: row.campo_coordinacion,
      scoreFatiga: parseInt(row.score_fatiga),
      estadoFatiga: row.estado_fatiga,
      problemas: {
        sueñoInsuficiente: !row.dormido_7_horas,
        sintomasFatiga: !row.libre_fatiga,
        condicionesInadecuadas: !row.condiciones_conducir,
        medicamentos: row.medicamentos_alerta
      },
      problemasTotal: parseInt(row.problemas_totales),
      recomendacion: row.problemas_totales >= 3 ? 'SUSPENSIÓN INMEDIATA' : 
                    row.problemas_totales >= 2 ? 'DESCANSO OBLIGATORIO' : 'MONITOREO ESTRECHO'
    }));

    res.json({
      success: true,
      data: {
        conductoresCriticos,
        total: conductoresCriticos.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error obteniendo conductores con fatiga crítica:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/fatigue/trends - Tendencias de fatiga
fatigueRouter.get('/trends', async (req, res) => {
  try {
    console.log('📈 Analizando tendencias de fatiga...');

    // Tendencia semanal
    const tendenciaQuery = `
      SELECT 
        DATE_TRUNC('week', i.marca_temporal) as semana,
        AVG(cf.score_fatiga) as promedio_score,
        COUNT(*) FILTER (WHERE cf.estado_fatiga = 'verde') as casos_verde,
        COUNT(*) FILTER (WHERE cf.estado_fatiga = 'amarillo') as casos_amarillo,
        COUNT(*) FILTER (WHERE cf.estado_fatiga = 'rojo') as casos_rojo,
        COUNT(DISTINCT i.conductor_nombre) as conductores_evaluados
      FROM control_fatiga cf
      JOIN inspecciones i ON cf.inspeccion_id = i.id
      WHERE i.marca_temporal >= CURRENT_DATE - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', i.marca_temporal)
      ORDER BY semana DESC
      LIMIT 12
    `;

    const tendenciaResult = await query(tendenciaQuery);
    const tendenciaSemanal = tendenciaResult.rows.map(row => ({
      semana: row.semana,
      semanaTexto: new Date(row.semana).toLocaleDateString('es-CO', { 
        day: 'numeric',
        month: 'short' 
      }),
      promedioScore: Math.round(parseFloat(row.promedio_score || 0) * 10) / 10,
      casosVerde: parseInt(row.casos_verde),
      casosAmarillo: parseInt(row.casos_amarillo),
      casosRojo: parseInt(row.casos_rojo),
      conductoresEvaluados: parseInt(row.conductores_evaluados)
    })).reverse();

    res.json({
      success: true,
      data: {
        tendenciaSemanal,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error analizando tendencias de fatiga:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = { fatigueRouter };