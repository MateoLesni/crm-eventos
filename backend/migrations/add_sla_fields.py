"""
Migración: Agregar campos para sistema SLA de alertas
- fecha_ultimo_cambio_estado en eventos (campo denormalizado para cálculo rápido)
- Tabla sla_violations (historial de violaciones críticas para informes CEO)
- Backfill: tomar última transición de cada evento
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app, db
from sqlalchemy import text

app = create_app()

with app.app_context():
    with db.engine.connect() as conn:
        # 1. Agregar columna fecha_ultimo_cambio_estado a eventos
        result = conn.execute(text(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'eventos' "
            "AND COLUMN_NAME = 'fecha_ultimo_cambio_estado'"
        ))
        existing = [row[0] for row in result]

        if 'fecha_ultimo_cambio_estado' not in existing:
            conn.execute(text("ALTER TABLE eventos ADD COLUMN fecha_ultimo_cambio_estado DATETIME"))
            print("[OK] Columna 'fecha_ultimo_cambio_estado' agregada a eventos")
        else:
            print("[-] Columna 'fecha_ultimo_cambio_estado' ya existe")

        # 2. Backfill: tomar la última transición de cada evento
        try:
            conn.execute(text("""
                UPDATE eventos e
                JOIN (
                    SELECT evento_id, MAX(created_at) as ultima
                    FROM evento_transiciones
                    GROUP BY evento_id
                ) t ON e.id = t.evento_id
                SET e.fecha_ultimo_cambio_estado = t.ultima
                WHERE e.fecha_ultimo_cambio_estado IS NULL
            """))
            print("[OK] Backfill desde evento_transiciones completado")
        except Exception as ex:
            print(f"[WARN] Backfill desde transiciones: {ex}")

        # 3. Eventos sin transiciones: usar created_at
        conn.execute(text("""
            UPDATE eventos
            SET fecha_ultimo_cambio_estado = created_at
            WHERE fecha_ultimo_cambio_estado IS NULL
        """))
        print("[OK] Backfill fallback con created_at completado")

        # 4. Crear tabla sla_violations si no existe
        result = conn.execute(text(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sla_violations'"
        ))
        if not result.fetchone():
            conn.execute(text("""
                CREATE TABLE sla_violations (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    evento_id INT NOT NULL,
                    estado VARCHAR(30) NOT NULL,
                    comercial_id INT,
                    comercial_nombre VARCHAR(100),
                    fecha_violacion DATETIME NOT NULL,
                    segundos_transcurridos INT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
                    FOREIGN KEY (comercial_id) REFERENCES usuarios(id) ON DELETE SET NULL,
                    INDEX idx_sla_evento (evento_id),
                    INDEX idx_sla_fecha (fecha_violacion),
                    INDEX idx_sla_comercial (comercial_id)
                )
            """))
            print("[OK] Tabla 'sla_violations' creada")
        else:
            print("[-] Tabla 'sla_violations' ya existe")

        # 5. Índice compuesto para queries SLA rápidas
        try:
            conn.execute(text(
                "CREATE INDEX idx_eventos_estado_sla ON eventos(estado, fecha_ultimo_cambio_estado)"
            ))
            print("[OK] Índice idx_eventos_estado_sla creado")
        except Exception:
            print("[-] Índice idx_eventos_estado_sla ya existe")

        conn.commit()
        print("\nMigración SLA completada exitosamente.")
