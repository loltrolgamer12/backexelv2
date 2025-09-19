const { Pool } = require('pg');

let pool;

// Configuración de conexión a Neon PostgreSQL
const createPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('Error inesperado en el pool de conexiones:', err);
    });
  }
  return pool;
};

// Obtener cliente de la base de datos
const getDbClient = async () => {
  const dbPool = createPool();
  return await dbPool.connect();
};

// Ejecutar query
const query = async (text, params) => {
  const dbPool = createPool();
  try {
    const result = await dbPool.query(text, params);
    return result;
  } catch (error) {
    console.error('Error en query:', error);
    throw error;
  }
};

// Inicializar base de datos con las tablas necesarias
const initDatabase = async () => {
  console.log('🔄 Inicializando base de datos...');
  
  try {
    const client = await getDbClient();
    
    try {
      // Script de migración completo
      const migrationScript = `
        -- Configurar zona horaria y esquema
        SET timezone = 'America/Bogota';
        SET search_path TO public;

        -- ================================================================
        -- TABLA PRINCIPAL - INSPECCIONES
        -- ================================================================
        CREATE TABLE IF NOT EXISTS inspecciones (
            id SERIAL PRIMARY KEY,
            marca_temporal TIMESTAMP NOT NULL,
            conductor_nombre VARCHAR(255) NOT NULL,
            contrato VARCHAR(255),
            campo_coordinacion VARCHAR(255),
            placa_vehiculo VARCHAR(20) NOT NULL,
            kilometraje INTEGER,
            turno VARCHAR(50) DEFAULT 'DIURNO',
            observaciones TEXT,
            mes_datos INTEGER NOT NULL CHECK (mes_datos >= 1 AND mes_datos <= 12),
            año_datos INTEGER NOT NULL CHECK (año_datos >= 2020 AND año_datos <= 2050),
            hash_unico VARCHAR(64) UNIQUE NOT NULL,
            fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- ================================================================
        -- TABLAS RELACIONADAS
        -- ================================================================

        -- Tabla de elementos de inspección (40+ elementos del Excel)
        CREATE TABLE IF NOT EXISTS elementos_inspeccion (
            id SERIAL PRIMARY KEY,
            inspeccion_id INTEGER NOT NULL REFERENCES inspecciones(id) ON DELETE CASCADE,
            elemento VARCHAR(255) NOT NULL,
            cumple BOOLEAN NOT NULL,
            es_critico BOOLEAN DEFAULT FALSE,
            observaciones_elemento TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_elemento_por_inspeccion UNIQUE(inspeccion_id, elemento)
        );

        -- Tabla de control de fatiga (4 preguntas específicas)
        CREATE TABLE IF NOT EXISTS control_fatiga (
            id SERIAL PRIMARY KEY,
            inspeccion_id INTEGER NOT NULL REFERENCES inspecciones(id) ON DELETE CASCADE,
            dormido_7_horas BOOLEAN NOT NULL,
            libre_fatiga BOOLEAN NOT NULL,
            condiciones_conducir BOOLEAN NOT NULL,
            medicamentos_alerta BOOLEAN NOT NULL,
            score_fatiga INTEGER DEFAULT 0 CHECK (score_fatiga >= 0 AND score_fatiga <= 4),
            estado_fatiga VARCHAR(20) DEFAULT 'verde' CHECK (estado_fatiga IN ('verde', 'amarillo', 'rojo')),
            horas_conduccion_dia DECIMAL(4,2) DEFAULT 0,
            horas_descanso DECIMAL(4,2) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_fatiga_por_inspeccion UNIQUE(inspeccion_id)
        );

        -- ================================================================
        -- TABLAS DE ESTADO CALCULADO
        -- ================================================================

        -- Resumen por conductor
        CREATE TABLE IF NOT EXISTS conductores_estado (
            id SERIAL PRIMARY KEY,
            conductor_nombre VARCHAR(255) UNIQUE NOT NULL,
            ultima_inspeccion TIMESTAMP,
            dias_sin_inspeccion INTEGER DEFAULT 0,
            estado VARCHAR(20) DEFAULT 'verde' CHECK (estado IN ('verde', 'amarillo', 'rojo')),
            total_inspecciones INTEGER DEFAULT 0,
            placa_asignada VARCHAR(20),
            campo_coordinacion VARCHAR(255),
            contrato VARCHAR(255),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Resumen por vehículo
        CREATE TABLE IF NOT EXISTS vehiculos_estado (
            id SERIAL PRIMARY KEY,
            placa_vehiculo VARCHAR(20) UNIQUE NOT NULL,
            ultima_inspeccion TIMESTAMP,
            ultimo_conductor VARCHAR(255),
            estado VARCHAR(20) DEFAULT 'verde' CHECK (estado IN ('verde', 'amarillo', 'naranja', 'rojo')),
            fallas_criticas INTEGER DEFAULT 0,
            fallas_menores INTEGER DEFAULT 0,
            total_inspecciones INTEGER DEFAULT 0,
            observaciones_recientes TEXT,
            campo_coordinacion VARCHAR(255),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- ================================================================
        -- ÍNDICES PARA OPTIMIZACIÓN
        -- ================================================================
        CREATE INDEX IF NOT EXISTS idx_inspeccion_fecha ON inspecciones(marca_temporal, mes_datos, año_datos);
        CREATE INDEX IF NOT EXISTS idx_conductor ON inspecciones(conductor_nombre);
        CREATE INDEX IF NOT EXISTS idx_placa ON inspecciones(placa_vehiculo);
        CREATE INDEX IF NOT EXISTS idx_hash ON inspecciones(hash_unico);
        CREATE INDEX IF NOT EXISTS idx_elementos_inspeccion ON elementos_inspeccion(inspeccion_id, elemento);
        CREATE INDEX IF NOT EXISTS idx_fatiga_inspeccion ON control_fatiga(inspeccion_id);
        CREATE INDEX IF NOT EXISTS idx_conductores_estado ON conductores_estado(estado, dias_sin_inspeccion);
        CREATE INDEX IF NOT EXISTS idx_vehiculos_estado ON vehiculos_estado(estado, fallas_criticas);
      `;

      // Ejecutar migración
      await client.query(migrationScript);
      console.log('✅ Tablas creadas/verificadas correctamente');

      // Crear funciones y triggers
      await createFunctionsAndTriggers(client);
      
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    throw error;
  }
};

// Crear funciones y triggers de la base de datos
const createFunctionsAndTriggers = async (client) => {
  const functionsScript = `
    -- Función para calcular hash único (anti-duplicados)
    CREATE OR REPLACE FUNCTION calcular_hash_inspeccion(
        p_marca_temporal TIMESTAMP,
        p_conductor VARCHAR,
        p_placa VARCHAR,
        p_kilometraje INTEGER
    )
    RETURNS VARCHAR AS $$
    DECLARE
        data_concatenada TEXT;
        hash_result VARCHAR;
    BEGIN
        data_concatenada := p_marca_temporal::TEXT || 
                           UPPER(TRIM(p_conductor)) || 
                           UPPER(TRIM(p_placa)) || 
                           COALESCE(p_kilometraje, 0)::TEXT;
        
        -- Generar hash simple usando hashtext
        hash_result := abs(hashtext(data_concatenada))::TEXT;
        
        RETURN LPAD(hash_result, 8, '0');
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    -- Función para calcular score de fatiga
    CREATE OR REPLACE FUNCTION calcular_score_fatiga(
        p_dormido_7h BOOLEAN,
        p_libre_fatiga BOOLEAN,
        p_condiciones BOOLEAN,
        p_medicamentos BOOLEAN
    )
    RETURNS INTEGER AS $$
    DECLARE
        score INTEGER := 0;
    BEGIN
        IF p_dormido_7h THEN score := score + 1; END IF;
        IF p_libre_fatiga THEN score := score + 1; END IF;
        IF p_condiciones THEN score := score + 1; END IF;
        IF NOT p_medicamentos THEN score := score + 1; END IF;
        RETURN score;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    -- Función para determinar estado de fatiga
    CREATE OR REPLACE FUNCTION determinar_estado_fatiga(score INTEGER)
    RETURNS VARCHAR AS $$
    BEGIN
        RETURN CASE 
            WHEN score >= 4 THEN 'verde'
            WHEN score >= 2 THEN 'amarillo'
            ELSE 'rojo'
        END;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    -- Función para actualizar updated_at
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    -- Función para calcular fatiga automáticamente
    CREATE OR REPLACE FUNCTION trigger_calcular_fatiga()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.score_fatiga := calcular_score_fatiga(
            NEW.dormido_7_horas,
            NEW.libre_fatiga,
            NEW.condiciones_conducir,
            NEW.medicamentos_alerta
        );
        NEW.estado_fatiga := determinar_estado_fatiga(NEW.score_fatiga);
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;

  const triggersScript = `
    -- Aplicar triggers
    DROP TRIGGER IF EXISTS update_conductores_estado_updated_at ON conductores_estado;
    CREATE TRIGGER update_conductores_estado_updated_at 
        BEFORE UPDATE ON conductores_estado
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_vehiculos_estado_updated_at ON vehiculos_estado;
    CREATE TRIGGER update_vehiculos_estado_updated_at 
        BEFORE UPDATE ON vehiculos_estado
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS trigger_control_fatiga_score ON control_fatiga;
    CREATE TRIGGER trigger_control_fatiga_score 
        BEFORE INSERT OR UPDATE ON control_fatiga
        FOR EACH ROW EXECUTE FUNCTION trigger_calcular_fatiga();
  `;

  try {
    await client.query(functionsScript);
    await client.query(triggersScript);
    console.log('✅ Funciones y triggers creados correctamente');
  } catch (error) {
    console.error('⚠️  Error creando funciones/triggers:', error);
    // No lanzar error, las funciones son opcionales
  }
};

// Cerrar pool de conexiones
const closePool = async () => {
  if (pool) {
    await pool.end();
    console.log('🔌 Pool de conexiones cerrado');
  }
};

module.exports = {
  query,
  getDbClient,
  initDatabase,
  closePool
};