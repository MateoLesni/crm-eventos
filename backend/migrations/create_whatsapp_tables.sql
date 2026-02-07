-- =============================================
-- Script para crear tablas de WhatsApp Evolution API
-- Ejecutar en MySQL Cloud SQL
-- =============================================

-- Tabla 1: wa_contactos
-- Almacena información única de cada cliente/lead de WhatsApp
CREATE TABLE IF NOT EXISTS wa_contactos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    numero_original VARCHAR(20) NOT NULL COMMENT 'Número tal como se recibió originalmente',
    numero_normalizado VARCHAR(20) NOT NULL UNIQUE COMMENT 'Formato estándar 5491124395923',
    numero_whatsapp VARCHAR(30) NULL COMMENT 'Formato Evolution: 5491124395923@s.whatsapp.net',
    nombre VARCHAR(100) NULL,
    apellido VARCHAR(100) NULL,
    email VARCHAR(150) NULL,
    empresa VARCHAR(150) NULL,
    es_cliente BOOLEAN DEFAULT FALSE COMMENT 'Si ya compró o no',
    estado VARCHAR(20) DEFAULT 'nuevo' COMMENT 'nuevo, contactado, calificado, ganado, perdido',
    notas TEXT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_numero_original (numero_original),
    INDEX idx_numero_normalizado (numero_normalizado),
    INDEX idx_numero_whatsapp (numero_whatsapp),
    INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla 2: wa_conversaciones
-- Cada conversación = un hilo completo de chat con un contacto
CREATE TABLE IF NOT EXISTS wa_conversaciones (
    id INT PRIMARY KEY AUTO_INCREMENT,
    contacto_id INT NOT NULL COMMENT 'FK a wa_contactos.id',
    remote_jid VARCHAR(50) NOT NULL COMMENT 'Identificador WhatsApp del chat',
    instancia_nombre VARCHAR(50) NOT NULL DEFAULT 'whatsapp_nuevo',
    estado VARCHAR(20) DEFAULT 'abierta' COMMENT 'abierta, cerrada, archivada',
    ultima_actividad DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_mensajes INT DEFAULT 0,
    mensajes_recibidos INT DEFAULT 0 COMMENT 'Mensajes del cliente',
    mensajes_enviados INT DEFAULT 0 COMMENT 'Mensajes del vendedor',
    vendedor_numero VARCHAR(20) NULL COMMENT 'Número del vendedor asignado',
    vendedor_nombre VARCHAR(100) NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_contacto_id (contacto_id),
    INDEX idx_remote_jid (remote_jid),
    INDEX idx_ultima_actividad (ultima_actividad),
    INDEX idx_estado (estado),
    INDEX idx_contacto_ultima_actividad (contacto_id, ultima_actividad),

    CONSTRAINT fk_wa_conversacion_contacto
        FOREIGN KEY (contacto_id) REFERENCES wa_contactos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla 3: wa_mensajes
-- Almacena TODOS los mensajes individuales (enviados y recibidos)
CREATE TABLE IF NOT EXISTS wa_mensajes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    conversacion_id INT NOT NULL COMMENT 'FK a wa_conversaciones.id',
    mensaje_id VARCHAR(100) NOT NULL UNIQUE COMMENT 'ID único de Evolution API (key.id)',
    texto TEXT NULL COMMENT 'Contenido del mensaje',
    tipo_mensaje VARCHAR(20) DEFAULT 'text' COMMENT 'text, image, audio, video, document',
    es_enviado BOOLEAN NOT NULL COMMENT 'TRUE = vendedor envió, FALSE = cliente envió',
    from_me BOOLEAN NOT NULL COMMENT 'Campo original de Evolution API',
    numero_remitente VARCHAR(50) NULL COMMENT 'Número de quien envió',
    timestamp BIGINT NOT NULL COMMENT 'Unix timestamp de Evolution (messageTimestamp)',
    fecha_mensaje DATETIME NOT NULL COMMENT 'Timestamp convertido a datetime',
    fecha_creacion_bd DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Cuándo se guardó en BD',
    estado_lectura VARCHAR(20) NULL COMMENT 'pending, sent, delivered, read',
    tiene_multimedia BOOLEAN DEFAULT FALSE,
    multimedia_url VARCHAR(500) NULL,
    mensaje_completo_json JSON NULL COMMENT 'Mensaje completo de Evolution API para debugging',

    INDEX idx_conversacion_id (conversacion_id),
    INDEX idx_mensaje_id (mensaje_id),
    INDEX idx_es_enviado (es_enviado),
    INDEX idx_timestamp (timestamp),
    INDEX idx_fecha_mensaje (fecha_mensaje),
    INDEX idx_conversacion_timestamp (conversacion_id, timestamp),
    INDEX idx_mensaje_fecha_tipo (fecha_mensaje, es_enviado),

    CONSTRAINT fk_wa_mensaje_conversacion
        FOREIGN KEY (conversacion_id) REFERENCES wa_conversaciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verificar que se crearon correctamente
-- SHOW TABLES LIKE 'wa_%';
-- DESCRIBE wa_contactos;
-- DESCRIBE wa_conversaciones;
-- DESCRIBE wa_mensajes;
