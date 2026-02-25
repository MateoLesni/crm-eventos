from app import create_app, db
from app.models import Usuario, Local

app = create_app()

# Crear datos iniciales
def init_db():
    with app.app_context():
        # Crear locales
        locales_data = [
            {'nombre': 'Costa7070', 'color': 'azul'},
            {'nombre': 'Kona', 'color': 'verde'},
            {'nombre': 'MilVidas', 'color': 'amarillo'},
            {'nombre': 'CoChinChina', 'color': 'violeta'},
            {'nombre': 'Cruza Polo', 'color': 'rojo'},
            {'nombre': 'Cruza Recoleta', 'color': 'rosa'},
            {'nombre': 'La Mala', 'color': 'naranja'},
        ]

        for local_data in locales_data:
            if not Local.query.filter_by(nombre=local_data['nombre']).first():
                db.session.add(Local(**local_data))

        # Crear usuarios iniciales
        usuarios_data = [
            {'nombre': 'Pilar Toca', 'email': 'eventos@nuevogastro.com', 'rol': 'admin', 'password': 'admin123'},
            {'nombre': 'Traianna Rosas', 'email': 'comercial1@nuevogastro.com', 'rol': 'comercial', 'password': 'comercial123'},
            {'nombre': 'Delfina Herrera Paz', 'email': 'comercial2@nuevogastro.com', 'rol': 'comercial', 'password': 'comercial123'},
            {'nombre': 'Johanna Gatti', 'email': 'comercial3@nuevogastro.com', 'rol': 'comercial', 'password': 'comercial123'},
            {'nombre': 'Valentina Cousteix', 'email': 'comercial4@nuevogastro.com', 'rol': 'comercial', 'password': 'comercial123'},
            {'nombre': 'Reservas Múltiples', 'email': 'reservasmultiples@opgroup.com.ar', 'rol': 'comercial', 'password': 'comercial123'},
            {'nombre': 'Tano', 'email': 'augustoniro91@gmail.com', 'rol': 'admin', 'password': 'tano2024'},
        ]

        for user_data in usuarios_data:
            if not Usuario.query.filter_by(email=user_data['email']).first():
                user = Usuario(
                    nombre=user_data['nombre'],
                    email=user_data['email'],
                    rol=user_data['rol']
                )
                user.set_password(user_data['password'])
                db.session.add(user)

        db.session.commit()
        print("Base de datos inicializada con locales y usuarios")

if __name__ == '__main__':
    import sys
    if '--init-db' in sys.argv:
        init_db()
    app.run(debug=True, port=5000)
