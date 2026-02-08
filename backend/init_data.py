"""
Script para inicializar datos básicos después de recrear las tablas.
Ejecutar una sola vez: python init_data.py
"""
from app import create_app, db
from app.models import Local, Usuario

app = create_app()

with app.app_context():
    # Verificar si ya hay datos
    if Local.query.first():
        print("Ya existen locales. Abortando para no duplicar.")
    else:
        # Crear locales
        locales = [
            Local(id=1, nombre='Costa 7070', color='#1a5276', activo=True),
            Local(id=2, nombre='Kona', color='#2e7d32', activo=True),
            Local(id=3, nombre='MilVidas', color='#6a1b9a', activo=True),
            Local(id=4, nombre='CoChinChina', color='#c62828', activo=True),
            Local(id=5, nombre='Cruza Polo', color='#00695c', activo=True),
            Local(id=6, nombre='Cruza Recoleta', color='#4527a0', activo=True),
        ]

        for local in locales:
            db.session.add(local)

        db.session.commit()
        print(f"Creados {len(locales)} locales.")

    # Crear usuario admin si no existe
    admin = Usuario.query.filter_by(email='admin@nuevogastro.com').first()
    if admin:
        print("Usuario admin ya existe.")
    else:
        admin = Usuario(
            nombre='Administrador',
            email='admin@nuevogastro.com',
            rol='admin',
            activo=True
        )
        admin.set_password('admin123')  # Cambiar después del primer login
        db.session.add(admin)
        db.session.commit()
        print("Usuario admin creado: admin@nuevogastro.com / admin123")

    print("\nDatos iniciales creados correctamente.")
    print("IMPORTANTE: Cambia la contraseña del admin después del primer login.")
