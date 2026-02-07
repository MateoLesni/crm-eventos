"""
Rutas para webhook de Evolution API (WhatsApp)
Completamente separadas del CRM de eventos
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from app import db
from app.models_whatsapp import WAContacto, WAConversacion, WAMensaje
from app.utils.whatsapp_utils import normalizar_numero_argentino, whatsapp_jid_a_numero

whatsapp_bp = Blueprint('whatsapp', __name__)


@whatsapp_bp.route('/test', methods=['GET'])
def test_webhook():
    """Endpoint de prueba para verificar que el webhook está funcionando."""
    return jsonify({
        'status': 'ok',
        'message': 'Webhook Evolution API funcionando correctamente',
        'timestamp': datetime.utcnow().isoformat()
    }), 200


@whatsapp_bp.route('/evolution', methods=['POST'])
def webhook_evolution():
    """
    Endpoint webhook para recibir mensajes de Evolution API.

    Evolution API enviará eventos con esta estructura:
    {
        "event": "messages.upsert",
        "instance": "whatsapp_nuevo",
        "data": {
            "key": {
                "remoteJid": "5491124395923@s.whatsapp.net",
                "fromMe": false,
                "id": "BAE5F6D7E8F9A0B1C2D3E4F5"
            },
            "message": {
                "conversation": "Hola, necesito información"
            },
            "messageTimestamp": 1707398765
        }
    }
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({'status': 'error', 'message': 'No data received'}), 400

        event = data.get('event')
        instance = data.get('instance', 'whatsapp_nuevo')
        message_data = data.get('data', {})

        # Solo procesar eventos de mensajes nuevos
        if event != 'messages.upsert':
            return jsonify({'status': 'ignored', 'reason': f'not a message event: {event}'}), 200

        # Extraer datos del mensaje
        key = message_data.get('key', {})
        remote_jid = key.get('remoteJid')
        from_me = key.get('fromMe', False)
        mensaje_id = key.get('id')

        # Validar datos mínimos
        if not remote_jid or not mensaje_id:
            return jsonify({'status': 'error', 'message': 'Missing remoteJid or mensaje_id'}), 400

        # Ignorar mensajes de grupos (terminan en @g.us)
        if remote_jid.endswith('@g.us'):
            return jsonify({'status': 'ignored', 'reason': 'group message'}), 200

        # Extraer texto del mensaje según el tipo
        message = message_data.get('message', {})
        texto = None
        tipo_mensaje = 'text'
        tiene_multimedia = False
        multimedia_url = None

        if 'conversation' in message:
            texto = message['conversation']
        elif 'extendedTextMessage' in message:
            texto = message['extendedTextMessage'].get('text', '')
        elif 'imageMessage' in message:
            tipo_mensaje = 'image'
            texto = message['imageMessage'].get('caption', '[Imagen]')
            tiene_multimedia = True
        elif 'audioMessage' in message:
            tipo_mensaje = 'audio'
            texto = '[Audio]'
            tiene_multimedia = True
        elif 'videoMessage' in message:
            tipo_mensaje = 'video'
            texto = message['videoMessage'].get('caption', '[Video]')
            tiene_multimedia = True
        elif 'documentMessage' in message:
            tipo_mensaje = 'document'
            texto = message['documentMessage'].get('fileName', '[Documento]')
            tiene_multimedia = True
        elif 'stickerMessage' in message:
            tipo_mensaje = 'sticker'
            texto = '[Sticker]'
        elif 'contactMessage' in message:
            tipo_mensaje = 'contact'
            texto = '[Contacto]'
        elif 'locationMessage' in message:
            tipo_mensaje = 'location'
            texto = '[Ubicación]'

        # Timestamp
        timestamp = message_data.get('messageTimestamp', 0)
        if isinstance(timestamp, str):
            timestamp = int(timestamp)
        fecha_mensaje = datetime.fromtimestamp(timestamp) if timestamp else datetime.utcnow()

        # Normalizar número
        numero = whatsapp_jid_a_numero(remote_jid)
        numero_normalizado = normalizar_numero_argentino(numero)

        if not numero_normalizado:
            return jsonify({'status': 'error', 'message': 'Could not normalize phone number'}), 400

        # 1. Buscar o crear contacto
        contacto = WAContacto.query.filter_by(numero_normalizado=numero_normalizado).first()

        if not contacto:
            contacto = WAContacto(
                numero_original=numero,
                numero_normalizado=numero_normalizado,
                numero_whatsapp=remote_jid,
                estado='nuevo'
            )
            db.session.add(contacto)
            db.session.flush()

        # 2. Buscar o crear conversación
        conversacion = WAConversacion.query.filter_by(
            contacto_id=contacto.id,
            remote_jid=remote_jid
        ).first()

        if not conversacion:
            conversacion = WAConversacion(
                contacto_id=contacto.id,
                remote_jid=remote_jid,
                instancia_nombre=instance,
                vendedor_numero='541156574088',  # Valor por defecto, ajustar según necesidad
                vendedor_nombre='Vendedor'
            )
            db.session.add(conversacion)
            db.session.flush()

        # 3. Verificar si el mensaje ya existe (evitar duplicados)
        mensaje_existente = WAMensaje.query.filter_by(mensaje_id=mensaje_id).first()

        if mensaje_existente:
            return jsonify({'status': 'duplicate', 'mensaje_id': mensaje_id}), 200

        # 4. Guardar mensaje
        nuevo_mensaje = WAMensaje(
            conversacion_id=conversacion.id,
            mensaje_id=mensaje_id,
            texto=texto,
            tipo_mensaje=tipo_mensaje,
            es_enviado=from_me,
            from_me=from_me,
            numero_remitente=remote_jid,
            timestamp=timestamp,
            fecha_mensaje=fecha_mensaje,
            tiene_multimedia=tiene_multimedia,
            multimedia_url=multimedia_url,
            mensaje_completo_json=message_data
        )
        db.session.add(nuevo_mensaje)

        # 5. Actualizar contadores de conversación
        if from_me:
            conversacion.mensajes_enviados = (conversacion.mensajes_enviados or 0) + 1
        else:
            conversacion.mensajes_recibidos = (conversacion.mensajes_recibidos or 0) + 1

        conversacion.total_mensajes = (conversacion.total_mensajes or 0) + 1
        conversacion.ultima_actividad = fecha_mensaje

        db.session.commit()

        return jsonify({
            'status': 'success',
            'contacto_id': contacto.id,
            'conversacion_id': conversacion.id,
            'mensaje_id': mensaje_id,
            'tipo': tipo_mensaje,
            'from_me': from_me
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error procesando webhook: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'error': str(e)}), 500


@whatsapp_bp.route('/conversaciones', methods=['GET'])
def obtener_conversaciones():
    """
    Obtener todas las conversaciones.
    Query params opcionales: estado (abierta, cerrada, archivada)
    """
    try:
        estado = request.args.get('estado', 'abierta')

        query = WAConversacion.query

        if estado:
            query = query.filter_by(estado=estado)

        conversaciones = query.order_by(WAConversacion.ultima_actividad.desc()).all()

        resultado = []
        for conv in conversaciones:
            contacto = conv.contacto
            ultimo_mensaje = WAMensaje.query.filter_by(
                conversacion_id=conv.id
            ).order_by(WAMensaje.timestamp.desc()).first()

            resultado.append({
                'id': conv.id,
                'contacto': {
                    'id': contacto.id,
                    'nombre': contacto.nombre or contacto.numero_normalizado,
                    'numero': contacto.numero_normalizado,
                    'estado': contacto.estado
                },
                'total_mensajes': conv.total_mensajes,
                'mensajes_enviados': conv.mensajes_enviados,
                'mensajes_recibidos': conv.mensajes_recibidos,
                'ultima_actividad': conv.ultima_actividad.isoformat() if conv.ultima_actividad else None,
                'estado': conv.estado,
                'ultimo_mensaje': {
                    'texto': ultimo_mensaje.texto if ultimo_mensaje else None,
                    'fecha': ultimo_mensaje.fecha_mensaje.isoformat() if ultimo_mensaje else None,
                    'es_enviado': ultimo_mensaje.es_enviado if ultimo_mensaje else None,
                    'tipo': ultimo_mensaje.tipo_mensaje if ultimo_mensaje else None
                } if ultimo_mensaje else None
            })

        return jsonify({
            'conversaciones': resultado,
            'total': len(resultado)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@whatsapp_bp.route('/conversacion/<int:conversacion_id>', methods=['GET'])
def obtener_conversacion(conversacion_id):
    """Obtener detalle de una conversación con todos sus mensajes."""
    try:
        conversacion = WAConversacion.query.get_or_404(conversacion_id)
        return jsonify(conversacion.to_dict(include_mensajes=True)), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@whatsapp_bp.route('/conversacion/<int:conversacion_id>/mensajes', methods=['GET'])
def obtener_mensajes_conversacion(conversacion_id):
    """
    Obtener mensajes de una conversación con paginación.
    Query params: limit (default 50), offset (default 0)
    """
    try:
        conversacion = WAConversacion.query.get_or_404(conversacion_id)

        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        mensajes = WAMensaje.query.filter_by(
            conversacion_id=conversacion_id
        ).order_by(WAMensaje.timestamp.asc()).offset(offset).limit(limit).all()

        return jsonify({
            'conversacion_id': conversacion.id,
            'contacto': {
                'nombre': conversacion.contacto.nombre or conversacion.contacto.numero_normalizado,
                'numero': conversacion.contacto.numero_normalizado
            },
            'mensajes': [msg.to_dict() for msg in mensajes],
            'total': conversacion.total_mensajes,
            'limit': limit,
            'offset': offset
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@whatsapp_bp.route('/contacto/<int:contacto_id>', methods=['GET'])
def obtener_contacto(contacto_id):
    """Obtener información de un contacto."""
    try:
        contacto = WAContacto.query.get_or_404(contacto_id)
        return jsonify(contacto.to_dict()), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@whatsapp_bp.route('/contacto/<int:contacto_id>', methods=['PUT'])
def actualizar_contacto(contacto_id):
    """Actualizar información de un contacto."""
    try:
        contacto = WAContacto.query.get_or_404(contacto_id)
        data = request.get_json()

        # Campos actualizables
        campos = ['nombre', 'apellido', 'email', 'empresa', 'es_cliente', 'estado', 'notas']

        for campo in campos:
            if campo in data:
                setattr(contacto, campo, data[campo])

        db.session.commit()

        return jsonify({
            'message': 'Contacto actualizado',
            'contacto': contacto.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@whatsapp_bp.route('/contactos', methods=['GET'])
def listar_contactos():
    """
    Listar todos los contactos.
    Query params: estado, es_cliente, search (busca en nombre, numero)
    """
    try:
        query = WAContacto.query

        estado = request.args.get('estado')
        es_cliente = request.args.get('es_cliente')
        search = request.args.get('search')

        if estado:
            query = query.filter_by(estado=estado)

        if es_cliente is not None:
            es_cliente_bool = es_cliente.lower() in ('true', '1', 'yes')
            query = query.filter_by(es_cliente=es_cliente_bool)

        if search:
            search_term = f"%{search}%"
            query = query.filter(
                db.or_(
                    WAContacto.nombre.ilike(search_term),
                    WAContacto.numero_normalizado.ilike(search_term),
                    WAContacto.empresa.ilike(search_term)
                )
            )

        contactos = query.order_by(WAContacto.fecha_actualizacion.desc()).all()

        return jsonify({
            'contactos': [c.to_dict() for c in contactos],
            'total': len(contactos)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@whatsapp_bp.route('/buscar-por-numero/<numero>', methods=['GET'])
def buscar_por_numero(numero):
    """Buscar contacto por número de teléfono."""
    try:
        numero_normalizado = normalizar_numero_argentino(numero)

        if not numero_normalizado:
            return jsonify({'error': 'Número inválido'}), 400

        contacto = WAContacto.query.filter_by(numero_normalizado=numero_normalizado).first()

        if not contacto:
            return jsonify({'message': 'Contacto no encontrado', 'found': False}), 404

        return jsonify({
            'found': True,
            'contacto': contacto.to_dict()
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@whatsapp_bp.route('/stats', methods=['GET'])
def obtener_estadisticas():
    """Obtener estadísticas generales del sistema de WhatsApp."""
    try:
        total_contactos = WAContacto.query.count()
        contactos_nuevos = WAContacto.query.filter_by(estado='nuevo').count()
        contactos_clientes = WAContacto.query.filter_by(es_cliente=True).count()

        total_conversaciones = WAConversacion.query.count()
        conversaciones_abiertas = WAConversacion.query.filter_by(estado='abierta').count()

        total_mensajes = WAMensaje.query.count()
        mensajes_recibidos = WAMensaje.query.filter_by(es_enviado=False).count()
        mensajes_enviados = WAMensaje.query.filter_by(es_enviado=True).count()

        return jsonify({
            'contactos': {
                'total': total_contactos,
                'nuevos': contactos_nuevos,
                'clientes': contactos_clientes
            },
            'conversaciones': {
                'total': total_conversaciones,
                'abiertas': conversaciones_abiertas
            },
            'mensajes': {
                'total': total_mensajes,
                'recibidos': mensajes_recibidos,
                'enviados': mensajes_enviados
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
