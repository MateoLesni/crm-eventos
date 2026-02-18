"""
Rutas para el Calendario de Eventos
"""
from flask import Blueprint, request, jsonify
from app import db
from app.models import Evento, Local, Cliente
from app.routes.auth import get_current_user_from_token
from sqlalchemy.orm import joinedload

calendario_bp = Blueprint('calendario', __name__)


def get_current_user():
    return get_current_user_from_token()


@calendario_bp.route('/eventos', methods=['GET'])
def listar_eventos_calendario():
    """
    Obtener eventos para el calendario.
    Solo muestra eventos COTIZADOS, APROBADOS y CONCLUIDOS que tengan fecha_evento.
    """
    user = get_current_user()

    # Query base: eventos con fecha_evento y estados relevantes
    query = db.session.query(Evento).options(
        joinedload(Evento.local),
        joinedload(Evento.cliente),
        joinedload(Evento.comercial)
    ).filter(
        Evento.fecha_evento.isnot(None),
        Evento.estado.in_(['COTIZADO', 'APROBADO', 'CONCLUIDO'])
    )

    # Filtros opcionales
    local_id = request.args.get('local_id')
    if local_id:
        query = query.filter(Evento.local_id == int(local_id))

    fecha_desde = request.args.get('fecha_desde')
    if fecha_desde:
        query = query.filter(Evento.fecha_evento >= fecha_desde)

    fecha_hasta = request.args.get('fecha_hasta')
    if fecha_hasta:
        query = query.filter(Evento.fecha_evento <= fecha_hasta)

    eventos = query.order_by(Evento.fecha_evento).all()

    resultado = []
    for e in eventos:
        resultado.append({
            'id': e.id,
            'cliente_nombre': e.cliente.nombre if e.cliente else 'Sin cliente',
            'fecha_evento': e.fecha_evento.isoformat() if e.fecha_evento else None,
            'hora_inicio': e.horario_inicio,
            'hora_fin': e.horario_fin,
            'local_id': e.local_id,
            'local_nombre': e.local.nombre if e.local else 'Sin local',
            'local_color': e.local.color if e.local else None,
            'estado': e.estado,
            'tipo_evento': e.tipo_evento,
            'cantidad_personas': e.cantidad_personas,
            'comercial_nombre': e.comercial.nombre if e.comercial else None
        })

    return jsonify(resultado)


@calendario_bp.route('/verificar-fecha', methods=['GET'])
def verificar_fecha_ocupada():
    """
    Verificar si hay eventos cotizados/aprobados en una fecha específica para un local.
    Útil para mostrar advertencia al cotizar un evento.

    Query params:
    - fecha: YYYY-MM-DD (requerido)
    - local_id: ID del local (requerido)
    - evento_id: ID del evento actual (para excluirlo de la búsqueda)
    """
    user = get_current_user()

    fecha = request.args.get('fecha')
    local_id = request.args.get('local_id')
    evento_id = request.args.get('evento_id')

    if not fecha or not local_id:
        return jsonify({'error': 'Se requiere fecha y local_id'}), 400

    # Buscar eventos en esa fecha y local
    query = db.session.query(Evento).options(
        joinedload(Evento.cliente)
    ).filter(
        Evento.fecha_evento == fecha,
        Evento.local_id == int(local_id),
        Evento.estado.in_(['COTIZADO', 'APROBADO', 'CONCLUIDO'])
    )

    # Excluir el evento actual si se proporciona
    if evento_id:
        query = query.filter(Evento.id != int(evento_id))

    eventos_existentes = query.all()

    eventos_info = []
    for e in eventos_existentes:
        eventos_info.append({
            'id': e.id,
            'cliente_nombre': e.cliente.nombre if e.cliente else 'Sin cliente',
            'estado': e.estado,
            'hora_inicio': e.horario_inicio,
            'hora_fin': e.horario_fin
        })

    return jsonify({
        'fecha': fecha,
        'local_id': int(local_id),
        'tiene_eventos': len(eventos_existentes) > 0,
        'cantidad_eventos': len(eventos_existentes),
        'eventos': eventos_info,
        'hay_aprobado': any(e.estado in ['APROBADO', 'CONCLUIDO'] for e in eventos_existentes),
        'hay_cotizado': any(e.estado == 'COTIZADO' for e in eventos_existentes)
    })
