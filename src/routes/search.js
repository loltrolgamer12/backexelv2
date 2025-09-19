const express = require('express');
const searchRouter = express.Router();

// GET /api/search/predictive - Búsqueda predictiva global
searchRouter.get('/predictive', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        data: {
          resultados: [],
          mensaje: 'Ingrese al menos 2 caracteres para buscar'
        }
      });
    }

    console.log(`🔍 Búsqueda predictiva: "${q}"`);

    const searchTerm = `%${q.trim().toLowerCase()}%`;
    const limitNum = Math.min(parseInt(limit), 50);

    // Búsqueda en conductores
    const conductoresQuery = `
      SELECT 
        'conductor' as tipo,
        conductor_nombre as nombre,
        placa_asignada as detalle_1,
        campo_coordinacion as detalle_2,
        estado as estado,
        ultima_inspeccion as fecha,
        dias_sin_inspeccion as valor_numerico
      FROM conductores_estado
      WHERE LOWER(conductor_nombre) LIKE $1
      ORDER BY 
        CASE WHEN LOWER(conductor_nombre) LIKE $2 THEN 1 ELSE 2 END,
        conductor_nombre
      LIMIT $3
    `;

    // Búsqueda en placas de vehículos
    const vehiculosQuery = `
      SELECT 
        'vehiculo' as tipo,
        placa_vehiculo as nombre,
        ultimo_conductor as detalle_1,
        campo_coordinacion as detalle_2,
        estado as estado,
        ultima_inspeccion as fecha,
        (fallas_criticas + fallas_menores) as valor_numerico
      FROM vehiculos_estado
      WHERE LOWER(placa_vehiculo) LIKE $1
      ORDER BY 
        CASE WHEN LOWER(placa_vehiculo) LIKE $2 THEN 1 ELSE 2 END,
        placa_vehiculo
      LIMIT $3
    `;

    // Búsqueda en observaciones
    const observacionesQuery = `
      SELECT DISTINCT
        'observacion' as tipo,
        CONCAT(conductor_nombre, ' - ', placa_vehiculo) as nombre,
        LEFT(observaciones, 100) as detalle_1,
        TO_CHAR(marca_temporal, 'DD/MM/YYYY') as detalle_2,
        'info' as estado,
        marca_temporal as fecha,
        0 as valor_numerico
      FROM inspecciones
      WHERE LOWER(observaciones) LIKE $1 
        AND observaciones IS NOT NULL 
        AND observaciones != ''
      ORDER BY marca_temporal DESC
      LIMIT $3
    `;

    const exactSearchTerm = `${q.trim().toLowerCase()}%`; // Para coincidencias exactas al inicio

    const [conductoresResult, vehiculosResult, observacionesResult] = await Promise.all([
      query(conductoresQuery, [searchTerm, exactSearchTerm, limitNum]),
      query(vehiculosQuery, [searchTerm, exactSearchTerm, limitNum]),
      query(observacionesQuery, [searchTerm, limitNum])
    ]);

    // Combinar y formatear resultados
    const resultados = [
      ...conductoresResult.rows,
      ...vehiculosResult.rows,
      ...observacionesResult.rows
    ].map(row => ({
      tipo: row.tipo,
      nombre: row.nombre,
      detalle1: row.detalle_1,
      detalle2: row.detalle_2,
      estado: row.estado,
      fecha: row.fecha,
      valorNumerico: parseInt(row.valor_numerico || 0),
      // Calcular relevancia para ordenamiento
      relevancia: row.nombre?.toLowerCase().startsWith(q.trim().toLowerCase()) ? 100 : 50
    }));

    // Ordenar por relevancia y tipo
    const resultadosOrdenados = resultados
      .sort((a, b) => {
        if (a.relevancia !== b.relevancia) return b.relevancia - a.relevancia;
        if (a.tipo !== b.tipo) {
          const orden = { conductor: 1, vehiculo: 2, observacion: 3 };
          return orden[a.tipo] - orden[b.tipo];
        }
        return a.nombre.localeCompare(b.nombre);
      })
      .slice(0, limitNum);

    // Estadísticas de resultados
    const estadisticas = {
      total: resultadosOrdenados.length,
      porTipo: {
        conductores: resultadosOrdenados.filter(r => r.tipo === 'conductor').length,
        vehiculos: resultadosOrdenados.filter(r => r.tipo === 'vehiculo').length,
        observaciones: resultadosOrdenados.filter(r => r.tipo === 'observacion').length
      }
    };

    res.json({
      success: true,
      data: {
        resultados: resultadosOrdenados,
        estadisticas,
        consulta: q.trim(),
        tiempoBusqueda: Date.now() // Placeholder para tiempo de búsqueda
      }
    });

  } catch (error) {
    console.error('Error en búsqueda predictiva:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/search/advanced - Búsqueda avanzada con filtros
searchRouter.get('/advanced', async (req, res) => {
  try {
    const { 
      q = '', 
      tipo = 'todos', 
      campo = '', 
      fecha_desde = '', 
      fecha_hasta = '',
      estado = '',
      page = 1,
      limit = 20 
    } = req.query;

    console.log('🔍 Búsqueda avanzada con filtros');

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    // Construir query base según el tipo
    let baseQuery = '';
    let countQuery = '';

    if (tipo === 'conductores' || tipo === 'todos') {
      // Query para conductores
      baseQuery = `
        SELECT 
          'conductor' as tipo,
          ce.conductor_nombre as nombre,
          ce.placa_asignada as detalle_1,
          ce.campo_coordinacion as detalle_2,
          ce.estado as estado,
          ce.ultima_inspeccion as fecha,
          ce.dias_sin_inspeccion as valor_numerico,
          ce.total_inspecciones as extra_info
        FROM conductores_estado ce
        WHERE 1=1
      `;
    }

    if (tipo === 'vehiculos' || tipo === 'todos') {
      if (baseQuery) baseQuery += ' UNION ALL ';
      baseQuery += `
        SELECT 
          'vehiculo' as tipo,
          ve.placa_vehiculo as nombre,
          ve.ultimo_conductor as detalle_1,
          ve.campo_coordinacion as detalle_2,
          ve.estado as estado,
          ve.ultima_inspeccion as fecha,
          (ve.fallas_criticas + ve.fallas_menores) as valor_numerico,
          ve.total_inspecciones as extra_info
        FROM vehiculos_estado ve
        WHERE 1=1
      `;
    }

    if (tipo === 'inspecciones' || tipo === 'todos') {
      if (baseQuery) baseQuery += ' UNION ALL ';
      baseQuery += `
        SELECT 
          'inspeccion' as tipo,
          CONCAT(i.conductor_nombre, ' - ', i.placa_vehiculo) as nombre,
          LEFT(i.observaciones, 100) as detalle_1,
          i.campo_coordinacion as detalle_2,
          'info' as estado,
          i.marca_temporal as fecha,
          i.kilometraje as valor_numerico,
          1 as extra_info
        FROM inspecciones i
        WHERE 1=1
      `;
    }

    // Aplicar filtros comunes
    if (q.trim()) {
      if (tipo === 'conductores') {
        whereConditions.push(`LOWER(ce.conductor_nombre) LIKE ${paramIndex}`);
      } else if (tipo === 'vehiculos') {
        whereConditions.push(`LOWER(ve.placa_vehiculo) LIKE ${paramIndex}`);
      } else if (tipo === 'inspecciones') {
        whereConditions.push(`(LOWER(i.conductor_nombre) LIKE ${paramIndex} OR LOWER(i.placa_vehiculo) LIKE ${paramIndex} OR LOWER(i.observaciones) LIKE ${paramIndex})`);
      } else {
        // Para 'todos', necesitamos ajustar la consulta
        baseQuery = `
          SELECT * FROM (${baseQuery}) combined_results
          WHERE LOWER(nombre) LIKE ${paramIndex} OR LOWER(detalle_1) LIKE ${paramIndex}
        `;
      }
      queryParams.push(`%${q.trim().toLowerCase()}%`);
      paramIndex++;
    }

    if (campo.trim()) {
      if (tipo !== 'todos') {
        whereConditions.push(`campo_coordinacion ILIKE ${paramIndex}`);
      } else {
        baseQuery += ` AND LOWER(detalle_2) LIKE ${paramIndex}`;
      }
      queryParams.push(`%${campo.trim()}%`);
      paramIndex++;
    }

    if (estado.trim() && estado !== 'todos') {
      if (tipo !== 'todos') {
        whereConditions.push(`estado = ${paramIndex}`);
      } else {
        baseQuery += ` AND estado = ${paramIndex}`;
      }
      queryParams.push(estado);
      paramIndex++;
    }

    if (fecha_desde.trim()) {
      if (tipo !== 'todos') {
        whereConditions.push(`fecha >= ${paramIndex}`);
      } else {
        baseQuery += ` AND fecha >= ${paramIndex}`;
      }
      queryParams.push(fecha_desde);
      paramIndex++;
    }

    if (fecha_hasta.trim()) {
      if (tipo !== 'todos') {
        whereConditions.push(`fecha <= ${paramIndex}`);
      } else {
        baseQuery += ` AND fecha <= ${paramIndex}`;
      }
      queryParams.push(fecha_hasta);
      paramIndex++;
    }

    // Agregar condiciones WHERE si es necesario
    if (whereConditions.length > 0 && tipo !== 'todos') {
      baseQuery += ' AND ' + whereConditions.join(' AND ');
    }

    // Finalizar query
    const finalQuery = `
      SELECT * FROM (${baseQuery}) final_results
      ORDER BY 
        CASE WHEN LOWER(nombre) LIKE ${paramIndex} THEN 1 ELSE 2 END,
        fecha DESC,
        nombre ASC
      LIMIT ${paramIndex + 1} OFFSET ${paramIndex + 2}
    `;

    queryParams.push(`${q.trim().toLowerCase()}%`, parseInt(limit), offset);

    // Ejecutar búsqueda
    const searchResult = await query(finalQuery, queryParams);
    
    // Query para contar total (simplificada)
    const countFinalQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) count_results`;
    const countResult = await query(countFinalQuery, queryParams.slice(0, -2));

    const resultados = searchResult.rows.map(row => ({
      tipo: row.tipo,
      nombre: row.nombre,
      detalle1: row.detalle_1,
      detalle2: row.detalle_2,
      estado: row.estado,
      fecha: row.fecha,
      valorNumerico: parseInt(row.valor_numerico || 0),
      extraInfo: parseInt(row.extra_info || 0)
    }));

    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: {
        resultados,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
          hasNext: offset + parseInt(limit) < total,
          hasPrev: parseInt(page) > 1
        },
        filtros: {
          consulta: q,
          tipo,
          campo,
          fechaDesde: fecha_desde,
          fechaHasta: fecha_hasta,
          estado
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error en búsqueda avanzada:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/search/suggestions - Sugerencias de búsqueda
searchRouter.get('/suggestions', async (req, res) => {
  try {
    console.log('💡 Obteniendo sugerencias de búsqueda...');

    // Conductores más buscados/activos
    const conductoresQuery = `
      SELECT conductor_nombre, total_inspecciones
      FROM conductores_estado
      WHERE total_inspecciones > 5
      ORDER BY total_inspecciones DESC
      LIMIT 10
    `;

    // Vehículos con más actividad
    const vehiculosQuery = `
      SELECT placa_vehiculo, total_inspecciones
      FROM vehiculos_estado
      WHERE total_inspecciones > 5
      ORDER BY total_inspecciones DESC
      LIMIT 10
    `;

    // Términos frecuentes en observaciones
    const terminosQuery = `
      SELECT 
        unnest(string_to_array(lower(observaciones), ' ')) as termino,
        COUNT(*) as frecuencia
      FROM inspecciones
      WHERE observaciones IS NOT NULL 
        AND observaciones != ''
        AND marca_temporal >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY termino
      HAVING LENGTH(termino) > 3 
        AND COUNT(*) > 5
        AND termino NOT IN ('para', 'esta', 'este', 'con', 'por', 'que', 'del', 'las', 'los', 'una', 'muy')
      ORDER BY frecuencia DESC
      LIMIT 15
    `;

    const [conductoresResult, vehiculosResult, terminosResult] = await Promise.all([
      query(conductoresQuery),
      query(vehiculosQuery),
      query(terminosQuery)
    ]);

    const sugerencias = {
      conductoresPopulares: conductoresResult.rows.map(row => ({
        nombre: row.conductor_nombre,
        inspecciones: parseInt(row.total_inspecciones)
      })),
      vehiculosActivos: vehiculosResult.rows.map(row => ({
        placa: row.placa_vehiculo,
        inspecciones: parseInt(row.total_inspecciones)
      })),
      terminosFrecuentes: terminosResult.rows.map(row => ({
        termino: row.termino,
        frecuencia: parseInt(row.frecuencia)
      }))
    };

    res.json({
      success: true,
      data: sugerencias,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error obteniendo sugerencias:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = { fatigueRouter, searchRouter };