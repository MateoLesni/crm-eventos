"""
Pre-check v3 + Hoja de ruta. Idempotente (se puede correr más de una vez).
- IVA por línea, condición (cobrado/incluido/bonificado/no incluido), cobro aparte y comisión
- Seña en pesos, espacio en texto, nota para el cliente, intermediario
- Pago: destinatario y referencia
- Catálogo: lleva IVA y composición del menú
- Tablas hojas_ruta y hoja_ruta_versiones
"""
from sqlalchemy import text


def _columnas(conn, tabla):
    filas = conn.execute(text(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t"), {'t': tabla})
    return {f[0] for f in filas}


NUEVAS = {
    'precheck_conceptos': {
        'lleva_iva': 'TINYINT(1) NOT NULL DEFAULT 1',
        'condicion': "VARCHAR(20) NOT NULL DEFAULT 'cobrado'",
        'cobro_aparte': 'TINYINT(1) NOT NULL DEFAULT 0',
        'comision_porcentaje': 'DECIMAL(5, 2) NULL',
    },
    'precheck_adicionales': {
        'lleva_iva': 'TINYINT(1) NOT NULL DEFAULT 1',
    },
    'precheck_pagos': {
        'destinatario': 'VARCHAR(120) NULL',
        'referencia': 'VARCHAR(120) NULL',
    },
    'catalogo_items': {
        'lleva_iva': 'TINYINT(1) NOT NULL DEFAULT 1',
        'composicion': 'TEXT NULL',
    },
    'prechecks': {
        'sena_monto': 'DECIMAL(14, 2) NULL',
        'espacio_detalle': 'VARCHAR(255) NULL',
        'nota': 'TEXT NULL',
        'intermediario': 'VARCHAR(120) NULL',
        'comision_defecto': 'DECIMAL(5, 2) NULL',
    },
}


def migrar(conn):
    hechos = []
    for tabla, columnas in NUEVAS.items():
        existentes = _columnas(conn, tabla)
        for col, tipo in columnas.items():
            if col not in existentes:
                conn.execute(text(f'ALTER TABLE {tabla} ADD COLUMN {col} {tipo}'))
                hechos.append(f'{tabla}.{col}')

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS hojas_ruta (
            evento_id INT PRIMARY KEY,
            contenido MEDIUMTEXT NOT NULL,
            version INT NOT NULL DEFAULT 0,
            cambios_sin_enviar TINYINT(1) NOT NULL DEFAULT 1,
            updated_at DATETIME NULL,
            updated_by_id INT NULL,
            created_at DATETIME NULL,
            CONSTRAINT fk_hojas_ruta_evento FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
            CONSTRAINT fk_hojas_ruta_usuario FOREIGN KEY (updated_by_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )"""))
    hechos.append('hojas_ruta')

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS hoja_ruta_versiones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            evento_id INT NOT NULL,
            version INT NOT NULL,
            contenido MEDIUMTEXT NOT NULL,
            cambios TEXT NULL,
            nota TEXT NULL,
            enviada_por_id INT NULL,
            created_at DATETIME NULL,
            INDEX ix_hoja_ruta_versiones_evento_id (evento_id),
            CONSTRAINT fk_hr_versiones_evento FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
            CONSTRAINT fk_hr_versiones_usuario FOREIGN KEY (enviada_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )"""))
    hechos.append('hoja_ruta_versiones')
    return hechos
