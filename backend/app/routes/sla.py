"""
Endpoints para sistema SLA de alertas y violaciones.
- Notificaciones: conteo y lista de eventos en alerta/crítico
- Check-violations: cron job para registrar violaciones críticas
- Violations: historial de violaciones para informes CEO
"""
from flask import Blueprint, request, jsonify
from app import db
from app.models import Evento, Usuario
from app.models_sla import SlaViolation
from app.routes.auth import get_current_user_from_token
from app.utils.sla import calcular_sla_evento, SLA_CONFIG
from app.utils.timezone import ahora_argentina
from sqlalchemy.orm import joinedload
from datetime import datetime

sla_bp = Blueprint('sla', __name__)


@sla_bp.route('/notificaciones', methods=['GET'])
def obtener_notificaciones():
    """
    Obtener resumen de alertas SLA para el usuario actual.
    Comerciales ven solo sus eventos; admins ven todos.
    """
    try:
        user = get_current_user_from_token()

        estados_con_sla = list(SLA_CONFIG.keys())

        query = Evento.query.options(
            joinedload(Evento.cliente),
            joinedload(Evento.comercial)
        ).filter(Evento.estado.in_(estados_con_sla))

        # Comerciales solo ven sus eventos + CONSULTA_ENTRANTE sin asignar
        if user and user.rol == 'comercial':
            from sqlalchemy import or_
            query = query.filter(
                or_(
                    Evento.comercial_id == user.id,
                    Evento.comercial_id.is_(None)
                )
            )

        eventos = query.all()

        alertas = []
        criticos = []

        for evento in eventos:
            sla = calcular_sla_evento(evento)
            if not sla or sla['status'] == 'ok':
                continue

            item = {
                'id': evento.id,
                'titulo_display': evento.titulo or evento.generar_titulo_auto(),
                'estado': evento.estado,
                'sla_status': sla['status'],
                'segundos': sla['segundos'],
                'comercial_nombre': evento.comercial.nombre if evento.comercial else None,
                'cliente_nombre': evento.cliente.nombre if evento.cliente else None,
            }

            if sla['status'] == 'critico':
                criticos.append(item)
            else:
                alertas.append(item)

        # Ordenar por tiempo transcurrido (más urgente primero)
        criticos.sort(key=lambda x: x['segundos'], reverse=True)
        alertas.sort(key=lambda x: x['segundos'], reverse=True)

        # Críticos primero, luego alertas. Máximo 50.
        todos = (criticos + alertas)[:50]

        return jsonify({
            'total_alertas': len(alertas),
            'total_criticos': len(criticos),
            'total': len(alertas) + len(criticos),
            'eventos': todos,
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@sla_bp.route('/check-violations', methods=['POST'])
def check_violations():
    """
    Cron job: escanea eventos activos y registra violaciones SLA críticas.
    Diseñado para ejecutarse diariamente via Cloud Scheduler.
    """
    try:
        estados_con_sla = list(SLA_CONFIG.keys())
        eventos = Evento.query.filter(
            Evento.estado.in_(estados_con_sla)
        ).all()

        nuevas = 0
        for evento in eventos:
            sla = calcular_sla_evento(evento)
            if not sla or sla['status'] != 'critico':
                continue

            # Verificar si ya existe violación para este evento en este estado
            existe = SlaViolation.query.filter_by(
                evento_id=evento.id,
                estado=evento.estado
            ).first()

            if not existe:
                violacion = SlaViolation(
                    evento_id=evento.id,
                    estado=evento.estado,
                    comercial_id=evento.comercial_id,
                    comercial_nombre=evento.comercial.nombre if evento.comercial else None,
                    fecha_violacion=ahora_argentina(),
                    segundos_transcurridos=sla['segundos'],
                )
                db.session.add(violacion)
                nuevas += 1

        db.session.commit()

        return jsonify({
            'status': 'ok',
            'nuevas_violaciones': nuevas,
            'eventos_escaneados': len(eventos),
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@sla_bp.route('/violations', methods=['GET'])
def listar_violations():
    """
    Historial de violaciones SLA para informes del CEO.
    Filtros: fecha_desde, fecha_hasta, comercial_id
    Solo accesible para admins.
    """
    try:
        user = get_current_user_from_token()
        if not user or user.rol != 'admin':
            return jsonify({'error': 'Solo administradores'}), 403

        fecha_desde_str = request.args.get('fecha_desde')
        fecha_hasta_str = request.args.get('fecha_hasta')
        comercial_id = request.args.get('comercial_id', type=int)

        query = SlaViolation.query.options(
            joinedload(SlaViolation.evento)
        )

        if fecha_desde_str:
            fecha_desde = datetime.strptime(fecha_desde_str, '%Y-%m-%d')
            query = query.filter(SlaViolation.fecha_violacion >= fecha_desde)
        if fecha_hasta_str:
            fecha_hasta = datetime.strptime(fecha_hasta_str, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
            query = query.filter(SlaViolation.fecha_violacion <= fecha_hasta)
        if comercial_id:
            query = query.filter_by(comercial_id=comercial_id)

        violaciones = query.order_by(SlaViolation.fecha_violacion.desc()).limit(200).all()

        return jsonify({
            'violaciones': [v.to_dict() for v in violaciones],
            'total': len(violaciones),
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
