"""
Script para agregar el usuario Tano (dueño) a la base de datos.
Ejecutar una sola vez: python agregar_tano.py
"""
from app import create_app, db
from app.models import Usuario

app = create_app()

with app.app_context():
    # Verificar si ya existe
    tano = Usuario.query.filter_by(email='tano@opgroup.com.ar').first()

    if tano:
        print(f"Usuario Tano ya existe con ID: {tano.id}")
    else:
        # Crear el usuario Tano
        tano = Usuario(
            nombre='Tano',
            email='tano@opgroup.com.ar',
            rol='admin'  # Dueño = admin
        )
        tano.set_password('tano2024')  # Contraseña temporal, cambiar después

        db.session.add(tano)
        db.session.commit()

        print(f"Usuario Tano creado exitosamente con ID: {tano.id}")

    # Mostrar todos los usuarios actuales
    print("\n--- Usuarios actuales ---")
    for u in Usuario.query.all():
        print(f"ID: {u.id}, Nombre: {u.nombre}, Email: {u.email}, Rol: {u.rol}")
