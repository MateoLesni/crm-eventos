from flask import Blueprint, request, jsonify, current_app
from app import db
from app.models import Usuario
import jwt
from datetime import datetime, timedelta
from functools import wraps

auth_bp = Blueprint('auth', __name__)

def create_token(user_id, user_rol):
    payload = {
        'user_id': user_id,
        'user_rol': user_rol,
        'exp': datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256')

def get_current_user_from_token():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None

    token = auth_header.split(' ')[1]
    try:
        payload = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
        return Usuario.query.get(payload['user_id'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user_from_token()
        if not user:
            return jsonify({'error': 'No autenticado'}), 401
        return f(*args, **kwargs)
    return decorated

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email y contraseña requeridos'}), 400

    usuario = Usuario.query.filter_by(email=email, activo=True).first()

    if not usuario or not usuario.check_password(password):
        return jsonify({'error': 'Credenciales inválidas'}), 401

    token = create_token(usuario.id, usuario.rol)

    return jsonify({
        'message': 'Login exitoso',
        'usuario': usuario.to_dict(),
        'token': token
    })

@auth_bp.route('/logout', methods=['POST'])
def logout():
    return jsonify({'message': 'Logout exitoso'})

@auth_bp.route('/me', methods=['GET'])
def me():
    user = get_current_user_from_token()
    if not user:
        return jsonify({'error': 'No autenticado'}), 401

    return jsonify({'usuario': user.to_dict()})
