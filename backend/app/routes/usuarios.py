from flask import Blueprint, request, jsonify
from app import db
from app.models import Usuario

usuarios_bp = Blueprint('usuarios', __name__)

# GET /api/usuarios - Listar usuarios (para asignación)
@usuarios_bp.route('', methods=['GET'])
def listar_usuarios():
    rol = request.args.get('rol')  # Filtrar por rol

    query = Usuario.query.filter_by(activo=True)
    if rol:
        query = query.filter_by(rol=rol)

    usuarios = query.all()
    return jsonify({
        'usuarios': [u.to_dict() for u in usuarios]
    })

# POST /api/usuarios - Crear usuario (solo admin)
@usuarios_bp.route('', methods=['POST'])
def crear_usuario():
    data = request.get_json()

    if Usuario.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email ya existe'}), 400

    usuario = Usuario(
        nombre=data['nombre'],
        email=data['email'],
        rol=data.get('rol', 'comercial'),
        telefono=data.get('telefono') or None
    )
    usuario.set_password(data['password'])

    db.session.add(usuario)
    db.session.commit()

    return jsonify({
        'message': 'Usuario creado',
        'usuario': usuario.to_dict()
    }), 201

# PUT /api/usuarios/:id - Actualizar usuario (nombre, telefono, rol, activo)
@usuarios_bp.route('/<int:id>', methods=['PUT'])
def actualizar_usuario(id):
    usuario = Usuario.query.get_or_404(id)
    data = request.get_json()

    if 'nombre' in data:
        usuario.nombre = data['nombre']
    if 'telefono' in data:
        usuario.telefono = data['telefono'] or None
    if 'rol' in data:
        usuario.rol = data['rol']
    if 'activo' in data:
        usuario.activo = bool(data['activo'])
    if data.get('password'):
        usuario.set_password(data['password'])

    db.session.commit()

    return jsonify({
        'message': 'Usuario actualizado',
        'usuario': usuario.to_dict()
    })
