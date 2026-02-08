-- Migración: Tablas para sistema Pre-Check
-- Fecha: 2026-02-07
-- Descripción: Crear tablas para pre-check de eventos (conceptos, adicionales, pagos)

-- 1. Agregar campo 'facturada' a la tabla eventos (para cálculo de IVA)
-- Ejecutar solo si la columna no existe (ignorar error si ya existe)
ALTER TABLE eventos ADD COLUMN facturada BOOLEAN DEFAULT FALSE;

-- 2. Actualizar estados posibles del evento (agregar CONCLUIDO)
-- Los estados son: CONSULTA_ENTRANTE, ASIGNADO, CONTACTADO, COTIZADO, CONFIRMADO, RECHAZADO, CONCLUIDO

-- 3. Tabla de conceptos del pre-check
CREATE TABLE IF NOT EXISTS precheck_conceptos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    evento_id INT NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    categoria_otro VARCHAR(100),
    descripcion VARCHAR(255) NOT NULL,
    cantidad DECIMAL(10, 2) NOT NULL DEFAULT 1,
    precio_unitario DECIMAL(12, 2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
    INDEX idx_precheck_conceptos_evento (evento_id),
    INDEX idx_precheck_conceptos_categoria (categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabla de adicionales del pre-check
CREATE TABLE IF NOT EXISTS precheck_adicionales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    evento_id INT NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    categoria_otro VARCHAR(100),
    descripcion VARCHAR(255) NOT NULL,
    monto DECIMAL(12, 2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
    INDEX idx_precheck_adicionales_evento (evento_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabla de pagos del pre-check
CREATE TABLE IF NOT EXISTS precheck_pagos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    evento_id INT NOT NULL,
    metodo_pago VARCHAR(50) NOT NULL,
    monto DECIMAL(12, 2) NOT NULL,
    fecha_pago DATE NOT NULL,
    comprobante_url VARCHAR(500),
    comprobante_nombre VARCHAR(255),
    notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
    INDEX idx_precheck_pagos_evento (evento_id),
    INDEX idx_precheck_pagos_fecha (fecha_pago)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
