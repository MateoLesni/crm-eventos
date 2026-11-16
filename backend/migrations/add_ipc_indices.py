"""
Crea la tabla ipc_indices (IPC INDEC por mes). Idempotente.
Uso: migrar(conn) con una conexión SQLAlchemy a la base.
"""
from sqlalchemy import text


def migrar(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ipc_indices (
            periodo DATE NOT NULL PRIMARY KEY,
            valor DECIMAL(14, 4) NOT NULL,
            actualizado_at DATETIME NULL
        )
    """))
    return ['ipc_indices']
