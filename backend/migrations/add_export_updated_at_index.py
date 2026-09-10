"""
Migración: soporte para API de export (dashboard externo)
- Asegurar columna updated_at en eventos (el modelo la tiene, pero tablas viejas pueden no tenerla)
- Backfill de updated_at con created_at
- Índice sobre updated_at para consultas incrementales (updated_since)
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app, db
from sqlalchemy import text

app = create_app()

with app.app_context():
    with db.engine.connect() as conn:
        # 1. Asegurar columna updated_at
        result = conn.execute(text(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'eventos' "
            "AND COLUMN_NAME = 'updated_at'"
        ))
        existing = [row[0] for row in result]

        if 'updated_at' not in existing:
            conn.execute(text("ALTER TABLE eventos ADD COLUMN updated_at DATETIME"))
            print("[OK] Columna 'updated_at' agregada a eventos")
        else:
            print("[-] Columna 'updated_at' ya existe")

        # 2. Backfill con created_at donde esté vacía
        conn.execute(text(
            "UPDATE eventos SET updated_at = created_at WHERE updated_at IS NULL"
        ))
        print("[OK] Backfill de updated_at con created_at")

        # 3. Índice para consultas incrementales del export
        try:
            conn.execute(text(
                "CREATE INDEX idx_eventos_updated_at ON eventos(updated_at)"
            ))
            print("[OK] Índice idx_eventos_updated_at creado")
        except Exception:
            print("[-] Índice idx_eventos_updated_at ya existe")

        conn.commit()
        print("\nMigración de export completada.")
