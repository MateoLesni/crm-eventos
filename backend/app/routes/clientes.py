from flask import Blueprint, request, jsonify
from sqlalchemy import or_
from app import db
from app.models import Cliente
from app.utils.clientes import buscar_cliente, resumen_recurrencia
from app.utils.seguridad import login_requerido, servicio_o_login
from app.utils.telefono import normalizar_telefono

clientes_bp = Blueprint('clientes', __name__)

# GET /api/clientes - Listar clientes
@clientes_bp.route('', methods=['GET'])
@login_requerido
def listar_clientes():
    clientes = Cliente.query.order_by(Cliente.created_at.desc()).all()
    return jsonify({
        'clientes': [c.to_dict() for c in clientes]
    })

# GET /api/clientes/:id - Detalle de cliente con sus eventos
@clientes_bp.route('/<int:id>', methods=['GET'])
@login_requerido
def obtener_cliente(id):
    cliente = Cliente.query.get_or_404(id)
    eventos = [e.to_dict(include_counts=True) for e in cliente.eventos.order_by(db.desc('created_at')).all()]

    return jsonify({
        'cliente': cliente.to_dict(),
        'eventos': eventos
    })

# GET /api/clientes/buscar/:telefono - Buscar por teléfono
@clientes_bp.route('/buscar/<telefono>', methods=['GET'])
@servicio_o_login
def buscar_por_telefono(telefono):
    """Acepta teléfono en cualquier formato (549..., +54 9 ..., 11 4421-0966) o un mail."""
    valor = telefono.strip()
    if '@' in valor:
        cliente = buscar_cliente(email=valor)
    else:
        cliente = buscar_cliente(telefono=valor)

    if not cliente:
        return jsonify({'encontrado': False})

    datos = cliente.to_dict()
    info = resumen_recurrencia({cliente.id}).get(cliente.id)
    if info:
        # Cuenta también las fichas duplicadas del mismo cliente
        datos['cantidad_eventos'] = info['cantidad_eventos']
        datos['es_cliente_recurrente'] = info['es_cliente_recurrente']
        if info['comercial_preferido']:
            datos['comercial_preferido'] = info['comercial_preferido']['nombre']
            datos['comercial_preferido_id'] = info['comercial_preferido']['id']

    return jsonify({
        'encontrado': True,
        'cliente': datos
    })

# PUT /api/clientes/:id - Actualizar cliente
@clientes_bp.route('/<int:id>', methods=['PUT'])
@login_requerido
def actualizar_cliente(id):
    cliente = Cliente.query.get_or_404(id)
    data = request.get_json()

    # Validar que venga al menos nombre
    if 'nombre' in data and not data['nombre']:
        return jsonify({'error': 'El nombre es requerido'}), 400

    # Validar que tenga al menos teléfono o email
    telefono_nuevo = data.get('telefono', cliente.telefono)
    email_nuevo = data.get('email', cliente.email)

    # Si el teléfono actual es del formato "email:xxx", permitir actualizarlo
    if telefono_nuevo and telefono_nuevo.startswith('email:'):
        telefono_nuevo = None  # Tratar como si no tuviera teléfono

    if not telefono_nuevo and not email_nuevo:
        return jsonify({'error': 'Se requiere al menos teléfono o email'}), 400

    # Actualizar teléfono si viene y es válido
    if 'telefono' in data and data['telefono']:
        # Verificar que no exista otro cliente con ese teléfono
        mismo_telefono = [Cliente.telefono == data['telefono']]
        tel_normalizado = normalizar_telefono(data['telefono'])
        if tel_normalizado:
            mismo_telefono.append(Cliente.telefono_normalizado == tel_normalizado)
        telefono_existente = Cliente.query.filter(or_(*mismo_telefono), Cliente.id != id).first()
        if telefono_existente:
            return jsonify({'error': 'Ya existe otro cliente con ese teléfono'}), 400
        cliente.telefono = data['telefono']

    # Actualizar otros campos
    campos = ['nombre', 'email', 'empresa', 'notas']
    for campo in campos:
        if campo in data:
            setattr(cliente, campo, data[campo])
    if 'es_agencia' in data:
        cliente.es_agencia = bool(data['es_agencia'])

    db.session.commit()

    return jsonify({
        'message': 'Cliente actualizado',
        'cliente': cliente.to_dict()
    })
