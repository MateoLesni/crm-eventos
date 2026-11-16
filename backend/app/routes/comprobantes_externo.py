"""
API de comprobantes de pago para otras apps (ej. Control de Cajas).
Solo lectura. Clave propia: env COMPROBANTES_API_KEY, header X-API-Key.
Si la variable no está, la API queda apagada (503).

GET /api/externo/comprobantes
    estado=REVISION|VALIDADO|RECHAZADO   (opcional)
    desde=AAAA-MM-DD / hasta=AAAA-MM-DD  (fecha de pago, opcional)
    actualizado_desde=AAAA-MM-DDTHH:MM:SS (para sincronizar solo lo que cambió)
    local_id=N
    limit (máx. 100, default 50) / cursor (id del último que recibiste)
    sin_urls=1  no genera los links a las imágenes (más rápido)
GET /api/externo/comprobantes/<id>
    un pago, con link a la imagen recién generado (dura 30 min)
"""
import hmac
import os
import threading
import time
from collections import deque
from datetime import date, datetime
from functools import wraps

from flask import Blueprint, jsonify, request
from sqlalchemy.orm import joinedload

from app import db
from app.models import Evento
from app.models_precheck import PrecheckPago
from app.utils.storage import generar_signed_url

comprobantes_externo_bp = Blueprint('comprobantes_externo', __name__)

MAX_LIMIT = 100
DEFAULT_LIMIT = 50
RATE_LIMIT = 60   # requests por minuto
ESTADOS = ('REVISION', 'VALIDADO', 'RECHAZADO')

_lock = threading.Lock()
_log = deque()


def protegido(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        esperada = os.environ.get('COMPROBANTES_API_KEY', '')
        if not esperada:
            return jsonify({'error': 'API de comprobantes deshabilitada'}), 503
        recibida = request.headers.get('X-API-Key', '')
        if not hmac.compare_digest(recibida.encode(), esperada.encode()):
            return jsonify({'error': 'API key inválida o ausente'}), 401
        ahora = time.monotonic()
        with _lock:
            while _log and ahora - _log[0] > 60:
                _log.popleft()
            if len(_log) >= RATE_LIMIT:
                resp = jsonify({'error': f'Máximo {RATE_LIMIT} requests por minuto'})
                resp.status_code = 429
                resp.headers['Retry-After'] = str(int(60 - (ahora - _log[0])) + 1)
                return resp
            _log.append(ahora)
        return f(*args, **kwargs)
    return wrapper


def _pago_dict(pago, con_url=True):
    ev = pago.evento
    tiene = bool(pago.comprobante_url)
    return {
        'id': pago.id,
        'estado': pago.estado,
        'metodo_pago': pago.metodo_pago,
        'monto': float(pago.monto) if pago.monto is not None else None,
        'monto_original': float(pago.monto_original) if pago.monto_original is not None else None,
        'observacion_monto': pago.observacion_monto,
        'fecha_pago': pago.fecha_pago.isoformat() if pago.fecha_pago else None,
        'fecha_deposito': pago.fecha_deposito.isoformat() if pago.fecha_deposito else None,
        'fecha_acreditacion': pago.fecha_acreditacion.isoformat() if pago.fecha_acreditacion else None,
        'notas': pago.notas,
        'numero_oppen': pago.numero_oppen,
        'validado_por': pago.validado_por.nombre if pago.validado_por else None,
        'fecha_validacion': pago.fecha_validacion.isoformat() if pago.fecha_validacion else None,
        'motivo_rechazo': pago.motivo_rechazo,
        'comprobante': {
            'tiene': tiene,
            'nombre': pago.comprobante_nombre,
            'url': generar_signed_url(pago.comprobante_url) if (tiene and con_url) else None,
            'url_vence_en_minutos': 30 if (tiene and con_url) else None,
        },
        'evento': {
            'id': ev.id,
            'titulo': ev.titulo or ev.generar_titulo_auto(),
            'fecha_evento': ev.fecha_evento.isoformat() if ev.fecha_evento else None,
            'local_id': ev.local_id,
            'local': ev.local.nombre if ev.local else None,
            'cliente': ev.cliente.nombre if ev.cliente else None,
            'comercial': ev.comercial.nombre if ev.comercial else None,
            'facturada': bool(ev.facturada),
        },
        'created_at': pago.created_at.isoformat() if pago.created_at else None,
        'updated_at': pago.updated_at.isoformat() if pago.updated_at else None,
    }


@comprobantes_externo_bp.route('/comprobantes', methods=['GET'])
@protegido
def listar():
    a = request.args
    try:
        limit = min(max(int(a.get('limit', DEFAULT_LIMIT)), 1), MAX_LIMIT)
        cursor = int(a['cursor']) if a.get('cursor') else None
        desde = date.fromisoformat(a['desde']) if a.get('desde') else None
        hasta = date.fromisoformat(a['hasta']) if a.get('hasta') else None
        act = datetime.fromisoformat(a['actualizado_desde']) if a.get('actualizado_desde') else None
        local_id = int(a['local_id']) if a.get('local_id') else None
    except (ValueError, TypeError):
        return jsonify({'error': 'Parámetro inválido (fechas AAAA-MM-DD, números enteros)'}), 400
    estado = (a.get('estado') or '').upper() or None
    if estado and estado not in ESTADOS:
        return jsonify({'error': 'estado debe ser REVISION, VALIDADO o RECHAZADO'}), 400

    q = PrecheckPago.query.join(Evento, PrecheckPago.evento_id == Evento.id).options(
        joinedload(PrecheckPago.evento).joinedload(Evento.local),
        joinedload(PrecheckPago.evento).joinedload(Evento.cliente),
        joinedload(PrecheckPago.evento).joinedload(Evento.comercial),
        joinedload(PrecheckPago.validado_por),
    )
    if estado:
        q = q.filter(PrecheckPago.estado == estado)
    if desde:
        q = q.filter(PrecheckPago.fecha_pago >= desde)
    if hasta:
        q = q.filter(PrecheckPago.fecha_pago <= hasta)
    if act:
        q = q.filter(PrecheckPago.updated_at >= act)
    if local_id:
        q = q.filter(Evento.local_id == local_id)
    if cursor:
        q = q.filter(PrecheckPago.id > cursor)

    pagos = q.order_by(PrecheckPago.id.asc()).limit(limit + 1).all()
    hay_mas = len(pagos) > limit
    pagos = pagos[:limit]
    con_url = a.get('sin_urls') not in ('1', 'true')
    return jsonify({
        'comprobantes': [_pago_dict(p, con_url) for p in pagos],
        'cantidad': len(pagos),
        'siguiente_cursor': pagos[-1].id if (hay_mas and pagos) else None,
    }), 200


@comprobantes_externo_bp.route('/comprobantes/<int:pago_id>', methods=['GET'])
@protegido
def detalle(pago_id):
    pago = db.session.get(PrecheckPago, pago_id)
    if not pago:
        return jsonify({'error': 'No existe'}), 404
    return jsonify(_pago_dict(pago)), 200
