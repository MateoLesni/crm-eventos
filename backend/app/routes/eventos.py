from flask import Blueprint, request, jsonify
from app import db
from app.models import Evento, Cliente, Actividad, Usuario, Local, RespuestaMail
from app.routes.auth import get_current_user_from_token
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
    return get_current_user_from_token()

def calcular_estado_automatico(evento, es_nuevo=False):
    """
    Calcula el estado que debería tener el evento basado en sus datos.
    Solo sube de estado, nunca baja (excepto CONFIRMADO/RECHAZADO que son manuales).

    Reglas:
    - Sin comercial, sin horario, sin presupuesto -> CONSULTA_ENTRANTE
    - Con comercial asignado -> ASIGNADO
    - Con horario (y comercial) -> CONTACTADO
    - Con presupuesto (y comercial) -> COTIZADO
    """
    estado_actual = evento.estado if not es_nuevo else 'CONSULTA_ENTRANTE'
    prioridad_actual = ESTADO_PRIORIDAD.get(estado_actual, 1)

    # Si está en estado final (CONFIRMADO/RECHAZADO), no cambiar automáticamente
    if estado_actual in ['CONFIRMADO', 'RECHAZADO']:
        return estado_actual

    # Determinar el estado que corresponde según los datos
    nuevo_estado = 'CONSULTA_ENTRANTE'

    # Si tiene comercial asignado -> ASIGNADO
    if evento.comercial_id:
        nuevo_estado = 'ASIGNADO'

        # Si tiene horario (y comercial) -> CONTACTADO
        if evento.horario_inicio or evento.horario_fin:
            nuevo_estado = 'CONTACTADO'

        # Si tiene presupuesto (y comercial) -> COTIZADO
        if evento.presupuesto:
            nuevo_estado = 'COTIZADO'

    # Para eventos nuevos, retornar directamente el estado calculado
    if es_nuevo:
        return nuevo_estado

    # Para actualizaciones, solo subir de estado, nunca bajar
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

    # Si es comercial, ve: CONSULTA_ENTRANTE (todos) + sus eventos asignados
    if user and user.rol == 'comercial':
        from sqlalchemy import or_
        query = query.filter(
            or_(
                Evento.estado == 'CONSULTA_ENTRANTE',
                Evento.comercial_id == user.id
            )
        )
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

    # Validaciones de dependencias
    comercial_id = data.get('comercial_id')
    horario_inicio = data.get('horario_inicio')
    horario_fin = data.get('horario_fin')
    presupuesto = data.get('presupuesto')

    # Si tiene horario o presupuesto, debe tener comercial asignado
    if (horario_inicio or horario_fin) and not comercial_id:
        return jsonify({
            'error': 'Para asignar horario, primero debe asignar un comercial'
        }), 400

    if presupuesto and not comercial_id:
        return jsonify({
            'error': 'Para agregar presupuesto, primero debe asignar un comercial'
        }), 400

    # Crear evento
    evento = Evento(
        cliente_id=cliente.id,
        titulo=data.get('titulo'),
        local_id=local_id,
        fecha_evento=datetime.strptime(data['fecha_evento'], '%Y-%m-%d').date() if data.get('fecha_evento') else None,
        horario_inicio=datetime.strptime(horario_inicio, '%H:%M').time() if horario_inicio else None,
        horario_fin=datetime.strptime(horario_fin, '%H:%M').time() if horario_fin else None,
        hora_consulta=hora_consulta,
        cantidad_personas=data.get('cantidad_personas'),
        tipo=data.get('tipo'),  # Puede venir null, no asumimos 'social'
        estado='CONSULTA_ENTRANTE',  # Estado inicial, se calculará después
        canal_origen=canal_origen,
        mensaje_original=data.get('mensaje_original') or data.get('observacion'),  # N8N puede enviar 'observacion'
        thread_id=thread_id,
        comercial_id=comercial_id,
        presupuesto=presupuesto
    )

    # Calcular estado automático basado en los datos cargados
    evento.estado = calcular_estado_automatico(evento, es_nuevo=True)

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

    # Mensaje informativo según el estado
    mensajes_estado = {
        'CONSULTA_ENTRANTE': 'Su evento se registró en Consulta Entrante.',
        'ASIGNADO': f'Evento asignado a comercial. Estado: Asignado.',
        'CONTACTADO': 'Evento con horario asignado. Estado: Contactado.',
        'COTIZADO': 'Evento con presupuesto. Estado: Cotizado.'
    }

    return jsonify({
        'message': 'Evento creado',
        'mensaje_estado': mensajes_estado.get(evento.estado, 'Evento creado.'),
        'estado_calculado': evento.estado,
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

    # Validaciones de dependencias ANTES de actualizar
    # Determinar el comercial_id que tendrá el evento después de la actualización
    comercial_id_nuevo = data.get('comercial_id', evento.comercial_id)

    # Si se está intentando agregar horario sin comercial
    if ('horario_inicio' in data or 'horario_fin' in data):
        tiene_horario = data.get('horario_inicio') or data.get('horario_fin') or evento.horario_inicio or evento.horario_fin
        if tiene_horario and not comercial_id_nuevo:
            return jsonify({
                'error': 'Para asignar horario, primero debe asignar un comercial'
            }), 400

    # Si se está intentando agregar presupuesto sin comercial
    if 'presupuesto' in data:
        if data.get('presupuesto') and not comercial_id_nuevo:
            return jsonify({
                'error': 'Para agregar presupuesto, primero debe asignar un comercial'
            }), 400

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

    # Guardar registro en respuestas_mails para trazabilidad
    from datetime import date, time
    fecha_resp = data.get('fecha_respuesta')
    hora_resp = data.get('hora_respuesta')

    respuesta_mail = RespuestaMail(
        thread_id=thread_id,
        mail=mail_comercial,
        nombre_comercial=comercial.nombre,
        mensaje=mensaje_respuesta[:1000] if mensaje_respuesta else None,
        fecha_respuesta=datetime.strptime(fecha_resp, '%Y-%m-%d').date() if fecha_resp else datetime.utcnow().date(),
        hora_respuesta=datetime.strptime(hora_resp, '%H:%M:%S').time() if hora_resp else datetime.utcnow().time()
    )
    db.session.add(respuesta_mail)

    db.session.commit()

    return jsonify({
        'message': f'Evento asignado a {comercial.nombre}',
        'evento': evento.to_dict(),
        'evento_id': evento.id,
        'comercial_id': comercial.id,
        'comercial_nombre': comercial.nombre
    }), 200


# POST /api/eventos/migracion - Endpoint para migrar datos del CRM antiguo
@eventos_bp.route('/migracion', methods=['POST'])
def migrar_evento():
    """
    Endpoint especial para migración de datos desde el CRM antiguo.
    Permite crear eventos con todos los campos sin validaciones de estado automático.

    Campos requeridos del cliente:
    - telefono (obligatorio)
    - nombre_cliente (obligatorio)
    - email_cliente (opcional)

    Campos del evento (todos opcionales excepto que se indica):
    - comercial_id (ID del comercial)
    - titulo
    - local_id
    - fecha_evento (YYYY-MM-DD)
    - horario_inicio (HH:MM)
    - horario_fin (HH:MM)
    - hora_consulta (HH:MM)
    - cantidad_personas
    - tipo (social/corporativo)
    - estado (cualquier estado válido)
    - presupuesto
    - fecha_presupuesto (YYYY-MM-DD)
    - canal_origen
    - mensaje_original
    - thread_id
    """
    data = request.get_json()

    # Validar campos mínimos del cliente
    telefono = data.get('telefono')
    nombre_cliente = data.get('nombre_cliente')

    if not telefono:
        return jsonify({'error': 'telefono es requerido'}), 400
    if not nombre_cliente:
        return jsonify({'error': 'nombre_cliente es requerido'}), 400

    # Buscar o crear cliente
    cliente = Cliente.query.filter_by(telefono=telefono).first()
    es_cliente_nuevo = False

    if not cliente:
        cliente = Cliente(
            telefono=telefono,
            nombre=nombre_cliente,
            email=data.get('email_cliente')
        )
        db.session.add(cliente)
        db.session.flush()  # Para obtener el ID
        es_cliente_nuevo = True

    # Validar comercial si viene
    comercial_id = data.get('comercial_id')
    if comercial_id:
        comercial = Usuario.query.get(comercial_id)
        if not comercial:
            return jsonify({'error': f'No existe comercial con ID {comercial_id}'}), 404

    # Parsear fechas y horas
    fecha_evento = None
    if data.get('fecha_evento'):
        try:
            fecha_evento = datetime.strptime(data['fecha_evento'], '%Y-%m-%d').date()
        except:
            pass

    horario_inicio = None
    if data.get('horario_inicio'):
        try:
            horario_inicio = datetime.strptime(data['horario_inicio'], '%H:%M').time()
        except:
            pass

    horario_fin = None
    if data.get('horario_fin'):
        try:
            horario_fin = datetime.strptime(data['horario_fin'], '%H:%M').time()
        except:
            pass

    hora_consulta = None
    if data.get('hora_consulta'):
        try:
            hora_consulta = datetime.strptime(data['hora_consulta'], '%H:%M').time()
        except:
            pass

    fecha_presupuesto = None
    if data.get('fecha_presupuesto'):
        try:
            fecha_presupuesto = datetime.strptime(data['fecha_presupuesto'], '%Y-%m-%d').date()
        except:
            pass

    # Validar local si viene
    local_id = data.get('local_id')
    if local_id:
        local = Local.query.get(local_id)
        if not local:
            local_id = None  # Ignorar si no existe

    # Estado: usar el que viene o default ASIGNADO (ya que la migración trae asignados)
    estado = data.get('estado', 'ASIGNADO')
    estados_validos = ['CONSULTA_ENTRANTE', 'ASIGNADO', 'CONTACTADO', 'COTIZADO', 'CONFIRMADO', 'RECHAZADO', 'CONCLUIDO']
    if estado not in estados_validos:
        estado = 'ASIGNADO'

    # Crear evento
    evento = Evento(
        cliente_id=cliente.id,
        comercial_id=comercial_id,
        titulo=data.get('titulo'),
        local_id=local_id,
        fecha_evento=fecha_evento,
        horario_inicio=horario_inicio,
        horario_fin=horario_fin,
        hora_consulta=hora_consulta,
        cantidad_personas=data.get('cantidad_personas'),
        tipo=data.get('tipo'),
        estado=estado,
        presupuesto=data.get('presupuesto'),
        fecha_presupuesto=fecha_presupuesto,
        canal_origen=data.get('canal_origen', 'migracion'),
        mensaje_original=data.get('mensaje_original'),
        thread_id=data.get('thread_id')
    )

    db.session.add(evento)

    # Actividad de migración
    actividad = Actividad(
        evento=evento,
        tipo='sistema',
        contenido='Evento migrado desde CRM antiguo'
    )
    db.session.add(actividad)

    db.session.commit()

    return jsonify({
        'message': 'Evento migrado correctamente',
        'evento_id': evento.id,
        'cliente_id': cliente.id,
        'es_cliente_nuevo': es_cliente_nuevo,
        'estado': evento.estado,
        'evento': evento.to_dict()
    }), 201
