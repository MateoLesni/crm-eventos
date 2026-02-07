from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from app.config import Config

db = SQLAlchemy()

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # CORS dinámico desde variable de entorno
    CORS(app, origins=Config.CORS_ORIGINS, supports_credentials=True)
    db.init_app(app)

    # Registrar blueprints
    from app.routes.auth import auth_bp
    from app.routes.eventos import eventos_bp
    from app.routes.clientes import clientes_bp
    from app.routes.usuarios import usuarios_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(eventos_bp, url_prefix='/api/eventos')
    app.register_blueprint(clientes_bp, url_prefix='/api/clientes')
    app.register_blueprint(usuarios_bp, url_prefix='/api/usuarios')

    # Crear tablas
    with app.app_context():
        db.create_all()

    return app
