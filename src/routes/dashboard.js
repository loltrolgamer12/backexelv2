const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

// GET /api/dashboard/metrics - Métricas principales del dashboard
router.get('/metrics', async (req, res) => {
  try {
    console.log('📊 Obteniendo métricas del dashboard...');

    // Métricas acumulativas generales
    const metricsQuery = `
      SELECT 
        COUNT(DISTINCT conductor_nombre) as total_conductores,
        COUNT(DISTINCT placa_vehiculo) as total_vehiculos,
        COUNT(*) as total_inspecciones,
        COUNT(DISTINCT CONCAT(año_datos, '-', LPAD(mes_datos::text, 2, '0'))) as meses_cargados,
        MIN(marca_temporal) as primera_inspeccion,
        MAX(marca_temporal) as ultima_inspeccion
      FROM inspecciones
    `;

    const metricsResult = await query(metricsQuery);
    const metrics = metricsResult.rows[0];

    // Estados de conductores
    const conductoresEstadoQuery = `
      SELECT estado, COUNT(*) as cantidad
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

    const conductoresResult = await query(conductoresEstadoQuery);
    const conductoresEstado = {
      verde: 0,
      amarillo: 0,
      rojo: 0
    };
    conductoresResult.rows.forEach(row => {
      conductoresEstado[row.estado] = parseInt(row.cantidad);
    });

    // Estados de vehículos
    const vehiculosEstadoQuery = `
      SELECT estado, COUNT(*) as cantidad
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

    const vehiculosResult = await query(vehiculosEstadoQuery);
    const vehiculosEstado = {
      verde: 0,
      amarillo: 0,
      naranja: 0,
      rojo: 0
    };
    vehiculosResult.rows.forEach(row => {
      vehiculosEstado[row.estado] = parseInt(row.cantidad);
    });

    // Control de fatiga - Estados críticos
    const fatigaQuery = `
      SELECT 
        estado_fatiga,
        COUNT(*) as cantidad
      FROM control_fatiga cf
      JOIN inspecciones i ON cf.inspeccion_id = i.id
      WHERE i.marca_temporal >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY estado_fatiga
      ORDER BY 
        CASE estado_fatiga 
          WHEN 'verde' THEN 1 
          WHEN 'amarillo' THEN 2 
          WHEN 'rojo' THEN 3 
          ELSE 4 
        END
    `;

    const fatigaResult = await query(fatigaQuery);
    const fatigaEstado = {
      verde: 0,
      amarillo: 0,
      rojo: 0
    };
    fatigaResult.rows.forEach(row => {
      fatigaEstado[row.estado_fatiga] = parseInt(row.cantidad);
    });

    // Alertas críticas
    const alertasQuery = `
      SELECT 
        'conductores_criticos' as tipo,
        COUNT(*) as cantidad,
        'Conductores con más de 10 días sin inspección' as descripcion
      FROM conductores_estado 
      WHERE estado = 'rojo' AND dias_sin_inspeccion > 10
      
      UNION ALL
      
      SELECT 
        'vehiculos_criticos' as tipo,
        COUNT(*) as cantidad,
        'Vehículos con fallas críticas múltiples' as descripcion
      FROM vehiculos_estado 
      WHERE estado = 'rojo' AND fallas_criticas > 2
      
      UNION ALL
      
      SELECT 
        'fatiga_critica' as tipo,
        COUNT(*) as cantidad,
        'Conductores con problemas graves de fatiga' as descripcion
      FROM control_fatiga cf
      JOIN inspecciones i ON cf.inspeccion_id = i.id
      WHERE cf.estado_fatiga = 'rojo' 
        AND i.marca_temporal >= CURRENT_DATE - INTERVAL '7 days'
    `;

    const alertasResult = await query(alertasQuery);
    const alertas = alertasResult.rows.reduce((acc, row) => {
      acc[row.tipo] = {
        cantidad: parseInt(row.cantidad),
        descripcion: row.descripcion
      };
      return acc;
    }, {});

    // Estadísticas por mes
    const estadisticasMensualesQuery = `
      SELECT 
        año_datos,
        mes_datos,
        COUNT(*) as total_inspecciones,
        COUNT(DISTINCT conductor_nombre) as conductores_activos,
        COUNT(DISTINCT placa_vehiculo) as vehiculos_inspeccionados
      FROM inspecciones
      WHERE marca_temporal >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY año_datos, mes_datos
      ORDER BY año_datos DESC, mes_datos DESC
      LIMIT 12
    `;

    const estadisticasResult = await query(estadisticasMensualesQuery);
    const estadisticasMensuales = estadisticasResult.rows.map(row => ({
      año: row.año_datos,
      mes: row.mes_datos,
      mesTexto: new Date(row.año_datos, row.mes_datos - 1).toLocaleDateString('es-CO', { 
        month: 'short', 
        year: 'numeric' 
      }),
      totalInspecciones: parseInt(row.total_inspecciones),
      conductoresActivos: parseInt(row.conductores_activos),
      vehiculosInspeccionados: parseInt(row.vehiculos_inspeccionados)
    }));

    // Top elementos con más fallas
    const topFallasQuery = `
      SELECT 
        ei.elemento,
        COUNT(*) as total_fallas,
        SUM(CASE WHEN ei.es_critico THEN 1 ELSE 0 END) as fallas_criticas,
        ROUND(
          (COUNT(*)::numeric / 
           (SELECT COUNT(*) FROM elementos_inspeccion WHERE elemento = ei.elemento)::numeric) * 100, 
          2
        ) as porcentaje_fallas
      FROM elementos_inspeccion ei
      WHERE NOT ei.cumple
        AND EXISTS (
          SELECT 1 FROM inspecciones i 
          WHERE i.id = ei.inspeccion_id 
            AND i.marca_temporal >= CURRENT_DATE - INTERVAL '90 days'
        )
      GROUP BY ei.elemento
      ORDER BY total_fallas DESC
      LIMIT 10
    `;

    const topFallasResult = await query(topFallasQuery);
    const topFallas = topFallasResult.rows.map(row => ({
      elemento: row.elemento,
      totalFallas: parseInt(row.total_fallas),
      fallasCriticas: parseInt(row.fallas_criticas),
      porcentajeFallas: parseFloat(row.porcentaje_fallas)
    }));

    // Calcular KPIs
    const totalConductoresActivos = parseInt(metrics.total_conductores);
    const conductoresCriticos = conductoresEstado.rojo;
    const vehiculosCriticos = vehiculosEstado.rojo;
    const totalVehiculos = parseInt(metrics.total_vehiculos);

    const kpis = {
      cumplimientoConductores: totalConductoresActivos > 0 ? 
        Math.round(((totalConductoresActivos - conductoresCriticos) / totalConductoresActivos) * 100) : 0,
      cumplimientoVehiculos: totalVehiculos > 0 ? 
        Math.round(((totalVehiculos - vehiculosCriticos) / totalVehiculos) * 100) : 0,
      inspeccionesDiarias: Math.round(parseInt(metrics.total_inspecciones) / 30), // Promedio últimos 30 días
      tiempoPromedioInspeccion: 8 // Estimado en minutos
    };

    const response = {
      success: true,
      data: {
        metricas: {
          totalConductores: parseInt(metrics.total_conductores),
          totalVehiculos: parseInt(metrics.total_vehiculos),
          totalInspecciones: parseInt(metrics.total_inspecciones),
          mesesCargados: parseInt(metrics.meses_cargados),
          primeraInspeccion: metrics.primera_inspeccion,
          ultimaInspeccion: metrics.ultima_inspeccion
        },
        estados: {
          conductores: conductoresEstado,
          vehiculos: vehiculosEstado,
          fatiga: fatigaEstado
        },
        alertas,
        kpis,
        estadisticasMensuales,
        topFallas,
        timestamp: new Date().toISOString()
      }
    };

    console.log('✅ Métricas del dashboard obtenidas correctamente');
    res.json(response);

  } catch (error) {
    console.error('Error obteniendo métricas del dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/dashboard/charts - Datos para gráficas del dashboard
router.get('/charts', async (req, res) => {
  try {
    console.log('📈 Obteniendo datos para gráficas...');

    // Evolución temporal de inspecciones (últimos 6 meses)
    const evolucionQuery = `
      SELECT 
        DATE_TRUNC('month', marca_temporal) as mes,
        COUNT(*) as total_inspecciones,
        COUNT(DISTINCT conductor_nombre) as conductores_unicos,
        COUNT(DISTINCT placa_vehiculo) as vehiculos_unicos,
        AVG(CASE WHEN cf.score_fatiga >= 3 THEN 1 ELSE 0 END) * 100 as porcentaje_fatiga_ok
      FROM inspecciones i
      LEFT JOIN control_fatiga cf ON i.id = cf.inspeccion_id
      WHERE marca_temporal >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', marca_temporal)
      ORDER BY mes ASC
    `;

    const evolucionResult = await query(evolucionQuery);
    const evolucionTemporal = evolucionResult.rows.map(row => ({
      mes: row.mes,
      mesTexto: new Date(row.mes).toLocaleDateString('es-CO', { 
        month: 'long', 
        year: 'numeric' 
      }),
      totalInspecciones: parseInt(row.total_inspecciones),
      conductoresUnicos: parseInt(row.conductores_unicos),
      vehiculosUnicos: parseInt(row.vehiculos_unicos),
      porcentajeFatigaOk: Math.round(parseFloat(row.porcentaje_fatiga_ok) || 0)
    }));

    // Distribución de fallas por categoría
    const distribucionFallasQuery = `
      SELECT 
        CASE 
          WHEN ei.elemento LIKE '%LUCES%' OR ei.elemento LIKE '%DIRECCIONAL%' THEN 'Iluminación'
          WHEN ei.elemento LIKE '%FRENO%' OR ei.elemento LIKE '%DIRECCION%' OR ei.elemento LIKE '%SUSPENSION%' THEN 'Sistemas Críticos'
          WHEN ei.elemento LIKE '%LLANTA%' OR ei.elemento LIKE '%PERNO%' THEN 'Neumáticos'
          WHEN ei.elemento LIKE '%FLUIDO%' OR ei.elemento LIKE '%ACEITE%' THEN 'Fluidos'
          WHEN ei.elemento LIKE '%EXTINTOR%' OR ei.elemento LIKE '%BOTIQUIN%' OR ei.elemento LIKE '%DOCUMENTACION%' THEN 'Seguridad/Documentos'
          WHEN ei.elemento LIKE '%ESPEJO%' OR ei.elemento LIKE '%VIDRIO%' OR ei.elemento LIKE '%LIMPIAPARABRISAS%' THEN 'Visibilidad'
          ELSE 'Otros'
        END as categoria,
        COUNT(*) as total_fallas,
        SUM(CASE WHEN ei.es_critico THEN 1 ELSE 0 END) as fallas_criticas
      FROM elementos_inspeccion ei
      JOIN inspecciones i ON ei.inspeccion_id = i.id
      WHERE NOT ei.cumple 
        AND i.marca_temporal >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY categoria
      ORDER BY total_fallas DESC
    `;

    const distribucionResult = await query(distribucionFallasQuery);
    const distribucionFallas = distribucionResult.rows.map(row => ({
      categoria: row.categoria,
      totalFallas: parseInt(row.total_fallas),
      fallasCriticas: parseInt(row.fallas_criticas),
      porcentajeCriticas: row.total_fallas > 0 ? 
        Math.round((parseInt(row.fallas_criticas) / parseInt(row.total_fallas)) * 100) : 0
    }));

    // Mapa de calor de inspecciones por día de la semana y hora
    const mapaCalorQuery = `
      SELECT 
        EXTRACT(DOW FROM marca_temporal) as dia_semana,
        EXTRACT(HOUR FROM marca_temporal) as hora,
        COUNT(*) as total_inspecciones
      FROM inspecciones
      WHERE marca_temporal >= CURRENT_DATE - INTERVAL '60 days'
      GROUP BY EXTRACT(DOW FROM marca_temporal), EXTRACT(HOUR FROM marca_temporal)
      ORDER BY dia_semana, hora
    `;

    const mapaCalorResult = await query(mapaCalorQuery);
    const mapaCalor = mapaCalorResult.rows.map(row => ({
      diaSemana: parseInt(row.dia_semana),
      diaSemanaTexto: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][parseInt(row.dia_semana)],
      hora: parseInt(row.hora),
      totalInspecciones: parseInt(row.total_inspecciones)
    }));

    // Histograma de días sin inspección por conductor
    const histogramaQuery = `
      SELECT 
        CASE 
          WHEN dias_sin_inspeccion <= 1 THEN '0-1 días'
          WHEN dias_sin_inspeccion <= 3 THEN '2-3 días'
          WHEN dias_sin_inspeccion <= 5 THEN '4-5 días'
          WHEN dias_sin_inspeccion <= 7 THEN '6-7 días'
          WHEN dias_sin_inspeccion <= 10 THEN '8-10 días'
          WHEN dias_sin_inspeccion <= 15 THEN '11-15 días'
          ELSE 'Más de 15 días'
        END as rango_dias,
        COUNT(*) as cantidad_conductores
      FROM conductores_estado
      GROUP BY 
        CASE 
          WHEN dias_sin_inspeccion <= 1 THEN '0-1 días'
          WHEN dias_sin_inspeccion <= 3 THEN '2-3 días'
          WHEN dias_sin_inspeccion <= 5 THEN '4-5 días'
          WHEN dias_sin_inspeccion <= 7 THEN '6-7 días'
          WHEN dias_sin_inspeccion <= 10 THEN '8-10 días'
          WHEN dias_sin_inspeccion <= 15 THEN '11-15 días'
          ELSE 'Más de 15 días'
        END,
        CASE 
          WHEN dias_sin_inspeccion <= 1 THEN 1
          WHEN dias_sin_inspeccion <= 3 THEN 2
          WHEN dias_sin_inspeccion <= 5 THEN 3
          WHEN dias_sin_inspeccion <= 7 THEN 4
          WHEN dias_sin_inspeccion <= 10 THEN 5
          WHEN dias_sin_inspeccion <= 15 THEN 6
          ELSE 7
        END
      ORDER BY 
        CASE 
          WHEN dias_sin_inspeccion <= 1 THEN 1
          WHEN dias_sin_inspeccion <= 3 THEN 2
          WHEN dias_sin_inspeccion <= 5 THEN 3
          WHEN dias_sin_inspeccion <= 7 THEN 4
          WHEN dias_sin_inspeccion <= 10 THEN 5
          WHEN dias_sin_inspeccion <= 15 THEN 6
          ELSE 7
        END
    `;

    const histogramaResult = await query(histogramaQuery);
    const histogramaDias = histogramaResult.rows.map(row => ({
      rangoDias: row.rango_dias,
      cantidadConductores: parseInt(row.cantidad_conductores)
    }));

    // Correlación fatiga vs fallas
    const correlacionQuery = `
      SELECT 
        cf.score_fatiga,
        AVG(
          (SELECT COUNT(*) 
           FROM elementos_inspeccion ei 
           WHERE ei.inspeccion_id = i.id AND NOT ei.cumple)
        ) as promedio_fallas_por_inspeccion
      FROM control_fatiga cf
      JOIN inspecciones i ON cf.inspeccion_id = i.id
      WHERE i.marca_temporal >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY cf.score_fatiga
      ORDER BY cf.score_fatiga
    `;

    const correlacionResult = await query(correlacionQuery);
    const correlacionFatigaFallas = correlacionResult.rows.map(row => ({
      scoreFatiga: parseInt(row.score_fatiga),
      promedioFallas: Math.round(parseFloat(row.promedio_fallas_por_inspeccion) * 10) / 10
    }));

    // Top 10 conductores con más inspecciones
    const topConductoresQuery = `
      SELECT 
        conductor_nombre,
        total_inspecciones,
        estado,
        dias_sin_inspeccion,
        campo_coordinacion
      FROM conductores_estado
      ORDER BY total_inspecciones DESC
      LIMIT 10
    `;

    const topConductoresResult = await query(topConductoresQuery);
    const topConductores = topConductoresResult.rows.map(row => ({
      nombre: row.conductor_nombre,
      totalInspecciones: parseInt(row.total_inspecciones),
      estado: row.estado,
      diasSinInspeccion: parseInt(row.dias_sin_inspeccion),
      campoCoordinacion: row.campo_coordinacion
    }));

    // Top 10 vehículos más problemáticos
    const topVehiculosQuery = `
      SELECT 
        placa_vehiculo,
        fallas_criticas,
        fallas_menores,
        total_inspecciones,
        estado,
        ultimo_conductor,
        observaciones_recientes
      FROM vehiculos_estado
      WHERE fallas_criticas > 0 OR fallas_menores > 0
      ORDER BY (fallas_criticas * 3 + fallas_menores) DESC
      LIMIT 10
    `;

    const topVehiculosResult = await query(topVehiculosQuery);
    const topVehiculosProblematicos = topVehiculosResult.rows.map(row => ({
      placa: row.placa_vehiculo,
      fallasCriticas: parseInt(row.fallas_criticas),
      fallasMenores: parseInt(row.fallas_menores),
      totalInspecciones: parseInt(row.total_inspecciones),
      estado: row.estado,
      ultimoConductor: row.ultimo_conductor,
      observacionesRecientes: row.observaciones_recientes
    }));

    const response = {
      success: true,
      data: {
        evolucionTemporal,
        distribucionFallas,
        mapaCalor,
        histogramaDias,
        correlacionFatigaFallas,
        topConductores,
        topVehiculosProblematicos,
        timestamp: new Date().toISOString()
      }
    };

    console.log('✅ Datos para gráficas obtenidos correctamente');
    res.json(response);

  } catch (error) {
    console.error('Error obteniendo datos para gráficas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/dashboard/summary/:period - Resumen por período
router.get('/summary/:period', async (req, res) => {
  try {
    const { period } = req.params; // 'day', 'week', 'month', 'quarter'
    
    let intervalClause;
    let dateFormat;
    
    switch (period) {
      case 'day':
        intervalClause = 'INTERVAL \'24 hours\'';
        dateFormat = 'YYYY-MM-DD HH24:00';
        break;
      case 'week':
        intervalClause = 'INTERVAL \'7 days\'';
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'month':
        intervalClause = 'INTERVAL \'30 days\'';
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'quarter':
        intervalClause = 'INTERVAL \'90 days\'';
        dateFormat = 'YYYY-MM';
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Período inválido. Use: day, week, month, quarter'
        });
    }

    const summaryQuery = `
      SELECT 
        TO_CHAR(marca_temporal, '${dateFormat}') as periodo,
        COUNT(*) as total_inspecciones,
        COUNT(DISTINCT conductor_nombre) as conductores_activos,
        COUNT(DISTINCT placa_vehiculo) as vehiculos_inspeccionados,
        AVG(cf.score_fatiga) as promedio_score_fatiga,
        SUM(CASE WHEN cf.estado_fatiga = 'rojo' THEN 1 ELSE 0 END) as conductores_fatiga_critica,
        COUNT(DISTINCT CASE WHEN ei.es_critico AND NOT ei.cumple THEN i.id ELSE NULL END) as inspecciones_con_fallas_criticas
      FROM inspecciones i
      LEFT JOIN control_fatiga cf ON i.id = cf.inspeccion_id
      LEFT JOIN elementos_inspeccion ei ON i.id = ei.inspeccion_id
      WHERE marca_temporal >= CURRENT_TIMESTAMP - ${intervalClause}
      GROUP BY TO_CHAR(marca_temporal, '${dateFormat}')
      ORDER BY periodo DESC
    `;

    const summaryResult = await query(summaryQuery);
    const summary = summaryResult.rows.map(row => ({
      periodo: row.periodo,
      totalInspecciones: parseInt(row.total_inspecciones),
      conductoresActivos: parseInt(row.conductores_activos),
      vehiculosInspeccionados: parseInt(row.vehiculos_inspeccionados),
      promedioScoreFatiga: Math.round(parseFloat(row.promedio_score_fatiga || 0) * 10) / 10,
      conductoresFatigaCritica: parseInt(row.conductores_fatiga_critica),
      inspeccionesConFallasCriticas: parseInt(row.inspecciones_con_fallas_criticas)
    }));

    res.json({
      success: true,
      data: {
        period,
        summary,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error(`Error obteniendo resumen por ${req.params.period}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;