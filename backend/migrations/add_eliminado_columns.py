"""
Migración: Agregar columnas para estado ELIMINADO
- motivo_eliminacion (TEXT)
- estado_pre_eliminacion (VARCHAR(30))
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app, db
from sqlalchemy import text

app = create_app()

with app.app_context():
    with db.engine.connect() as conn:
        # Verificar si las columnas ya existen
        result = conn.execute(text(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'eventos' "
            "AND COLUMN_NAME IN ('motivo_eliminacion', 'estado_pre_eliminacion')"
        ))
        existing = [row[0] for row in result]

        if 'motivo_eliminacion' not in existing:
            conn.execute(text("ALTER TABLE eventos ADD COLUMN motivo_eliminacion TEXT"))
            print("[OK] Columna 'motivo_eliminacion' agregada")
        else:
            print("[-] Columna 'motivo_eliminacion' ya existe")

        if 'estado_pre_eliminacion' not in existing:
            conn.execute(text("ALTER TABLE eventos ADD COLUMN estado_pre_eliminacion VARCHAR(30)"))
            print("[OK] Columna 'estado_pre_eliminacion' agregada")
        else:
            print("[-] Columna 'estado_pre_eliminacion' ya existe")

        conn.commit()
        print("Migracion completada.")
