"""
Migracion: WhatsApp multi-vendedor
- Agregar columna 'telefono' a tabla usuarios
- Agregar columna 'usuario_id' a tabla conversaciones
- Pre-cargar telefonos de vendedores conocidos
- Vincular conversaciones existentes con usuarios
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app, db
from sqlalchemy import text

app = create_app()

with app.app_context():
    with db.engine.connect() as conn:
        # 1. Agregar telefono a usuarios
        result = conn.execute(text(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' "
            "AND COLUMN_NAME = 'telefono'"
        ))
        if not result.fetchone():
            conn.execute(text("ALTER TABLE usuarios ADD COLUMN telefono VARCHAR(30)"))
            print("[OK] Columna 'telefono' agregada a usuarios")
        else:
            print("[-] Columna 'telefono' ya existe en usuarios")

        # 2. Agregar usuario_id a conversaciones
        result = conn.execute(text(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversaciones' "
            "AND COLUMN_NAME = 'usuario_id'"
        ))
        if not result.fetchone():
            conn.execute(text(
                "ALTER TABLE conversaciones ADD COLUMN usuario_id INT, "
                "ADD INDEX idx_conversaciones_usuario_id (usuario_id)"
            ))
            print("[OK] Columna 'usuario_id' agregada a conversaciones")
        else:
            print("[-] Columna 'usuario_id' ya existe en conversaciones")

        # 3. Pre-cargar telefonos de vendedores conocidos
        telefonos = {
            5: '5491122905495',   # Juana
            3: '5491140504258',   # Delfina Herrera
        }
        for user_id, telefono in telefonos.items():
            conn.execute(text(
                "UPDATE usuarios SET telefono = :telefono WHERE id = :id AND (telefono IS NULL OR telefono = '')"
            ), {'telefono': telefono, 'id': user_id})
        print("[OK] Telefonos de vendedores actualizados")

        # 4. Vincular conversaciones existentes con usuarios por instancia_nombre
        instancia_usuario = {
            'vendedora_juana': 5,
            'vendedora_delfina': 3,
        }
        for instancia, user_id in instancia_usuario.items():
            result = conn.execute(text(
                "UPDATE conversaciones SET usuario_id = :user_id "
                "WHERE instancia_nombre = :instancia AND (usuario_id IS NULL)"
            ), {'user_id': user_id, 'instancia': instancia})
            print(f"[OK] Conversaciones de '{instancia}' vinculadas a usuario {user_id} ({result.rowcount} filas)")

        conn.commit()
        print("Migracion completada.")
