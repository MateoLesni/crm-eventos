from flask import Blueprint, request, jsonify
from app import db
from app.models import Cliente

clientes_bp = Blueprint('clientes', __name__)

# GET /api/clientes - Listar clientes
@clientes_bp.route('', methods=['GET'])
def listar_clientes():
    clientes = Cliente.query.order_by(Cliente.created_at.desc()).all()
    return jsonify({
        'clientes': [c.to_dict() for c in clientes]
    })

# GET /api/clientes/:id - Detalle de cliente con sus eventos
@clientes_bp.route('/<int:id>', methods=['GET'])
def obtener_cliente(id):
    cliente = Cliente.query.get_or_404(id)
    eventos = [e.to_dict() for e in cliente.eventos.order_by(db.desc('created_at')).all()]

    return jsonify({
        'cliente': cliente.to_dict(),
        'eventos': eventos
    })

# GET /api/clientes/buscar/:telefono - Buscar por teléfono
@clientes_bp.route('/buscar/<telefono>', methods=['GET'])
def buscar_por_telefono(telefono):
    cliente = Cliente.query.filter_by(telefono=telefono).first()

    if not cliente:
        return jsonify({'encontrado': False})

    return jsonify({
        'encontrado': True,
        'cliente': cliente.to_dict()
    })

# PUT /api/clientes/:id - Actualizar cliente
@clientes_bp.route('/<int:id>', methods=['PUT'])
def actualizar_cliente(id):
    cliente = Cliente.query.get_or_404(id)
    data = request.get_json()

    campos = ['nombre', 'email', 'empresa', 'notas']
    for campo in campos:
        if campo in data:
            setattr(cliente, campo, data[campo])

    db.session.commit()

    return jsonify({
        'message': 'Cliente actualizado',
        'cliente': cliente.to_dict()
    })
