"""
Migración: identificación de clientes, origen de leads, agencia y presupuestos adjuntos.

- clientes.telefono_normalizado (+ índice) y relleno con los últimos 10 dígitos
- clientes.es_agencia
- eventos.url_origen, utm_campaign, utm_medium, utm_content
- tabla evento_archivos (presupuestos adjuntos)

Idempotente: se puede correr más de una vez. Solo agrega columnas que aceptan vacío,
así que es compatible con la versión anterior del backend.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.utils.telefono import normalizar_telefono

COLUMNAS = [
    ('clientes', 'telefono_normalizado', 'VARCHAR(20) NULL'),
    ('clientes', 'es_agencia', 'TINYINT(1) NOT NULL DEFAULT 0'),
    ('eventos', 'url_origen', 'VARCHAR(600) NULL'),
    ('eventos', 'utm_campaign', 'VARCHAR(150) NULL'),
    ('eventos', 'utm_medium', 'VARCHAR(50) NULL'),
    ('eventos', 'utm_content', 'VARCHAR(200) NULL'),
]


def columnas_existentes(conn, tabla):
    filas = conn.execute(text(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t"), {'t': tabla})
    return {f[0] for f in filas}


def indice_existe(conn, tabla, indice):
    return conn.execute(text(
        "SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND INDEX_NAME = :i"),
        {'t': tabla, 'i': indice}).first() is not None


def migrar(conn):
    for tabla, columna, tipo in COLUMNAS:
        if columna in columnas_existentes(conn, tabla):
            print(f'[-] {tabla}.{columna} ya existe')
        else:
            conn.execute(text(f'ALTER TABLE {tabla} ADD COLUMN {columna} {tipo}'))
            print(f'[OK] {tabla}.{columna} agregada')

    if indice_existe(conn, 'clientes', 'idx_clientes_telefono_normalizado'):
        print('[-] índice de teléfono normalizado ya existe')
    else:
        conn.execute(text('CREATE INDEX idx_clientes_telefono_normalizado ON clientes(telefono_normalizado)'))
        print('[OK] índice de teléfono normalizado creado')

    existe_tabla = conn.execute(text(
        "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'evento_archivos'")).first()
    if existe_tabla:
        print('[-] tabla evento_archivos ya existe')
    else:
        conn.execute(text("""
            CREATE TABLE evento_archivos (
                id INT PRIMARY KEY AUTO_INCREMENT,
                evento_id INT NOT NULL,
                tipo VARCHAR(30) NOT NULL DEFAULT 'presupuesto',
                blob_path VARCHAR(300) NOT NULL,
                nombre_original VARCHAR(255) NOT NULL,
                content_type VARCHAR(120),
                tamano_bytes INT,
                subido_por_id INT,
                created_at DATETIME,
                FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
                FOREIGN KEY (subido_por_id) REFERENCES usuarios(id) ON DELETE SET NULL,
                INDEX idx_evento_archivos_evento (evento_id)
            )
        """))
        print('[OK] tabla evento_archivos creada')

    # Relleno del teléfono normalizado (no toca el teléfono original)
    clientes = conn.execute(text('SELECT id, telefono, telefono_normalizado FROM clientes')).fetchall()
    cambios = [(normalizar_telefono(tel), cid) for cid, tel, actual in clientes if normalizar_telefono(tel) != actual]
    for i in range(0, len(cambios), 500):
        conn.execute(text('UPDATE clientes SET telefono_normalizado = :n WHERE id = :id'),
                     [{'n': n, 'id': cid} for n, cid in cambios[i:i + 500]])
    con_tel = sum(1 for _, tel, _ in clientes if normalizar_telefono(tel))
    print(f'[OK] teléfono normalizado: {len(cambios)} clientes actualizados ({con_tel} de {len(clientes)} tienen teléfono utilizable)')


if __name__ == '__main__':
    from app import create_app, db
    app = create_app()
    with app.app_context():
        with db.engine.begin() as conn:
            migrar(conn)
    print('\nMigración completada.')
