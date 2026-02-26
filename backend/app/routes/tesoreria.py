"""
Rutas API para panel de Tesorería
Endpoints para validar/rechazar pagos del pre-check
"""
from flask import Blueprint, request, jsonify
from app import db
from app.models import Evento, Usuario
from app.models_precheck import PrecheckPago
from app.routes.auth import token_required
from app.utils.timezone import ahora_argentina
from app.utils.storage import enrich_pago_dict
from decimal import Decimal
from datetime import datetime, timedelta

tesoreria_bp = Blueprint('tesoreria', __name__)


def verificar_acceso_tesoreria(usuario):
    """Solo admin y tesoreria pueden acceder"""
    return usuario.rol in ('admin', 'tesoreria')


@tesoreria_bp.route('/pagos-pendientes', methods=['GET'])
@token_required
def obtener_pagos_pendientes(current_user):
    """Lista pagos con estado REVISION, ordenados por fecha_pago ASC"""
    if not verificar_acceso_tesoreria(current_user):
        return jsonify({'error': 'Acceso no autorizado'}), 403

    pagos = PrecheckPago.query.filter_by(estado='REVISION') \
        .join(Evento, PrecheckPago.evento_id == Evento.id) \
        .order_by(PrecheckPago.fecha_pago.asc()) \
        .all()

    result = []
    for pago in pagos:
        evento = pago.evento
        result.append(enrich_pago_dict({
            **pago.to_dict(),
            'evento_titulo': evento.titulo or evento.generar_titulo_auto(),
            'cliente_nombre': evento.cliente.nombre if evento.cliente else None,
            'local_nombre': evento.local.nombre if evento.local else None,
            'comercial_nombre': evento.comercial.nombre if evento.comercial else None,
        }))

    return jsonify({
        'pagos': result,
        'total_pendientes': len(result)
    }), 200


@tesoreria_bp.route('/pagos-validados', methods=['GET'])
@token_required
def obtener_pagos_validados(current_user):
    """Lista pagos VALIDADO de los últimos 30 días"""
    if not verificar_acceso_tesoreria(current_user):
        return jsonify({'error': 'Acceso no autorizado'}), 403

    hace_30_dias = ahora_argentina() - timedelta(days=30)

    pagos = PrecheckPago.query.filter(
        PrecheckPago.estado == 'VALIDADO',
        PrecheckPago.fecha_validacion >= hace_30_dias
    ).order_by(PrecheckPago.fecha_validacion.desc()).all()

    result = []
    for pago in pagos:
        evento = pago.evento
        result.append(enrich_pago_dict({
            **pago.to_dict(),
            'evento_titulo': evento.titulo or evento.generar_titulo_auto(),
            'cliente_nombre': evento.cliente.nombre if evento.cliente else None,
            'local_nombre': evento.local.nombre if evento.local else None,
            'comercial_nombre': evento.comercial.nombre if evento.comercial else None,
        }))

    return jsonify({'pagos': result}), 200


@tesoreria_bp.route('/pagos-rechazados', methods=['GET'])
@token_required
def obtener_pagos_rechazados(current_user):
    """Lista pagos RECHAZADO de los últimos 30 días"""
    if not verificar_acceso_tesoreria(current_user):
        return jsonify({'error': 'Acceso no autorizado'}), 403

    hace_30_dias = ahora_argentina() - timedelta(days=30)

    pagos = PrecheckPago.query.filter(
        PrecheckPago.estado == 'RECHAZADO',
        PrecheckPago.fecha_validacion >= hace_30_dias
    ).order_by(PrecheckPago.fecha_validacion.desc()).all()

    result = []
    for pago in pagos:
        evento = pago.evento
        result.append(enrich_pago_dict({
            **pago.to_dict(),
            'evento_titulo': evento.titulo or evento.generar_titulo_auto(),
            'cliente_nombre': evento.cliente.nombre if evento.cliente else None,
            'local_nombre': evento.local.nombre if evento.local else None,
            'comercial_nombre': evento.comercial.nombre if evento.comercial else None,
        }))

    return jsonify({'pagos': result}), 200


@tesoreria_bp.route('/pagos/<int:pago_id>/validar', methods=['PUT'])
@token_required
def validar_pago(current_user, pago_id):
    """Validar un pago: requiere numero_oppen. Opcionalmente modifica monto."""
    if not verificar_acceso_tesoreria(current_user):
        return jsonify({'error': 'Acceso no autorizado'}), 403

    pago = PrecheckPago.query.get_or_404(pago_id)

    if pago.estado != 'REVISION':
        return jsonify({'error': 'Solo se pueden validar pagos en revisión'}), 400

    data = request.json
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    numero_oppen = data.get('numero_oppen', '').strip()
    if not numero_oppen:
        return jsonify({'error': 'El N° Oppen es obligatorio'}), 400

    # Verificar si se modifica el monto
    nuevo_monto = data.get('monto')
    if nuevo_monto is not None:
        nuevo_monto = Decimal(str(nuevo_monto))
        monto_actual = Decimal(str(pago.monto))

        if nuevo_monto != monto_actual:
            observacion = data.get('observacion_monto', '').strip()
            if not observacion:
                return jsonify({'error': 'La observación es obligatoria cuando se modifica el monto'}), 400

            pago.monto_original = monto_actual
            pago.monto = nuevo_monto
            pago.observacion_monto = observacion

    pago.estado = 'VALIDADO'
    pago.numero_oppen = numero_oppen
    pago.validado_por_id = current_user.id
    pago.fecha_validacion = ahora_argentina()

    db.session.commit()

    return jsonify({
        'message': 'Pago validado correctamente',
        'pago': enrich_pago_dict(pago.to_dict())
    }), 200


@tesoreria_bp.route('/pagos/<int:pago_id>/rechazar', methods=['PUT'])
@token_required
def rechazar_pago(current_user, pago_id):
    """Rechazar un pago: requiere motivo_rechazo"""
    if not verificar_acceso_tesoreria(current_user):
        return jsonify({'error': 'Acceso no autorizado'}), 403

    pago = PrecheckPago.query.get_or_404(pago_id)

    if pago.estado != 'REVISION':
        return jsonify({'error': 'Solo se pueden rechazar pagos en revisión'}), 400

    data = request.json
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    motivo = data.get('motivo_rechazo', '').strip()
    if not motivo:
        return jsonify({'error': 'El motivo de rechazo es obligatorio'}), 400

    pago.estado = 'RECHAZADO'
    pago.motivo_rechazo = motivo
    pago.validado_por_id = current_user.id
    pago.fecha_validacion = ahora_argentina()

    db.session.commit()

    return jsonify({
        'message': 'Pago rechazado',
        'pago': enrich_pago_dict(pago.to_dict())
    }), 200
