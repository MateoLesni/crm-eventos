from flask import Blueprint, request, jsonify, session
from app import db
from app.models import Usuario

auth_bp = Blueprint('auth', __name__)

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

    session['user_id'] = usuario.id
    session['user_rol'] = usuario.rol

    return jsonify({
        'message': 'Login exitoso',
        'usuario': usuario.to_dict()
    })

@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logout exitoso'})

@auth_bp.route('/me', methods=['GET'])
def me():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'No autenticado'}), 401

    usuario = Usuario.query.get(user_id)
    if not usuario:
        return jsonify({'error': 'Usuario no encontrado'}), 404

    return jsonify({'usuario': usuario.to_dict()})
