from flask import Blueprint, request, jsonify
from app import db
from app.models import ConversacionMail
from datetime import datetime
from sqlalchemy.dialects.mysql import insert

conversacion_mail_bp = Blueprint('conversacion_mail', __name__)


# POST /api/conversacion-mail - Guardar mensajes (upsert)
@conversacion_mail_bp.route('', methods=['POST'])
def guardar_mensajes():
    """
    Endpoint para guardar mensajes de Gmail con upsert.
    Acepta un array de mensajes. Si el message_id ya existe, actualiza los campos que pueden cambiar.

    Campos esperados por mensaje:
    - message_id (obligatorio) - ID único del mensaje de Gmail
    - thread_id (obligatorio) - ID del thread de Gmail
    - asunto
    - fecha (YYYY-MM-DD)
    - hora (HH:MM o HH:MM:SS)
    - de_email
    - de_nombre
    - para_email
    - tipo_emisor ('equipo' o 'cliente')
    - mensaje
    - comercial_email (si tipo_emisor='equipo')
    - comercial_nombre (si tipo_emisor='equipo')
    """
    data = request.get_json()

    # Aceptar tanto un objeto como un array
    if isinstance(data, dict):
        mensajes = [data]
    elif isinstance(data, list):
        mensajes = data
    else:
        return jsonify({'error': 'Se esperaba un objeto o array de mensajes'}), 400

    if not mensajes:
        return jsonify({'error': 'No se recibieron mensajes'}), 400

    resultados = {
        'insertados': 0,
        'actualizados': 0,
        'errores': []
    }

    for idx, msg in enumerate(mensajes):
        try:
            # Validar campos obligatorios
            message_id = msg.get('message_id')
            thread_id = msg.get('thread_id')

            if not message_id:
                resultados['errores'].append(f'Mensaje {idx}: message_id es requerido')
                continue
            if not thread_id:
                resultados['errores'].append(f'Mensaje {idx}: thread_id es requerido')
                continue

            # Parsear fecha
            fecha = None
            if msg.get('fecha'):
                try:
                    fecha = datetime.strptime(msg['fecha'], '%Y-%m-%d').date()
                except:
                    pass

            # Parsear hora (acepta HH:MM o HH:MM:SS)
            hora = None
            if msg.get('hora'):
                try:
                    hora_str = msg['hora']
                    if len(hora_str) == 5:  # HH:MM
                        hora = datetime.strptime(hora_str, '%H:%M').time()
                    else:  # HH:MM:SS
                        hora = datetime.strptime(hora_str, '%H:%M:%S').time()
                except:
                    pass

            # Verificar si ya existe
            existente = ConversacionMail.query.get(message_id)

            if existente:
                # UPDATE: Actualizar campos que pueden cambiar
                existente.comercial_email = msg.get('comercial_email') or existente.comercial_email
                existente.comercial_nombre = msg.get('comercial_nombre') or existente.comercial_nombre
                # Otros campos generalmente no cambian, pero por si acaso:
                if msg.get('mensaje'):
                    existente.mensaje = msg['mensaje']
                resultados['actualizados'] += 1
            else:
                # INSERT: Crear nuevo
                nuevo_mensaje = ConversacionMail(
                    message_id=message_id,
                    thread_id=thread_id,
                    asunto=msg.get('asunto'),
                    fecha=fecha,
                    hora=hora,
                    de_email=msg.get('de_email'),
                    de_nombre=msg.get('de_nombre'),
                    para_email=msg.get('para_email'),
                    tipo_emisor=msg.get('tipo_emisor', 'cliente'),
                    mensaje=msg.get('mensaje'),
                    comercial_email=msg.get('comercial_email'),
                    comercial_nombre=msg.get('comercial_nombre')
                )
                db.session.add(nuevo_mensaje)
                resultados['insertados'] += 1

        except Exception as e:
            resultados['errores'].append(f'Mensaje {idx}: {str(e)}')

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': f'Error guardando en base de datos: {str(e)}',
            'resultados_parciales': resultados
        }), 500

    return jsonify({
        'message': 'Mensajes procesados',
        'insertados': resultados['insertados'],
        'actualizados': resultados['actualizados'],
        'errores': resultados['errores'] if resultados['errores'] else None
    }), 200 if not resultados['errores'] else 207  # 207 = Multi-Status


# GET /api/conversacion-mail/:thread_id - Obtener mensajes de un thread
@conversacion_mail_bp.route('/<thread_id>', methods=['GET'])
def obtener_conversacion(thread_id):
    """
    Obtiene todos los mensajes de un thread ordenados por fecha/hora.
    """
    mensajes = ConversacionMail.query.filter_by(thread_id=thread_id)\
        .order_by(ConversacionMail.fecha.asc(), ConversacionMail.hora.asc())\
        .all()

    return jsonify({
        'thread_id': thread_id,
        'cantidad': len(mensajes),
        'mensajes': [m.to_dict() for m in mensajes]
    })
