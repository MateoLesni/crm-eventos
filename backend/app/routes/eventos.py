from flask import Blueprint, request, jsonify
from app import db
from app.models import Evento, Cliente, Actividad, Usuario, Local, RespuestaMail, EventoTransicion
from app.routes.auth import get_current_user_from_token
from sqlalchemy.orm import joinedload
from sqlalchemy import text
from datetime import datetime
from app.utils.timezone import ahora_argentina, hoy_argentina


def registrar_transicion(evento, estado_anterior, estado_nuevo, usuario_id=None, origen='manual'):
    """Helper para registrar una transición de estado"""
    if estado_anterior == estado_nuevo:
        return None
    transicion = EventoTransicion(
        evento_id=evento.id,
        estado_anterior=estado_anterior,
        estado_nuevo=estado_nuevo,
        usuario_id=usuario_id,
        origen=origen
    )
    db.session.add(transicion)
    return transicion

eventos_bp = Blueprint('eventos', __name__)

# Prioridad de estados (mayor número = mayor prioridad)
ESTADO_PRIORIDAD = {
    'CONSULTA_ENTRANTE': 1,
    'ASIGNADO': 2,
    'CONTACTADO': 3,
    'COTIZADO': 4,
    'APROBADO': 5,
    'RECHAZADO': 5,
    'MULTIRESERVA': 5,  # Estado especial para Reservas Múltiples
    'CONCLUIDO': 6,
    'ELIMINADO': 7,
}

# Email del usuario "Reservas Múltiples" - usado para auto-asignar estado MULTIRESERVA
RESERVAS_MULTIPLES_EMAIL = 'reservasmultiples@opgroup.com.ar'

def get_current_user():
    return get_current_user_from_token()

def calcular_estado_automatico(evento, es_nuevo=False):
    """
    Calcula el estado que debería tener el evento basado en sus datos.
    Solo sube de estado, nunca baja (excepto APROBADO/RECHAZADO/MULTIRESERVA que son finales).

    Reglas:
    - Sin comercial, sin horario, sin presupuesto -> CONSULTA_ENTRANTE
    - Con comercial "Reservas Múltiples" -> MULTIRESERVA (estado especial)
    - Con comercial asignado -> ASIGNADO
    - Con horario (y comercial) -> CONTACTADO
    - Con presupuesto (y comercial) -> COTIZADO
    """
    estado_actual = evento.estado if not es_nuevo else 'CONSULTA_ENTRANTE'
    prioridad_actual = ESTADO_PRIORIDAD.get(estado_actual, 1)

    # Si está en estado final (APROBADO/RECHAZADO/MULTIRESERVA/CONCLUIDO), no cambiar automáticamente
    if estado_actual in ['APROBADO', 'RECHAZADO', 'MULTIRESERVA', 'CONCLUIDO']:
        return estado_actual

    # Determinar el estado que corresponde según los datos
    nuevo_estado = 'CONSULTA_ENTRANTE'

    # Si tiene comercial asignado
    if evento.comercial_id:
        # Verificar si es "Reservas Múltiples" -> MULTIRESERVA
        comercial = Usuario.query.get(evento.comercial_id)
        if comercial and comercial.email == RESERVAS_MULTIPLES_EMAIL:
            return 'MULTIRESERVA'  # Estado especial, se asigna directamente

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

    # Usar joinedload para cargar relaciones en una sola query (evita N+1)
    query = Evento.query.options(
        joinedload(Evento.cliente),
        joinedload(Evento.local),
        joinedload(Evento.comercial)
    ).filter(Evento.estado != 'ELIMINADO')

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

    # Obtener IDs de eventos con precheck en una sola query
    eventos_con_precheck = set()
    if eventos:
        evento_ids = [e.id for e in eventos]
        # Query para encontrar eventos que tienen al menos un concepto o adicional
        result = db.session.execute(text("""
            SELECT DISTINCT evento_id FROM (
                SELECT evento_id FROM precheck_conceptos WHERE evento_id IN :ids
                UNION
                SELECT evento_id FROM precheck_adicionales WHERE evento_id IN :ids
            ) AS combined
        """), {'ids': tuple(evento_ids)})
        eventos_con_precheck = {row[0] for row in result}

    # Agrupar por estado para el Kanban
    kanban = {
        'CONSULTA_ENTRANTE': [],
        'ASIGNADO': [],
        'CONTACTADO': [],
        'COTIZADO': [],
        'APROBADO': [],
        'RECHAZADO': [],
        'MULTIRESERVA': [],
        'CONCLUIDO': [],
    }

    for evento in eventos:
        estado = evento.estado
        if estado in kanban:
            evento_dict = evento.to_dict()
            evento_dict['tiene_precheck'] = evento.id in eventos_con_precheck
            kanban[estado].append(evento_dict)

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

# GET /api/eventos/eliminados - Listar eventos eliminados (papelera)
@eventos_bp.route('/eliminados', methods=['GET'])
def listar_eliminados():
    user = get_current_user()

    query = Evento.query.options(
        joinedload(Evento.cliente),
        joinedload(Evento.local),
        joinedload(Evento.comercial)
    ).filter(Evento.estado == 'ELIMINADO')

    # Comerciales solo ven sus eliminados, admins ven todos
    if user and user.rol == 'comercial':
        query = query.filter(Evento.comercial_id == user.id)

    eventos = query.order_by(Evento.updated_at.desc()).all()
    return jsonify({'eventos': [e.to_dict() for e in eventos]})

# GET /api/eventos/:id - Detalle de un evento
@eventos_bp.route('/<int:id>', methods=['GET'])
def obtener_evento(id):
    evento = Evento.query.get_or_404(id)
    actividades = [a.to_dict() for a in evento.actividades.all()]

    return jsonify({
        'evento': evento.to_dict(include_counts=True),
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

    # Validar que venga al menos teléfono o email
    if not telefono and not email_cliente:
        return jsonify({'error': 'Se requiere teléfono o email del cliente'}), 400

    # Verificar si ya existe un evento con este thread_id (evitar duplicados de N8N)
    thread_id = data.get('thread_id')
    if thread_id:
        evento_existente = Evento.query.filter_by(thread_id=thread_id).first()
        if evento_existente:
            return jsonify({
                'message': 'Evento ya existe con este thread_id',
                'evento': evento_existente.to_dict(include_counts=True),
                'duplicado': True
            }), 200

    # Buscar o crear cliente (primero por teléfono, luego por email)
    cliente = None
    es_cliente_nuevo = False
    identificador_usado = None  # Para saber cómo se identificó al cliente

    if telefono:
        # Buscar por teléfono primero
        cliente = Cliente.query.filter_by(telefono=telefono).first()
        identificador_usado = 'telefono'

    if not cliente and email_cliente:
        # Si no hay cliente por teléfono, buscar por email
        cliente = Cliente.query.filter_by(email=email_cliente).first()
        identificador_usado = 'email'

    if not cliente:
        # Cliente nuevo: crear con los datos disponibles
        es_cliente_nuevo = True
        if telefono:
            # Tiene teléfono: crear normalmente
            cliente = Cliente(
                telefono=telefono,
                nombre=nombre_cliente or 'Sin nombre',
                email=email_cliente
            )
        else:
            # No tiene teléfono: usar email como identificador en campo teléfono
            # Generar un identificador único basado en email
            cliente = Cliente(
                telefono=f"email:{email_cliente}",  # Formato especial para identificar que no tiene tel
                nombre=nombre_cliente or 'Sin nombre',
                email=email_cliente
            )
        db.session.add(cliente)
        db.session.flush()
    else:
        # Cliente existe: actualizar email si no tenía y ahora viene
        if email_cliente and not cliente.email:
            cliente.email = email_cliente
        # Si vino teléfono y el cliente no lo tenía (estaba con email:xxx), actualizar
        if telefono and cliente.telefono.startswith('email:'):
            cliente.telefono = telefono

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

    # Validaciones de dependencias (sanitizar strings vacías a None)
    comercial_id = data.get('comercial_id') or None
    horario_inicio = data.get('horario_inicio') or None
    horario_fin = data.get('horario_fin') or None
    presupuesto = data.get('presupuesto') or None

    # Si tiene horario o presupuesto, debe tener comercial asignado
    if (horario_inicio or horario_fin) and not comercial_id:
        return jsonify({
            'error': 'Para asignar horario, primero debe asignar un comercial'
        }), 400

    if presupuesto and not comercial_id:
        return jsonify({
            'error': 'Para agregar presupuesto, primero debe asignar un comercial'
        }), 400

    # Sanitizar cantidad_personas (puede venir como "" desde frontend)
    cantidad_personas = data.get('cantidad_personas')
    if cantidad_personas == '' or cantidad_personas is None:
        cantidad_personas = None
    else:
        try:
            cantidad_personas = int(cantidad_personas)
        except (ValueError, TypeError):
            cantidad_personas = None

    # Crear evento
    evento = Evento(
        cliente_id=cliente.id,
        titulo=data.get('titulo') or None,
        local_id=local_id or None,
        fecha_evento=datetime.strptime(data['fecha_evento'], '%Y-%m-%d').date() if data.get('fecha_evento') else None,
        horario_inicio=datetime.strptime(horario_inicio, '%H:%M').time() if horario_inicio else None,
        horario_fin=datetime.strptime(horario_fin, '%H:%M').time() if horario_fin else None,
        hora_consulta=hora_consulta,
        cantidad_personas=cantidad_personas,
        tipo=data.get('tipo') or None,
        estado='CONSULTA_ENTRANTE',
        canal_origen=canal_origen,
        mensaje_original=data.get('mensaje_original') or data.get('observacion') or None,
        thread_id=thread_id,
        comercial_id=comercial_id,
        presupuesto=presupuesto
    )

    # Calcular estado automático basado en los datos cargados
    evento.estado = calcular_estado_automatico(evento, es_nuevo=True)

    db.session.add(evento)
    db.session.flush()  # Para obtener el ID del evento

    # Registrar transición inicial (creación del evento)
    origen_transicion = 'n8n' if thread_id else 'manual'
    registrar_transicion(evento, None, evento.estado, usuario_id=None, origen=origen_transicion)

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
        'evento': evento.to_dict(include_counts=True),
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

    # Bloquear edición de eventos ELIMINADOS (solo se permite REVERTIR_ESTADO)
    if evento.estado == 'ELIMINADO' and data.get('estado') != 'REVERTIR_ESTADO':
        return jsonify({'error': 'No se puede editar un evento eliminado. Restauralo primero desde la papelera.'}), 400

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

    # Campos actualizables (sin 'estado' - se calcula automáticamente excepto APROBADO/RECHAZADO)
    campos = ['titulo', 'local_id', 'comercial_id', 'fecha_evento', 'horario_inicio',
              'horario_fin', 'cantidad_personas', 'tipo', 'presupuesto',
              'fecha_presupuesto', 'es_prioritario', 'es_tentativo', 'motivo_rechazo']

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

    # Manejar estado manual
    if 'estado' in data:
        nuevo_estado = data['estado']

        # Bloquear cambios de estado en CONCLUIDO
        if estado_anterior == 'CONCLUIDO':
            return jsonify({'error': 'No se puede cambiar el estado de un evento concluido'}), 400

        # Revertir estado: desde APROBADO/RECHAZADO a estado anterior
        if nuevo_estado == 'REVERTIR_ESTADO' and estado_anterior in ['APROBADO', 'RECHAZADO']:
            # Si tiene pre-check, eliminar conceptos y adicionales (conservar pagos)
            if evento.precheck_conceptos.count() > 0:
                for concepto in evento.precheck_conceptos.all():
                    db.session.delete(concepto)
            if evento.precheck_adicionales.count() > 0:
                for adicional in evento.precheck_adicionales.all():
                    db.session.delete(adicional)

            # Limpiar motivo_rechazo si se revierte desde RECHAZADO
            if estado_anterior == 'RECHAZADO':
                evento.motivo_rechazo = None

            # Recalcular estado automático basado en los datos del evento
            evento.estado = calcular_estado_automatico(evento, es_nuevo=True)

        # Revertir estado: desde ELIMINADO al estado que tenía antes
        elif nuevo_estado == 'REVERTIR_ESTADO' and estado_anterior == 'ELIMINADO':
            evento.estado = evento.estado_pre_eliminacion or 'CONSULTA_ENTRANTE'
            evento.motivo_eliminacion = None
            evento.estado_pre_eliminacion = None

        # Eliminar evento (soft delete)
        elif nuevo_estado == 'ELIMINADO':
            motivo = data.get('motivo_eliminacion', '').strip() if data.get('motivo_eliminacion') else ''
            if not motivo or len(motivo) < 5:
                return jsonify({'error': 'El motivo de eliminación es obligatorio (mínimo 5 caracteres)'}), 400
            evento.estado_pre_eliminacion = estado_anterior
            evento.motivo_eliminacion = motivo
            evento.estado = 'ELIMINADO'
            evento.es_prioritario = False
            evento.es_tentativo = False

        # Aprobar o rechazar manualmente
        elif nuevo_estado in ['APROBADO', 'RECHAZADO']:
            # Validar motivo obligatorio para RECHAZADO
            if nuevo_estado == 'RECHAZADO':
                motivo = data.get('motivo_rechazo', '').strip() if data.get('motivo_rechazo') else ''
                if not motivo:
                    return jsonify({'error': 'El motivo de rechazo es obligatorio'}), 400
                evento.motivo_rechazo = motivo

            # Si es APROBADO y la fecha del evento ya pasó, marcar como CONCLUIDO directamente
            if nuevo_estado == 'APROBADO' and evento.fecha_evento:
                hoy = ahora_argentina().date()
                if evento.fecha_evento < hoy:
                    nuevo_estado = 'CONCLUIDO'

            evento.estado = nuevo_estado
            # Limpiar etiquetas al pasar a estados finales
            evento.es_prioritario = False
            evento.es_tentativo = False
        else:
            # Estado no reconocido para cambio manual, calcular automático
            evento.estado = calcular_estado_automatico(evento)
    else:
        # Sin estado en data, calcular estado automático basado en los datos
        evento.estado = calcular_estado_automatico(evento)

    # Registrar cambio de estado como actividad y transición
    if estado_anterior != evento.estado:
        actividad = Actividad(
            evento_id=evento.id,
            usuario_id=user.id if user else None,
            tipo='cambio_estado',
            contenido=f"Estado cambiado de {estado_anterior} a {evento.estado}"
        )
        db.session.add(actividad)

        # Registrar transición
        registrar_transicion(evento, estado_anterior, evento.estado, usuario_id=user.id if user else None, origen='manual')

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
        'evento': evento.to_dict(include_counts=True)
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

        # Registrar transición
        user = get_current_user()
        registrar_transicion(evento, estado_anterior, evento.estado, usuario_id=user.id if user else None, origen='manual')

    db.session.commit()

    return jsonify({
        'message': f'Evento asignado a {comercial.nombre}',
        'evento': evento.to_dict(include_counts=True)
    })


# PATCH /api/eventos/:id/etiquetas - Toggle rápido de etiquetas (prioritario/tentativo)
@eventos_bp.route('/<int:id>/etiquetas', methods=['PATCH'])
def toggle_etiquetas(id):
    """
    Toggle rápido de etiquetas desde la tarjeta del Kanban.
    Body: { "es_prioritario": true/false, "es_tentativo": true/false }
    Solo actualiza los campos que vienen en el body.
    No permite cambiar etiquetas en eventos APROBADO/RECHAZADO.
    """
    evento = Evento.query.get_or_404(id)

    # No permitir en estados finales
    if evento.estado in ['APROBADO', 'RECHAZADO']:
        return jsonify({
            'error': 'No se pueden modificar etiquetas en eventos aprobados o rechazados'
        }), 400

    data = request.get_json()

    if 'es_prioritario' in data:
        evento.es_prioritario = bool(data['es_prioritario'])

    if 'es_tentativo' in data:
        evento.es_tentativo = bool(data['es_tentativo'])

    db.session.commit()

    return jsonify({
        'message': 'Etiquetas actualizadas',
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
            'evento': evento.to_dict(include_counts=True),
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
    estado_anterior = evento.estado
    evento.comercial_id = comercial.id
    evento.estado = 'ASIGNADO'

    # Registrar transición
    registrar_transicion(evento, estado_anterior, evento.estado, usuario_id=comercial.id, origen='n8n')

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
        fecha_respuesta=datetime.strptime(fecha_resp, '%Y-%m-%d').date() if fecha_resp else ahora_argentina().date(),
        hora_respuesta=datetime.strptime(hora_resp, '%H:%M:%S').time() if hora_resp else ahora_argentina().time()
    )
    db.session.add(respuesta_mail)

    db.session.commit()

    return jsonify({
        'message': f'Evento asignado a {comercial.nombre}',
        'evento': evento.to_dict(include_counts=True),
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

    if not nombre_cliente:
        return jsonify({'error': 'nombre_cliente es requerido'}), 400

    # Buscar o crear cliente
    cliente = None
    es_cliente_nuevo = False

    # Si viene teléfono, buscar por teléfono
    if telefono:
        cliente = Cliente.query.filter_by(telefono=telefono).first()

    # Si encontró cliente existente, actualizar datos si vienen mejores
    if cliente:
        email_cliente = data.get('email_cliente')
        if email_cliente and not cliente.email:
            cliente.email = email_cliente
        # Actualizar nombre si el actual es genérico y viene uno real
        if nombre_cliente and nombre_cliente.lower() not in ('sin nombre', ''):
            if not cliente.nombre or cliente.nombre.lower() in ('sin nombre', ''):
                cliente.nombre = nombre_cliente
    else:
        # Generar teléfono único si no viene
        if not telefono:
            telefono = f"migrado_{ahora_argentina().strftime('%Y%m%d%H%M%S%f')}"

        cliente = Cliente(
            telefono=telefono,
            nombre=nombre_cliente,
            email=data.get('email_cliente')
        )
        db.session.add(cliente)
        db.session.flush()
        es_cliente_nuevo = True

    # Validar comercial si viene (sanitizar null/empty)
    comercial_id = data.get('comercial_id') or None
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
    estado_raw = data.get('estado', 'ASIGNADO')
    # Normalizar a mayúsculas y mapear variantes comunes
    estado = estado_raw.upper().strip() if estado_raw else 'ASIGNADO'

    # Mapeo de variantes posibles
    estado_map = {
        'CONSULTA_ENTRANTE': 'CONSULTA_ENTRANTE',
        'CONSULTA ENTRANTE': 'CONSULTA_ENTRANTE',
        'CONSULTAENTRANTE': 'CONSULTA_ENTRANTE',
        'ASIGNADO': 'ASIGNADO',
        'CONTACTADO': 'CONTACTADO',
        'COTIZADO': 'COTIZADO',
        'APROBADO': 'APROBADO',
        'RECHAZADO': 'RECHAZADO',
        'CONCLUIDO': 'CONCLUIDO',
    }
    estado = estado_map.get(estado, estado)

    estados_validos = ['CONSULTA_ENTRANTE', 'ASIGNADO', 'CONTACTADO', 'COTIZADO', 'APROBADO', 'RECHAZADO', 'CONCLUIDO']
    if estado not in estados_validos:
        estado = 'ASIGNADO'

    # Motivo de rechazo (solo relevante si estado es RECHAZADO)
    motivo_rechazo = data.get('motivo_rechazo')

    # Sanitizar campos numéricos (pueden venir como "" o null)
    cantidad_personas = data.get('cantidad_personas')
    if cantidad_personas == '' or cantidad_personas is None:
        cantidad_personas = None
    else:
        try:
            cantidad_personas = int(cantidad_personas)
        except (ValueError, TypeError):
            cantidad_personas = None

    presupuesto = data.get('presupuesto')
    if presupuesto == '' or presupuesto is None:
        presupuesto = None

    # Crear evento
    evento = Evento(
        cliente_id=cliente.id,
        comercial_id=comercial_id,
        titulo=data.get('titulo') or None,
        local_id=local_id or None,
        fecha_evento=fecha_evento,
        horario_inicio=horario_inicio,
        horario_fin=horario_fin,
        hora_consulta=hora_consulta,
        cantidad_personas=cantidad_personas,
        tipo=data.get('tipo') or None,
        estado=estado,
        presupuesto=presupuesto,
        fecha_presupuesto=fecha_presupuesto,
        canal_origen=data.get('canal_origen', 'migracion'),
        mensaje_original=data.get('mensaje_original') or None,
        thread_id=data.get('thread_id') or None,
        motivo_rechazo=motivo_rechazo
    )

    db.session.add(evento)
    db.session.flush()  # Para obtener el ID del evento

    # Registrar transición inicial (migración)
    registrar_transicion(evento, None, evento.estado, usuario_id=comercial_id, origen='migracion')

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
        'evento': evento.to_dict(include_counts=True)
    }), 201


# GET /api/eventos/:id/transiciones - Historial de transiciones de estado
@eventos_bp.route('/<int:id>/transiciones', methods=['GET'])
def obtener_transiciones(id):
    """
    Retorna el historial completo de transiciones de estado de un evento,
    incluyendo duración en cada estado.
    """
    evento = Evento.query.get_or_404(id)
    transiciones = EventoTransicion.query.filter_by(evento_id=id).order_by(EventoTransicion.created_at).all()

    # Calcular duraciones
    transiciones_con_duracion = []
    for i, trans in enumerate(transiciones):
        trans_dict = trans.to_dict()

        if i < len(transiciones) - 1:
            # Duración hasta la siguiente transición
            siguiente = transiciones[i + 1]
            duracion_segundos = (siguiente.created_at - trans.created_at).total_seconds()
        else:
            # Último estado: duración hasta ahora
            duracion_segundos = (ahora_argentina() - trans.created_at).total_seconds()

        trans_dict['duracion_segundos'] = duracion_segundos
        trans_dict['duracion_legible'] = formatear_duracion(duracion_segundos)
        transiciones_con_duracion.append(trans_dict)

    # Calcular tiempo total por estado
    duraciones_por_estado = {}
    for trans in transiciones_con_duracion:
        estado = trans['estado_nuevo']
        duraciones_por_estado[estado] = duraciones_por_estado.get(estado, 0) + trans['duracion_segundos']

    # Formatear duraciones totales
    duraciones_formateadas = {
        estado: {
            'segundos': segundos,
            'legible': formatear_duracion(segundos)
        }
        for estado, segundos in duraciones_por_estado.items()
    }

    return jsonify({
        'evento_id': id,
        'estado_actual': evento.estado,
        'transiciones': transiciones_con_duracion,
        'duracion_por_estado': duraciones_formateadas,
        'total_transiciones': len(transiciones)
    })


def formatear_duracion(segundos):
    """Convierte segundos a formato legible: 2d 5h 30m"""
    if segundos < 60:
        return f"{int(segundos)}s"

    minutos = segundos / 60
    if minutos < 60:
        return f"{int(minutos)}m"

    horas = minutos / 60
    if horas < 24:
        mins_restantes = int(minutos % 60)
        return f"{int(horas)}h {mins_restantes}m" if mins_restantes else f"{int(horas)}h"

    dias = horas / 24
    horas_restantes = int(horas % 24)
    return f"{int(dias)}d {horas_restantes}h" if horas_restantes else f"{int(dias)}d"


# POST /api/eventos/concluir-finalizados - Cron job para marcar eventos concluidos
@eventos_bp.route('/concluir-finalizados', methods=['POST'])
def concluir_eventos_finalizados():
    """
    Endpoint para cron job (Cloud Scheduler).
    Marca como CONCLUIDO todos los eventos APROBADOS cuya fecha_evento ya pasó.
    Ejecutar diariamente a las 00:05.

    También puede recibir un parámetro 'key' para autenticación básica del cron.
    """
    # Autenticación opcional por key (para Cloud Scheduler)
    cron_key = request.args.get('key') or request.headers.get('X-Cron-Key')
    # Puedes validar contra una variable de entorno si lo necesitas

    hoy = ahora_argentina().date()

    # Buscar eventos APROBADOS con fecha_evento anterior a hoy
    eventos_a_concluir = Evento.query.filter(
        Evento.estado == 'APROBADO',
        Evento.fecha_evento < hoy
    ).all()

    concluidos = []
    for evento in eventos_a_concluir:
        estado_anterior = evento.estado
        evento.estado = 'CONCLUIDO'

        # Registrar transición
        registrar_transicion(evento, estado_anterior, 'CONCLUIDO', usuario_id=None, origen='sistema')

        # Registrar actividad
        actividad = Actividad(
            evento_id=evento.id,
            tipo='sistema',
            contenido='Evento marcado como CONCLUIDO automáticamente (fecha del evento finalizada)'
        )
        db.session.add(actividad)

        concluidos.append({
            'id': evento.id,
            'titulo': evento.titulo or evento.generar_titulo_auto(),
            'fecha_evento': evento.fecha_evento.isoformat() if evento.fecha_evento else None
        })

    db.session.commit()

    return jsonify({
        'message': f'{len(concluidos)} eventos marcados como CONCLUIDO',
        'fecha_ejecucion': hoy.isoformat(),
        'eventos_concluidos': concluidos
    })
