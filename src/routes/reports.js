const express = require('express');
const { query } = require('../config/database');

const reportsRouter = express.Router();

// GET /api/reports/generate - Generar reporte con filtros
reportsRouter.get('/generate', async (req, res) => {
  try {
    const { 
      mes = '', 
      año = '', 
      dia = '', 
      tipo = 'completo',
      conductor = '',
      placa = '',
      campo = '',
      formato = 'json'
    } = req.query;

    console.log(`📊 Generando reporte: ${tipo} - ${año}/${mes}/${dia}`);

    // Validar parámetros
    if (!mes || !año) {
      return res.status(400).json({
        success: false,
        error: 'Mes y año son requeridos'
      });
    }

    // Construir filtros de fecha
    let fechaFiltro = `i.año_datos = $1 AND i.mes_datos = $2`;
    let queryParams = [parseInt(año), parseInt(mes)];
    let paramIndex = 3;

    if (dia) {
      fechaFiltro += ` AND EXTRACT(DAY FROM i.marca_temporal) = $${paramIndex}`;
      queryParams.push(parseInt(dia));
      paramIndex++;
    }

    // Filtros adicionales
    if (conductor.trim()) {
      fechaFiltro += ` AND LOWER(i.conductor_nombre) LIKE $${paramIndex}`;
      queryParams.push(`%${conductor.trim().toLowerCase()}%`);
      paramIndex++;
    }

    if (placa.trim()) {
      fechaFiltro += ` AND LOWER(i.placa_vehiculo) LIKE $${paramIndex}`;
      queryParams.push(`%${placa.trim().toLowerCase()}%`);
      paramIndex++;
    }

    if (campo.trim()) {
      fechaFiltro += ` AND LOWER(i.campo_coordinacion) LIKE $${paramIndex}`;
      queryParams.push(`%${campo.trim().toLowerCase()}%`);
      paramIndex++;
    }

    let reporteData = {};

    // Generar según tipo de reporte
    switch (tipo) {
      case 'completo':
        reporteData = await generarReporteCompleto(fechaFiltro, queryParams);
        break;
      case 'fatiga':
        reporteData = await generarReporteFatiga(fechaFiltro, queryParams);
        break;
      case 'fallas':
        reporteData = await generarReporteFallas(fechaFiltro, queryParams);
        break;
      case 'conductores':
        reporteData = await generarReporteConductores(fechaFiltro, queryParams);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Tipo de reporte inválido'
        });
    }

    const response = {
      success: true,
      data: {
        ...reporteData,
        metadatos: {
          tipo,
          periodo: {
            año: parseInt(año),
            mes: parseInt(mes),
            dia: dia ? parseInt(dia) : null
          },
          filtros: {
            conductor,
            placa,
            campo
          },
          fechaGeneracion: new Date().toISOString(),
          formato
        }
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Error generando reporte:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Función para generar reporte completo
async function generarReporteCompleto(fechaFiltro, queryParams) {
  const resumenQuery = `
    SELECT 
      COUNT(*) as total_inspecciones,
      COUNT(DISTINCT i.conductor_nombre) as total_conductores,
      COUNT(DISTINCT i.placa_vehiculo) as total_vehiculos,
      COUNT(DISTINCT i.campo_coordinacion) as campos_coordinacion,
      AVG(cf.score_fatiga) as promedio_score_fatiga,
      COUNT(*) FILTER (WHERE cf.estado_fatiga = 'rojo') as conductores_fatiga_critica,
      SUM(
        (SELECT COUNT(*) 
         FROM elementos_inspeccion ei 
         WHERE ei.inspeccion_id = i.id AND NOT ei.cumple)
      ) as total_fallas,
      SUM(
        (SELECT COUNT(*) 
         FROM elementos_inspeccion ei 
         WHERE ei.inspeccion_id = i.id AND NOT ei.cumple AND ei.es_critico)
      ) as total_fallas_criticas
    FROM inspecciones i
    LEFT JOIN control_fatiga cf ON i.id = cf.inspeccion_id
    WHERE ${fechaFiltro}
  `;

  const resumenResult = await query(resumenQuery, queryParams);
  const resumen = resumenResult.rows[0];

  // Top conductores por inspecciones
  const topConductoresQuery = `
    SELECT 
      i.conductor_nombre,
      COUNT(*) as total_inspecciones,
      AVG(cf.score_fatiga) as promedio_fatiga,
      SUM(
        (SELECT COUNT(*) 
         FROM elementos_inspeccion ei 
         WHERE ei.inspeccion_id = i.id AND NOT ei.cumple)
      ) as total_fallas
    FROM inspecciones i
    LEFT JOIN control_fatiga cf ON i.id = cf.inspeccion_id
    WHERE ${fechaFiltro}
    GROUP BY i.conductor_nombre
    ORDER BY total_inspecciones DESC
    LIMIT 10
  `;

  const topConductoresResult = await query(topConductoresQuery, queryParams);

  // Top vehículos por fallas
  const topVehiculosQuery = `
    SELECT 
      i.placa_vehiculo,
      COUNT(*) as total_inspecciones,
      SUM(
        (SELECT COUNT(*) 
         FROM elementos_inspeccion ei 
         WHERE ei.inspeccion_id = i.id AND NOT ei.cumple)
      ) as total_fallas,
      MAX(i.conductor_nombre) as ultimo_conductor
    FROM inspecciones i
    WHERE ${fechaFiltro}
    GROUP BY i.placa_vehiculo
    HAVING SUM(
      (SELECT COUNT(*) 
       FROM elementos_inspeccion ei 
       WHERE ei.inspeccion_id = i.id AND NOT ei.cumple)
    ) > 0
    ORDER BY total_fallas DESC
    LIMIT 10
  `;

  const topVehiculosResult = await query(topVehiculosQuery, queryParams);

  return {
    resumen: {
      totalInspecciones: parseInt(resumen.total_inspecciones),
      totalConductores: parseInt(resumen.total_conductores),
      totalVehiculos: parseInt(resumen.total_vehiculos),
      camposCoordinacion: parseInt(resumen.campos_coordinacion),
      promedioScoreFatiga: Math.round(parseFloat(resumen.promedio_score_fatiga || 0) * 10) / 10,
      conductoresFatigaCritica: parseInt(resumen.conductores_fatiga_critica || 0),
      totalFallas: parseInt(resumen.total_fallas || 0),
      totalFallasCriticas: parseInt(resumen.total_fallas_criticas || 0)
    },
    topConductores: topConductoresResult.rows.map(row => ({
      nombre: row.conductor_nombre,
      totalInspecciones: parseInt(row.total_inspecciones),
      promedioFatiga: Math.round(parseFloat(row.promedio_fatiga || 0) * 10) / 10,
      totalFallas: parseInt(row.total_fallas || 0)
    })),
    topVehiculos: topVehiculosResult.rows.map(row => ({
      placa: row.placa_vehiculo,
      totalInspecciones: parseInt(row.total_inspecciones),
      totalFallas: parseInt(row.total_fallas || 0),
      ultimoConductor: row.ultimo_conductor
    }))
  };
}

// Función para generar reporte de fatiga
async function generarReporteFatiga(fechaFiltro, queryParams) {
  const fatigaQuery = `
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
      cf.medicamentos_alerta
    FROM inspecciones i
    JOIN control_fatiga cf ON i.id = cf.inspeccion_id
    WHERE ${fechaFiltro}
    ORDER BY cf.score_fatiga ASC, i.marca_temporal DESC
  `;

  const fatigaResult = await query(fatigaQuery, queryParams);

  const estadisticasQuery = `
    SELECT 
      COUNT(*) as total_evaluaciones,
      AVG(cf.score_fatiga) as promedio_score,
      COUNT(*) FILTER (WHERE cf.estado_fatiga = 'verde') as casos_verde,
      COUNT(*) FILTER (WHERE cf.estado_fatiga = 'amarillo') as casos_amarillo,
      COUNT(*) FILTER (WHERE cf.estado_fatiga = 'rojo') as casos_rojo,
      SUM(CASE WHEN NOT cf.dormido_7_horas THEN 1 ELSE 0 END) as problemas_sueño,
      SUM(CASE WHEN NOT cf.libre_fatiga THEN 1 ELSE 0 END) as problemas_fatiga,
      SUM(CASE WHEN NOT cf.condiciones_conducir THEN 1 ELSE 0 END) as problemas_condiciones,
      SUM(CASE WHEN cf.medicamentos_alerta THEN 1 ELSE 0 END) as problemas_medicamentos
    FROM inspecciones i
    JOIN control_fatiga cf ON i.id = cf.inspeccion_id
    WHERE ${fechaFiltro}
  `;

  const estadisticasResult = await query(estadisticasQuery, queryParams);

  return {
    evaluaciones: fatigaResult.rows.map(row => ({
      conductor: row.conductor_nombre,
      placa: row.placa_vehiculo,
      fecha: row.marca_temporal,
      campoCoordinacion: row.campo_coordinacion,
      scoreFatiga: parseInt(row.score_fatiga),
      estado: row.estado_fatiga,
      problemas: {
        sueño: !row.dormido_7_horas,
        fatiga: !row.libre_fatiga,
        condiciones: !row.condiciones_conducir,
        medicamentos: row.medicamentos_alerta
      }
    })),
    estadisticas: {
      totalEvaluaciones: parseInt(estadisticasResult.rows[0].total_evaluaciones),
      promedioScore: Math.round(parseFloat(estadisticasResult.rows[0].promedio_score || 0) * 10) / 10,
      distribucion: {
        verde: parseInt(estadisticasResult.rows[0].casos_verde),
        amarillo: parseInt(estadisticasResult.rows[0].casos_amarillo),
        rojo: parseInt(estadisticasResult.rows[0].casos_rojo)
      },
      problemasPorTipo: {
        sueño: parseInt(estadisticasResult.rows[0].problemas_sueño),
        fatiga: parseInt(estadisticasResult.rows[0].problemas_fatiga),
        condiciones: parseInt(estadisticasResult.rows[0].problemas_condiciones),
        medicamentos: parseInt(estadisticasResult.rows[0].problemas_medicamentos)
      }
    }
  };
}

// Función para generar reporte de fallas
async function generarReporteFallas(fechaFiltro, queryParams) {
  const fallasQuery = `
    SELECT 
      i.conductor_nombre,
      i.placa_vehiculo,
      i.marca_temporal,
      i.observaciones,
      ei.elemento,
      ei.es_critico
    FROM inspecciones i
    JOIN elementos_inspeccion ei ON i.id = ei.inspeccion_id
    WHERE ${fechaFiltro} AND NOT ei.cumple
    ORDER BY ei.es_critico DESC, i.marca_temporal DESC
  `;

  const fallasResult = await query(fallasQuery, queryParams);

  // Agrupar fallas por elemento
  const fallasPorElemento = {};
  fallasResult.rows.forEach(row => {
    if (!fallasPorElemento[row.elemento]) {
      fallasPorElemento[row.elemento] = {
        elemento: row.elemento,
        esCritico: row.es_critico,
        total: 0,
        vehiculos: new Set(),
        ultimaFecha: null
      };
    }
    fallasPorElemento[row.elemento].total++;
    fallasPorElemento[row.elemento].vehiculos.add(row.placa_vehiculo);
    if (!fallasPorElemento[row.elemento].ultimaFecha || 
        row.marca_temporal > fallasPorElemento[row.elemento].ultimaFecha) {
      fallasPorElemento[row.elemento].ultimaFecha = row.marca_temporal;
    }
  });

  const resumenFallas = Object.values(fallasPorElemento)
    .map(falla => ({
      elemento: falla.elemento,
      esCritico: falla.esCritico,
      totalFallas: falla.total,
      vehiculosAfectados: falla.vehiculos.size,
      ultimaFecha: falla.ultimaFecha
    }))
    .sort((a, b) => b.totalFallas - a.totalFallas);

  return {
    fallas: fallasResult.rows.map(row => ({
      conductor: row.conductor_nombre,
      placa: row.placa_vehiculo,
      fecha: row.marca_temporal,
      elemento: row.elemento,
      esCritico: row.es_critico,
      observaciones: row.observaciones
    })),
    resumenPorElemento: resumenFallas,
    estadisticas: {
      totalFallas: fallasResult.rows.length,
      fallasCriticas: fallasResult.rows.filter(f => f.es_critico).length,
      vehiculosAfectados: new Set(fallasResult.rows.map(f => f.placa_vehiculo)).size,
      elementosConFallas: Object.keys(fallasPorElemento).length
    }
  };
}

// Función para generar reporte de conductores
async function generarReporteConductores(fechaFiltro, queryParams) {
  const conductoresQuery = `
    SELECT 
      i.conductor_nombre,
      COUNT(*) as total_inspecciones,
      COUNT(DISTINCT i.placa_vehiculo) as vehiculos_conducidos,
      MAX(i.marca_temporal) as ultima_inspeccion,
      i.campo_coordinacion,
      i.contrato,
      AVG(cf.score_fatiga) as promedio_fatiga,
      SUM(
        (SELECT COUNT(*) 
         FROM elementos_inspeccion ei 
         WHERE ei.inspeccion_id = i.id AND NOT ei.cumple)
      ) as total_fallas_detectadas
    FROM inspecciones i
    LEFT JOIN control_fatiga cf ON i.id = cf.inspeccion_id
    WHERE ${fechaFiltro}
    GROUP BY i.conductor_nombre, i.campo_coordinacion, i.contrato
    ORDER BY total_inspecciones DESC
  `;

  const conductoresResult = await query(conductoresQuery, queryParams);

  return {
    conductores: conductoresResult.rows.map(row => ({
      nombre: row.conductor_nombre,
      totalInspecciones: parseInt(row.total_inspecciones),
      vehiculosConducidos: parseInt(row.vehiculos_conducidos),
      ultimaInspeccion: row.ultima_inspeccion,
      campoCoordinacion: row.campo_coordinacion,
      contrato: row.contrato,
      promedioFatiga: Math.round(parseFloat(row.promedio_fatiga || 0) * 10) / 10,
      totalFallasDetectadas: parseInt(row.total_fallas_detectadas || 0)
    })),
    estadisticas: {
      totalConductores: conductoresResult.rows.length,
      totalInspecciones: conductoresResult.rows.reduce((sum, c) => sum + parseInt(c.total_inspecciones), 0),
      promedioInspeccionesPorConductor: Math.round(
        conductoresResult.rows.reduce((sum, c) => sum + parseInt(c.total_inspecciones), 0) / 
        conductoresResult.rows.length
      )
    }
  };
}

module.exports = { reportsRouter };
