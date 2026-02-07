from flask import Blueprint, request, jsonify, session
from app import db
from app.models import Evento, Cliente, Actividad, Usuario, Local
from datetime import datetime

eventos_bp = Blueprint('eventos', __name__)

# Prioridad de estados (mayor número = mayor prioridad)
ESTADO_PRIORIDAD = {
    'CONSULTA_ENTRANTE': 1,
    'ASIGNADO': 2,
    'CONTACTADO': 3,
    'COTIZADO': 4,
    'CONFIRMADO': 5,
    'RECHAZADO': 5,
}

def get_current_user():
    user_id = session.get('user_id')
    if user_id:
        return Usuario.query.get(user_id)
    return None

def calcular_estado_automatico(evento):
    """
    Calcula el estado que debería tener el evento basado en sus datos.
    Solo sube de estado, nunca baja (excepto CONFIRMADO/RECHAZADO que son manuales).
    """
    estado_actual = evento.estado
    prioridad_actual = ESTADO_PRIORIDAD.get(estado_actual, 1)

    # Si está en estado final (CONFIRMADO/RECHAZADO), no cambiar automáticamente
    if estado_actual in ['CONFIRMADO', 'RECHAZADO']:
        return estado_actual

    # Determinar el estado que corresponde según los datos
    nuevo_estado = 'CONSULTA_ENTRANTE'

    if evento.comercial_id:
        nuevo_estado = 'ASIGNADO'

    if evento.horario_inicio or evento.horario_fin:
        if ESTADO_PRIORIDAD['CONTACTADO'] > ESTADO_PRIORIDAD.get(nuevo_estado, 1):
            nuevo_estado = 'CONTACTADO'

    if evento.presupuesto:
        if ESTADO_PRIORIDAD['COTIZADO'] > ESTADO_PRIORIDAD.get(nuevo_estado, 1):
            nuevo_estado = 'COTIZADO'

    # Solo subir de estado, nunca bajar
    if ESTADO_PRIORIDAD.get(nuevo_estado, 1) > prioridad_actual:
        return nuevo_estado

    return estado_actual

# GET /api/eventos - Listar eventos (Kanban)
@eventos_bp.route('', methods=['GET'])
def listar_eventos():
    user = get_current_user()

    # Filtros opcionales
    estado = request.args.get('estado')
    comercial_id = request.args.get('comercial_id')
    local_id = request.args.get('local_id')

    query = Evento.query

    # Si es comercial, solo ve sus eventos
    if user and user.rol == 'comercial':
        query = query.filter_by(comercial_id=user.id)
    elif comercial_id:
        query = query.filter_by(comercial_id=comercial_id)

    if estado:
        query = query.filter_by(estado=estado)
    if local_id:
        query = query.filter_by(local_id=local_id)

    eventos = query.order_by(Evento.created_at.desc()).all()

    # Agrupar por estado para el Kanban
    kanban = {
        'CONSULTA_ENTRANTE': [],
        'ASIGNADO': [],
        'CONTACTADO': [],
        'COTIZADO': [],
        'CONFIRMADO': [],
        'RECHAZADO': []
    }

    for evento in eventos:
        estado = evento.estado
        if estado in kanban:
            kanban[estado].append(evento.to_dict())

    # Calcular totales por columna
    totales = {}
    for estado, lista in kanban.items():
        totales[estado] = {
            'cantidad': len(lista),
            'monto': sum(e['presupuesto'] or 0 for e in lista)
        }

    return jsonify({
        'kanban': kanban,
        'totales': totales
    })

# GET /api/eventos/:id - Detalle de un evento
@eventos_bp.route('/<int:id>', methods=['GET'])
def obtener_evento(id):
    evento = Evento.query.get_or_404(id)
    actividades = [a.to_dict() for a in evento.actividades.all()]

    return jsonify({
        'evento': evento.to_dict(),
        'actividades': actividades
    })

# POST /api/eventos - Crear evento (manual o desde N8N)
@eventos_bp.route('', methods=['POST'])
def crear_evento():
    data = request.get_json()

    # Datos del cliente
    telefono = data.get('telefono')
    nombre_cliente = data.get('nombre_cliente') or data.get('nombre')  # N8N puede enviar 'nombre'
    email_cliente = data.get('email_cliente') or data.get('mail')  # N8N puede enviar 'mail'

    if not telefono:
        return jsonify({'error': 'Teléfono es requerido'}), 400

    # Verificar si ya existe un evento con este thread_id (evitar duplicados de N8N)
    thread_id = data.get('thread_id')
    if thread_id:
        evento_existente = Evento.query.filter_by(thread_id=thread_id).first()
        if evento_existente:
            return jsonify({
                'message': 'Evento ya existe con este thread_id',
                'evento': evento_existente.to_dict(),
                'duplicado': True
            }), 200

    # Buscar o crear cliente (por teléfono)
    cliente = Cliente.query.filter_by(telefono=telefono).first()
    es_cliente_nuevo = cliente is None

    if es_cliente_nuevo:
        # Cliente nuevo: crear con los datos del mail
        cliente = Cliente(
            telefono=telefono,
            nombre=nombre_cliente or 'Sin nombre',
            email=email_cliente
        )
        db.session.add(cliente)
        db.session.flush()
    # Si cliente existe, NO sobrescribimos sus datos (ya los tiene)

    # Resolver local_id desde nombre si viene como texto
    local_id = data.get('local_id')
    local_nombre = data.get('local_nombre') or data.get('lugar')  # N8N puede enviar 'lugar'

    if not local_id and local_nombre:
        # Buscar local por nombre (case insensitive)
        local = Local.query.filter(Local.nombre.ilike(f'%{local_nombre}%')).first()
        if local:
            local_id = local.id

    # Parsear hora_consulta
    hora_consulta = None
    hora_consulta_str = data.get('hora_consulta') or data.get('hora_cliente')
    if hora_consulta_str:
        try:
            if isinstance(hora_consulta_str, str):
                # Soportar formatos: "14:30", "14:30:00"
                hora_consulta = datetime.strptime(hora_consulta_str.split(':')[0] + ':' + hora_consulta_str.split(':')[1], '%H:%M').time()
        except:
            pass

    # Mapear canal_origen desde 'redireccion' de N8N
    canal_origen = data.get('canal_origen') or data.get('redireccion', 'web')
    # Normalizar valores de N8N
    canal_map = {
        'Email directo': 'mail_directo',
        'Instagram': 'instagram',
        'WhatsApp': 'whatsapp',
        'Teléfono': 'telefono',
        'Referido': 'referido',
        'Web': 'web',
    }
    canal_origen = canal_map.get(canal_origen, canal_origen.lower().replace(' ', '_') if canal_origen else 'web')

    # Crear evento
    evento = Evento(
        cliente_id=cliente.id,
        titulo=data.get('titulo'),
        local_id=local_id,
        fecha_evento=datetime.strptime(data['fecha_evento'], '%Y-%m-%d').date() if data.get('fecha_evento') else None,
        horario_inicio=datetime.strptime(data['horario_inicio'], '%H:%M').time() if data.get('horario_inicio') else None,
        horario_fin=datetime.strptime(data['horario_fin'], '%H:%M').time() if data.get('horario_fin') else None,
        hora_consulta=hora_consulta,
        cantidad_personas=data.get('cantidad_personas'),
        tipo=data.get('tipo'),  # Puede venir null, no asumimos 'social'
        estado=data.get('estado', 'CONSULTA_ENTRANTE'),
        canal_origen=canal_origen,
        mensaje_original=data.get('mensaje_original') or data.get('observacion'),  # N8N puede enviar 'observacion'
        thread_id=thread_id,
        comercial_id=data.get('comercial_id')
    )

    db.session.add(evento)

    # Si es cliente recurrente y tiene comercial preferido, sugerir asignación
    sugerencia_comercial = None
    if not es_cliente_nuevo and cliente.comercial_preferido:
        sugerencia_comercial = cliente.comercial_preferido.to_dict()

    # Crear actividad de sistema
    actividad = Actividad(
        evento=evento,
        tipo='sistema',
        contenido=f"Evento creado desde {canal_origen}" + (" (cliente recurrente)" if not es_cliente_nuevo else "")
    )
    db.session.add(actividad)

    db.session.commit()

    return jsonify({
        'message': 'Evento creado',
        'evento': evento.to_dict(),
        'evento_id': evento.id,
        'cliente_id': cliente.id,
        'es_cliente_nuevo': es_cliente_nuevo,
        'es_cliente_recurrente': not es_cliente_nuevo,
        'sugerencia_comercial': sugerencia_comercial
    }), 201

# PUT /api/eventos/:id - Actualizar evento
@eventos_bp.route('/<int:id>', methods=['PUT'])
def actualizar_evento(id):
    evento = Evento.query.get_or_404(id)
    data = request.get_json()

    # Campos actualizables (sin 'estado' - se calcula automáticamente excepto CONFIRMADO/RECHAZADO)
    campos = ['titulo', 'local_id', 'comercial_id', 'fecha_evento', 'horario_inicio',
              'horario_fin', 'cantidad_personas', 'tipo', 'presupuesto',
              'fecha_presupuesto', 'prioridad']

    estado_anterior = evento.estado
    user = get_current_user()

    for campo in campos:
        if campo in data:
            valor = data[campo]
            # Convertir fechas
            if campo == 'fecha_evento' and valor:
                valor = datetime.strptime(valor, '%Y-%m-%d').date()
            elif campo == 'fecha_presupuesto' and valor:
                valor = datetime.strptime(valor, '%Y-%m-%d').date()
            elif campo in ['horario_inicio', 'horario_fin'] and valor:
                valor = datetime.strptime(valor, '%H:%M').time()

            setattr(evento, campo, valor)

    # Manejar estado manual (solo CONFIRMADO/RECHAZADO pueden ser manuales)
    if 'estado' in data and data['estado'] in ['CONFIRMADO', 'RECHAZADO']:
        evento.estado = data['estado']
    else:
        # Calcular estado automático basado en los datos
        evento.estado = calcular_estado_automatico(evento)

    # Registrar cambio de estado como actividad
    if estado_anterior != evento.estado:
        actividad = Actividad(
            evento_id=evento.id,
            usuario_id=user.id if user else None,
            tipo='cambio_estado',
            contenido=f"Estado cambiado de {estado_anterior} a {evento.estado}"
        )
        db.session.add(actividad)

    # Si se agregó presupuesto, registrar actividad
    if 'presupuesto' in data and data['presupuesto']:
        actividad_cotizacion = Actividad(
            evento_id=evento.id,
            usuario_id=user.id if user else None,
            tipo='presupuesto',
            contenido=f"Cotizacion agregada: ${data['presupuesto']:,.0f}"
        )
        db.session.add(actividad_cotizacion)

    db.session.commit()

    return jsonify({
        'message': 'Evento actualizado',
        'evento': evento.to_dict()
    })

# POST /api/eventos/:id/actividades - Agregar actividad
@eventos_bp.route('/<int:id>/actividades', methods=['POST'])
def agregar_actividad(id):
    evento = Evento.query.get_or_404(id)
    data = request.get_json()
    user = get_current_user()

    actividad = Actividad(
        evento_id=evento.id,
        usuario_id=user.id if user else None,
        tipo=data.get('tipo', 'nota'),
        contenido=data.get('contenido')
    )

    db.session.add(actividad)
    db.session.commit()

    return jsonify({
        'message': 'Actividad agregada',
        'actividad': actividad.to_dict()
    }), 201

# PUT /api/eventos/:id/asignar - Asignar comercial (desde el CRM)
@eventos_bp.route('/<int:id>/asignar', methods=['PUT'])
def asignar_comercial(id):
    evento = Evento.query.get_or_404(id)
    data = request.get_json()
    comercial_id = data.get('comercial_id')

    if not comercial_id:
        return jsonify({'error': 'comercial_id requerido'}), 400

    comercial = Usuario.query.get_or_404(comercial_id)
    estado_anterior = evento.estado
    evento.comercial_id = comercial_id

    # Calcular estado automático (respeta prioridades)
    evento.estado = calcular_estado_automatico(evento)

    # Actualizar comercial preferido del cliente
    evento.cliente.comercial_preferido_id = comercial_id

    # Registrar actividad de asignación
    actividad = Actividad(
        evento_id=evento.id,
        tipo='asignacion',
        contenido=f"Asignado a {comercial.nombre}"
    )
    db.session.add(actividad)

    # Registrar cambio de estado si cambió
    if estado_anterior != evento.estado:
        actividad_estado = Actividad(
            evento_id=evento.id,
            tipo='cambio_estado',
            contenido=f"Estado cambiado de {estado_anterior} a {evento.estado}"
        )
        db.session.add(actividad_estado)

    db.session.commit()

    return jsonify({
        'message': f'Evento asignado a {comercial.nombre}',
        'evento': evento.to_dict()
    })


# POST /api/eventos/asignar-por-respuesta - Asignar comercial desde N8N (por respuesta de Pilar)
@eventos_bp.route('/asignar-por-respuesta', methods=['POST'])
def asignar_por_respuesta():
    """
    N8N llama este endpoint cuando Pilar responde un mail poniendo en CC a un comercial.
    Recibe: thread_id, mail (del comercial en CC)
    Acción: Busca evento por thread_id, busca comercial por mail, asigna y cambia estado a ASIGNADO
    """
    data = request.get_json()

    thread_id = data.get('thread_id')
    mail_comercial = data.get('mail')

    if not thread_id:
        return jsonify({'error': 'thread_id es requerido'}), 400

    if not mail_comercial:
        return jsonify({'error': 'mail del comercial es requerido'}), 400

    # Buscar evento por thread_id
    evento = Evento.query.filter_by(thread_id=thread_id).first()
    if not evento:
        return jsonify({
            'error': 'No se encontró evento con ese thread_id',
            'thread_id': thread_id
        }), 404

    # Si ya tiene comercial asignado, no hacer nada (evitar sobrescribir)
    if evento.comercial_id:
        return jsonify({
            'message': 'Evento ya tiene comercial asignado',
            'evento': evento.to_dict(),
            'ya_asignado': True
        }), 200

    # Buscar comercial por email
    comercial = Usuario.query.filter_by(email=mail_comercial, activo=True).first()
    if not comercial:
        return jsonify({
            'error': 'No se encontró comercial con ese email',
            'mail': mail_comercial
        }), 404

    # Asignar comercial al evento
    evento.comercial_id = comercial.id
    evento.estado = 'ASIGNADO'

    # Actualizar comercial preferido del cliente
    if evento.cliente:
        evento.cliente.comercial_preferido_id = comercial.id

    # Registrar actividad
    mensaje_respuesta = data.get('mensaje', '')
    actividad = Actividad(
        evento_id=evento.id,
        usuario_id=comercial.id,
        tipo='asignacion',
        contenido=f"Asignado a {comercial.nombre} por respuesta de Pilar"
    )
    db.session.add(actividad)

    # Si viene mensaje de la respuesta, registrarlo también
    if mensaje_respuesta:
        actividad_respuesta = Actividad(
            evento_id=evento.id,
            usuario_id=comercial.id,
            tipo='mail',
            contenido=f"Respuesta de Pilar: {mensaje_respuesta[:500]}"  # Limitar a 500 chars
        )
        db.session.add(actividad_respuesta)

    db.session.commit()

    return jsonify({
        'message': f'Evento asignado a {comercial.nombre}',
        'evento': evento.to_dict(),
        'evento_id': evento.id,
        'comercial_id': comercial.id,
        'comercial_nombre': comercial.nombre
    }), 200
