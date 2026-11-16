"""
Pre-check v2: catálogo de precios, sectores por local, cabecera con estados,
historial de cambios y columnas nuevas en conceptos/adicionales. Idempotente.
Uso: migrar(conn) con una conexión SQLAlchemy (MySQL).
"""
from sqlalchemy import text


def _columnas(conn, tabla):
    filas = conn.execute(text(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t"), {'t': tabla})
    return {f[0] for f in filas}


def migrar(conn):
    hechos = []

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS local_sectores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            local_id INT NOT NULL,
            nombre VARCHAR(100) NOT NULL,
            pax_min INT NULL,
            pax_max INT NULL,
            precio_exclusividad DECIMAL(14, 2) NULL,
            observaciones TEXT NULL,
            activo TINYINT(1) NOT NULL DEFAULT 1,
            orden INT NOT NULL DEFAULT 0,
            updated_at DATETIME NULL,
            INDEX ix_local_sectores_local_id (local_id),
            CONSTRAINT fk_local_sectores_local FOREIGN KEY (local_id) REFERENCES locales(id) ON DELETE CASCADE
        )"""))
    hechos.append('local_sectores')

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS catalogo_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            local_id INT NULL,
            categoria VARCHAR(50) NOT NULL,
            nombre VARCHAR(200) NOT NULL,
            descripcion TEXT NULL,
            modalidad VARCHAR(20) NOT NULL DEFAULT 'por_persona',
            precio DECIMAL(14, 2) NOT NULL,
            ajusta_ipc TINYINT(1) NOT NULL DEFAULT 1,
            activo TINYINT(1) NOT NULL DEFAULT 1,
            orden INT NOT NULL DEFAULT 0,
            updated_at DATETIME NULL,
            updated_by_id INT NULL,
            INDEX ix_catalogo_items_local_id (local_id),
            CONSTRAINT fk_catalogo_items_local FOREIGN KEY (local_id) REFERENCES locales(id) ON DELETE CASCADE,
            CONSTRAINT fk_catalogo_items_usuario FOREIGN KEY (updated_by_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )"""))
    hechos.append('catalogo_items')

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS precheck_config (
            clave VARCHAR(60) PRIMARY KEY,
            valor TEXT NULL,
            updated_at DATETIME NULL,
            updated_by_id INT NULL,
            CONSTRAINT fk_precheck_config_usuario FOREIGN KEY (updated_by_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )"""))
    hechos.append('precheck_config')

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS prechecks (
            evento_id INT PRIMARY KEY,
            sector_id INT NULL,
            motivo VARCHAR(200) NULL,
            razon_social VARCHAR(200) NULL,
            propina_porcentaje DECIMAL(5, 2) NOT NULL DEFAULT 0,
            sena_porcentaje DECIMAL(5, 2) NULL,
            dias_saldo_antes_evento INT NULL,
            ipc_activo TINYINT(1) NOT NULL DEFAULT 0,
            estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
            modificado_post_aprobacion TINYINT(1) NOT NULL DEFAULT 0,
            enviado_revision_at DATETIME NULL,
            enviado_revision_por_id INT NULL,
            aprobado_at DATETIME NULL,
            aprobado_por_id INT NULL,
            cerrado_at DATETIME NULL,
            cerrado_por_id INT NULL,
            monto_final DECIMAL(14, 2) NULL,
            saldo_al_cierre DECIMAL(14, 2) NULL,
            created_at DATETIME NULL,
            updated_at DATETIME NULL,
            INDEX ix_prechecks_estado (estado),
            CONSTRAINT fk_prechecks_evento FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
            CONSTRAINT fk_prechecks_sector FOREIGN KEY (sector_id) REFERENCES local_sectores(id) ON DELETE SET NULL,
            CONSTRAINT fk_prechecks_enviado FOREIGN KEY (enviado_revision_por_id) REFERENCES usuarios(id) ON DELETE SET NULL,
            CONSTRAINT fk_prechecks_aprobado FOREIGN KEY (aprobado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL,
            CONSTRAINT fk_prechecks_cerrado FOREIGN KEY (cerrado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )"""))
    hechos.append('prechecks')

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS precheck_historial (
            id INT AUTO_INCREMENT PRIMARY KEY,
            evento_id INT NULL,
            usuario_id INT NULL,
            accion VARCHAR(60) NOT NULL,
            detalle TEXT NULL,
            created_at DATETIME NULL,
            INDEX ix_precheck_historial_evento_id (evento_id),
            INDEX ix_precheck_historial_created_at (created_at),
            CONSTRAINT fk_precheck_historial_evento FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
            CONSTRAINT fk_precheck_historial_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )"""))
    hechos.append('precheck_historial')

    cols = _columnas(conn, 'precheck_conceptos')
    nuevas = {
        'observaciones': 'TEXT NULL',
        'catalogo_item_id': 'INT NULL',
        'modalidad': 'VARCHAR(20) NULL',
        'precio_lista': 'DECIMAL(12, 2) NULL',
        'ajusta_ipc': 'TINYINT(1) NOT NULL DEFAULT 1',
        'es_ajuste_ipc': 'TINYINT(1) NOT NULL DEFAULT 0',
        'ipc_periodo_desde': 'VARCHAR(7) NULL',
        'ipc_periodo_hasta': 'VARCHAR(7) NULL',
        'ipc_porcentaje_indec': 'DECIMAL(8, 4) NULL',
        'ipc_porcentaje_aplicado': 'DECIMAL(8, 4) NULL',
        'ipc_motivo': 'TEXT NULL',
        'ipc_aplicado_por_id': 'INT NULL',
    }
    for col, tipo in nuevas.items():
        if col not in cols:
            conn.execute(text(f'ALTER TABLE precheck_conceptos ADD COLUMN {col} {tipo}'))
            hechos.append(f'precheck_conceptos.{col}')
    if 'catalogo_item_id' not in cols:
        conn.execute(text('ALTER TABLE precheck_conceptos ADD CONSTRAINT fk_conceptos_catalogo '
                          'FOREIGN KEY (catalogo_item_id) REFERENCES catalogo_items(id) ON DELETE SET NULL'))

    if 'observaciones' not in _columnas(conn, 'precheck_adicionales'):
        conn.execute(text('ALTER TABLE precheck_adicionales ADD COLUMN observaciones TEXT NULL'))
        hechos.append('precheck_adicionales.observaciones')

    return hechos
