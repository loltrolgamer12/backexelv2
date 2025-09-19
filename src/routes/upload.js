const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const crypto = require('crypto');
const { query } = require('../config/database');

const router = express.Router();

// Configuración de multer para manejo de archivos
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.includes('spreadsheet') || 
        file.mimetype.includes('excel') || 
        file.originalname.endsWith('.xlsx') || 
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'), false);
    }
  }
});

// Función para generar hash único
const generateHash = (timestamp, conductor, placa, kilometraje) => {
  const data = `${timestamp}${conductor?.toUpperCase().trim()}${placa?.toUpperCase().trim()}${kilometraje || 0}`;
  return crypto.createHash('md5').update(data).digest('hex').substring(0, 16);
};

// Función para normalizar respuestas de cumplimiento
const normalizarCumplimiento = (valor) => {
  if (!valor) return false;
  const valorStr = valor.toString().toLowerCase().trim();
  return valorStr === 'cumple' || valorStr === 'si' || valorStr === 'sí' || valorStr === 'yes' || valorStr === 'true';
};

// Función para procesar Excel y extraer datos
const procesarExcel = (buffer) => {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    console.log(`📊 Procesando ${data.length} filas del Excel`);

    // Mapear datos del Excel a nuestro formato
    const inspecciones = data.map((row, index) => {
      try {
        // Extraer fecha (puede venir en diferentes formatos)
        let marcaTemporal;
        if (row['FECHA'] || row['Marca temporal'] || row['MARCA TEMPORAL']) {
          const fechaRaw = row['FECHA'] || row['Marca temporal'] || row['MARCA TEMPORAL'];
          marcaTemporal = new Date(fechaRaw);
          if (isNaN(marcaTemporal.getTime())) {
            throw new Error(`Fecha inválida en fila ${index + 2}: ${fechaRaw}`);
          }
        } else {
          marcaTemporal = new Date();
        }

        // Extraer datos básicos
        const conductorNombre = (row['NOMBRE DE QUIEN REALIZA LA INSPECCIÓN'] || 
                                row['CONDUCTOR'] || 
                                row['NOMBRE'] || '').toString().trim();
        const placaVehiculo = (row['PLACA DEL VEHICULO'] || 
                              row['PLACA'] || 
                              row['PLACA VEHÍCULO'] || '').toString().trim().toUpperCase();
        const kilometraje = parseInt(row['KILOMETRAJE'] || row['KM'] || 0) || 0;
        const contrato = (row['CONTRATO'] || '').toString().trim();
        const campoCoordinacion = (row['CAMPO/COORDINACIÓN'] || 
                                  row['CAMPO'] || 
                                  row['COORDINACIÓN'] || '').toString().trim();
        const turno = (row['TURNO'] || 'DIURNO').toString().trim().toUpperCase();
        const observaciones = (row['OBSERVACIONES'] || '').toString().trim();

        // Validaciones básicas
        if (!conductorNombre) {
          throw new Error(`Conductor faltante en fila ${index + 2}`);
        }
        if (!placaVehiculo) {
          throw new Error(`Placa faltante en fila ${index + 2}`);
        }

        // Generar hash único para anti-duplicados
        const hashUnico = generateHash(marcaTemporal, conductorNombre, placaVehiculo, kilometraje);

        // Extraer elementos de inspección (40+ elementos)
        const elementos = [];
        const elementosInspeccion = [
          'ALTAS Y BAJAS', 'DIRECCIONALES DERECHA E IZQUIERDA', 'LUCES DE PARQUEO',
          'LUCES DE FRENO', 'LUCES DE REVERSA', 'ESPEJOS', 'VIDRIO FRONTAL',
          'ORDEN Y ASEO', 'PITO', 'GPS MONITOREO', 'FRENOS', 'FRENO DE EMERGENCIA',
          'CINTURONES DE SEGURIDAD', 'PUERTAS', 'VIDRIOS', 'LIMPIAPARABRISAS',
          'EXTINTOR', 'BOTIQUÍN', 'TAPICERÍA', 'INDICADORES DEL TABLERO',
          'OBJETOS SUELTOS', 'ACEITE MOTOR', 'FLUIDO DE FRENOS', 'FLUIDO DIRECCIÓN',
          'FLUIDO REFRIGERANTE', 'FLUIDO LIMPIAPARABRISAS', 'CORREAS', 'BATERÍAS',
          'LLANTAS LABRADO', 'LLANTAS CORTADURAS', 'LLANTA DE REPUESTO', 'PERNOS LLANTAS',
          'SUSPENSIÓN', 'DIRECCIÓN TERMINALES', 'TAPA COMBUSTIBLE', 'EQUIPO CARRETERA',
          'KIT AMBIENTAL', 'DOCUMENTACIÓN', 'HERRAMIENTAS', 'TRIANGULOS SEGURIDAD'
        ];

        // Elementos críticos (marcados como críticos para alertas)
        const elementosCriticos = [
          'FRENOS', 'FRENO DE EMERGENCIA', 'CINTURONES DE SEGURIDAD', 'DIRECCIONALES DERECHA E IZQUIERDA',
          'LUCES DE FRENO', 'ESPEJOS', 'DIRECCIÓN TERMINALES', 'SUSPENSIÓN', 'LLANTAS LABRADO',
          'EXTINTOR', 'PERNOS LLANTAS'
        ];

        // Procesar cada elemento de inspección
        elementosInspeccion.forEach(elemento => {
          const valor = row[elemento];
          if (valor !== undefined && valor !== '') {
            elementos.push({
              elemento: elemento,
              cumple: normalizarCumplimiento(valor),
              esCritico: elementosCriticos.includes(elemento),
              observacionesElemento: ''
            });
          }
        });

        // Extraer control de fatiga (4 preguntas específicas)
        const controlFatiga = {
          dormido7Horas: normalizarCumplimiento(row['¿Ha dormido al menos 7 horas en las últimas 24 horas?'] || 
                                               row['DORMIDO 7 HORAS'] || 
                                               row['SUEÑO 7H']),
          libreFatiga: normalizarCumplimiento(row['¿Se encuentra libre de síntomas de fatiga?'] || 
                                            row['LIBRE FATIGA'] || 
                                            row['SIN FATIGA']),
          condicionesConducir: normalizarCumplimiento(row['¿Se siente en condiciones físicas y mentales para conducir?'] || 
                                                    row['CONDICIONES CONDUCIR'] || 
                                                    row['APTO CONDUCIR']),
          medicamentosAlerta: !normalizarCumplimiento(row['¿Ha consumido medicamentos o sustancias que afecten su estado de alerta?'] || 
                                                     row['MEDICAMENTOS'] || 
                                                     row['SUSTANCIAS']) // Negado porque es mejor NO haber consumido
        };

        return {
          marcaTemporal,
          conductorNombre,
          contrato,
          campoCoordinacion,
          placaVehiculo,
          kilometraje,
          turno,
          observaciones,
          mesData: marcaTemporal.getMonth() + 1,
          añoData: marcaTemporal.getFullYear(),
          hashUnico,
          elementos,
          controlFatiga
        };
      } catch (error) {
        console.error(`Error procesando fila ${index + 2}:`, error.message);
        return null; // Saltar esta fila
      }
    }).filter(inspeccion => inspeccion !== null); // Filtrar filas inválidas

    console.log(`✅ Procesadas ${inspecciones.length} inspecciones válidas de ${data.length} filas`);
    return inspecciones;
  } catch (error) {
    console.error('Error procesando Excel:', error);
    throw new Error(`Error procesando archivo Excel: ${error.message}`);
  }
};

// POST /api/upload/validate - Validar duplicados antes de insertar
router.post('/validate', upload.single('excel'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionó archivo Excel'
      });
    }

    console.log(`📁 Validando archivo: ${req.file.originalname} (${req.file.size} bytes)`);

    // Procesar Excel
    const inspecciones = procesarExcel(req.file.buffer);

    if (inspecciones.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se encontraron registros válidos en el archivo'
      });
    }

    // Verificar duplicados en base de datos
    const hashes = inspecciones.map(i => i.hashUnico);
    const duplicadosQuery = `
      SELECT hash_unico, conductor_nombre, placa_vehiculo, marca_temporal
      FROM inspecciones 
      WHERE hash_unico = ANY($1)
    `;

    const duplicadosResult = await query(duplicadosQuery, [hashes]);
    const duplicados = duplicadosResult.rows;

    // Separar nuevos de duplicados
    const hashsDuplicados = new Set(duplicados.map(d => d.hash_unico));
    const registrosNuevos = inspecciones.filter(i => !hashsDuplicados.has(i.hashUnico));

    // Estadísticas por mes
    const estadisticasPorMes = {};
    inspecciones.forEach(i => {
      const clave = `${i.añoData}-${i.mesData.toString().padStart(2, '0')}`;
      if (!estadisticasPorMes[clave]) {
        estadisticasPorMes[clave] = { total: 0, nuevos: 0, duplicados: 0 };
      }
      estadisticasPorMes[clave].total++;
      if (hashsDuplicados.has(i.hashUnico)) {
        estadisticasPorMes[clave].duplicados++;
      } else {
        estadisticasPorMes[clave].nuevos++;
      }
    });

    res.json({
      success: true,
      data: {
        totalRegistros: inspecciones.length,
        registrosNuevos: registrosNuevos.length,
        registrosDuplicados: duplicados.length,
        estadisticasPorMes,
        duplicados: duplicados.slice(0, 10), // Mostrar solo primeros 10
        muestraRegistrosNuevos: registrosNuevos.slice(0, 5).map(r => ({
          conductor: r.conductorNombre,
          placa: r.placaVehiculo,
          fecha: r.marcaTemporal,
          elementos: r.elementos.length,
          fatiga: Object.values(r.controlFatiga).filter(v => v === true).length
        }))
      }
    });

  } catch (error) {
    console.error('Error en validación:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/upload/process - Procesar e insertar datos
router.post('/process', upload.single('excel'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionó archivo Excel'
      });
    }

    const { forceInsert = false } = req.body;
    console.log(`🔄 Procesando archivo: ${req.file.originalname}`);

    // Procesar Excel
    const inspecciones = procesarExcel(req.file.buffer);

    if (inspecciones.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se encontraron registros válidos en el archivo'
      });
    }

    // Si no es forzado, verificar duplicados
    let registrosParaInsertar = inspecciones;
    if (!forceInsert) {
      const hashes = inspecciones.map(i => i.hashUnico);
      const duplicadosQuery = `SELECT hash_unico FROM inspecciones WHERE hash_unico = ANY($1)`;
      const duplicadosResult = await query(duplicadosQuery, [hashes]);
      const hashsDuplicados = new Set(duplicadosResult.rows.map(d => d.hash_unico));
      registrosParaInsertar = inspecciones.filter(i => !hashsDuplicados.has(i.hashUnico));
    }

    if (registrosParaInsertar.length === 0) {
      return res.json({
        success: true,
        message: 'No hay registros nuevos para insertar',
        data: {
          insertados: 0,
          duplicados: inspecciones.length,
          total: inspecciones.length
        }
      });
    }

    // Insertar en lotes para mejor rendimiento
    const loteSize = 100;
    let totalInsertados = 0;
    
    for (let i = 0; i < registrosParaInsertar.length; i += loteSize) {
      const lote = registrosParaInsertar.slice(i, i + loteSize);
      
      // Insertar inspecciones principales
      for (const inspeccion of lote) {
        const client = await require('../config/database').getDbClient();
        
        try {
          await client.query('BEGIN');

          // Insertar inspección principal
          const inspeccionQuery = `
            INSERT INTO inspecciones (
              marca_temporal, conductor_nombre, contrato, campo_coordinacion,
              placa_vehiculo, kilometraje, turno, observaciones,
              mes_datos, año_datos, hash_unico
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
          `;

          const inspeccionResult = await client.query(inspeccionQuery, [
            inspeccion.marcaTemporal,
            inspeccion.conductorNombre,
            inspeccion.contrato,
            inspeccion.campoCoordinacion,
            inspeccion.placaVehiculo,
            inspeccion.kilometraje,
            inspeccion.turno,
            inspeccion.observaciones,
            inspeccion.mesData,
            inspeccion.añoData,
            inspeccion.hashUnico
          ]);

          const inspeccionId = inspeccionResult.rows[0].id;

          // Insertar elementos de inspección
          for (const elemento of inspeccion.elementos) {
            const elementoQuery = `
              INSERT INTO elementos_inspeccion (
                inspeccion_id, elemento, cumple, es_critico, observaciones_elemento
              ) VALUES ($1, $2, $3, $4, $5)
            `;

            await client.query(elementoQuery, [
              inspeccionId,
              elemento.elemento,
              elemento.cumple,
              elemento.esCritico,
              elemento.observacionesElemento
            ]);
          }

          // Insertar control de fatiga
          const fatigaQuery = `
            INSERT INTO control_fatiga (
              inspeccion_id, dormido_7_horas, libre_fatiga, 
              condiciones_conducir, medicamentos_alerta
            ) VALUES ($1, $2, $3, $4, $5)
          `;

          await client.query(fatigaQuery, [
            inspeccionId,
            inspeccion.controlFatiga.dormido7Horas,
            inspeccion.controlFatiga.libreFatiga,
            inspeccion.controlFatiga.condicionesConducir,
            inspeccion.controlFatiga.medicamentosAlerta
          ]);

          await client.query('COMMIT');
          totalInsertados++;

        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`Error insertando inspección ${inspeccion.hashUnico}:`, error);
          throw error;
        } finally {
          client.release();
        }
      }

      // Progreso para archivos grandes
      if (registrosParaInsertar.length > 500) {
        console.log(`📊 Progreso: ${Math.min(i + loteSize, registrosParaInsertar.length)}/${registrosParaInsertar.length}`);
      }
    }

    // Actualizar estados calculados después de inserción
    await actualizarEstadosCalculados();

    console.log(`✅ Procesamiento completado: ${totalInsertados} registros insertados`);

    res.json({
      success: true,
      message: `Archivo procesado exitosamente`,
      data: {
        insertados: totalInsertados,
        duplicados: inspecciones.length - registrosParaInsertar.length,
        total: inspecciones.length,
        archivo: req.file.originalname,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error procesando archivo:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/upload/months - Obtener meses disponibles en BD
router.get('/months', async (req, res) => {
  try {
    const monthsQuery = `
      SELECT DISTINCT año_datos, mes_datos, 
             COUNT(*) as total_registros,
             MIN(fecha_subida) as primera_carga,
             MAX(fecha_subida) as ultima_carga
      FROM inspecciones
      GROUP BY año_datos, mes_datos
      ORDER BY año_datos DESC, mes_datos DESC
    `;

    const result = await query(monthsQuery);
    
    const meses = result.rows.map(row => ({
      año: row.año_datos,
      mes: row.mes_datos,
      mesTexto: new Date(row.año_datos, row.mes_datos - 1).toLocaleDateString('es-CO', { 
        month: 'long', 
        year: 'numeric' 
      }),
      totalRegistros: parseInt(row.total_registros),
      primeraCarga: row.primera_carga,
      ultimaCarga: row.ultima_carga
    }));

    res.json({
      success: true,
      data: meses
    });

  } catch (error) {
    console.error('Error obteniendo meses:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Función auxiliar para actualizar estados calculados
const actualizarEstadosCalculados = async () => {
  try {
    console.log('🔄 Actualizando estados calculados...');

    // Actualizar conductores_estado
    const conductoresQuery = `
      INSERT INTO conductores_estado (
        conductor_nombre, ultima_inspeccion, dias_sin_inspeccion, 
        estado, total_inspecciones, placa_asignada, 
        campo_coordinacion, contrato
      )
      SELECT 
        conductor_nombre,
        MAX(marca_temporal) as ultima_inspeccion,
        EXTRACT(DAY FROM (CURRENT_TIMESTAMP - MAX(marca_temporal)))::integer as dias_sin_inspeccion,
        CASE 
          WHEN EXTRACT(DAY FROM (CURRENT_TIMESTAMP - MAX(marca_temporal))) <= 5 THEN 'verde'
          WHEN EXTRACT(DAY FROM (CURRENT_TIMESTAMP - MAX(marca_temporal))) <= 10 THEN 'amarillo'
          ELSE 'rojo'
        END as estado,
        COUNT(*) as total_inspecciones,
        MAX(placa_vehiculo) as placa_asignada,
        MAX(campo_coordinacion) as campo_coordinacion,
        MAX(contrato) as contrato
      FROM inspecciones
      GROUP BY conductor_nombre
      ON CONFLICT (conductor_nombre) 
      DO UPDATE SET
        ultima_inspeccion = EXCLUDED.ultima_inspeccion,
        dias_sin_inspeccion = EXCLUDED.dias_sin_inspeccion,
        estado = EXCLUDED.estado,
        total_inspecciones = EXCLUDED.total_inspecciones,
        placa_asignada = EXCLUDED.placa_asignada,
        campo_coordinacion = EXCLUDED.campo_coordinacion,
        contrato = EXCLUDED.contrato,
        updated_at = CURRENT_TIMESTAMP
    `;

    // Actualizar vehiculos_estado
    const vehiculosQuery = `
      INSERT INTO vehiculos_estado (
        placa_vehiculo, ultima_inspeccion, ultimo_conductor,
        estado, fallas_criticas, fallas_menores, 
        total_inspecciones, observaciones_recientes, campo_coordinacion
      )
      SELECT 
        i.placa_vehiculo,
        MAX(i.marca_temporal) as ultima_inspeccion,
        MAX(i.conductor_nombre) as ultimo_conductor,
        CASE 
          WHEN SUM(CASE WHEN ei.es_critico AND NOT ei.cumple THEN 1 ELSE 0 END) > 2 THEN 'rojo'
          WHEN SUM(CASE WHEN ei.es_critico AND NOT ei.cumple THEN 1 ELSE 0 END) > 0 THEN 'naranja'
          WHEN SUM(CASE WHEN NOT ei.cumple THEN 1 ELSE 0 END) > 0 THEN 'amarillo'
          ELSE 'verde'
        END as estado,
        SUM(CASE WHEN ei.es_critico AND NOT ei.cumple THEN 1 ELSE 0 END) as fallas_criticas,
        SUM(CASE WHEN NOT ei.es_critico AND NOT ei.cumple THEN 1 ELSE 0 END) as fallas_menores,
        COUNT(DISTINCT i.id) as total_inspecciones,
        MAX(i.observaciones) as observaciones_recientes,
        MAX(i.campo_coordinacion) as campo_coordinacion
      FROM inspecciones i
      LEFT JOIN elementos_inspeccion ei ON i.id = ei.inspeccion_id
      GROUP BY i.placa_vehiculo
      ON CONFLICT (placa_vehiculo)
      DO UPDATE SET
        ultima_inspeccion = EXCLUDED.ultima_inspeccion,
        ultimo_conductor = EXCLUDED.ultimo_conductor,
        estado = EXCLUDED.estado,
        fallas_criticas = EXCLUDED.fallas_criticas,
        fallas_menores = EXCLUDED.fallas_menores,
        total_inspecciones = EXCLUDED.total_inspecciones,
        observaciones_recientes = EXCLUDED.observaciones_recientes,
        campo_coordinacion = EXCLUDED.campo_coordinacion,
        updated_at = CURRENT_TIMESTAMP
    `;

    await query(conductoresQuery);
    await query(vehiculosQuery);
    
    console.log('✅ Estados calculados actualizados');
  } catch (error) {
    console.error('Error actualizando estados:', error);
    throw error;
  }
};

module.exports = router;