"""
API de export para consumidores externos (dashboard).
Solo lectura, autenticada por API key, con rate limit, cache y paginación por cursor.

Protecciones:
- X-API-Key obligatoria (env var EXPORT_API_KEY; si no está definida, el endpoint queda deshabilitado)
- limit capeado a 500 filas por request
- Rate limit: 30 requests por minuto por API key
- Cache en memoria de 60 segundos por combinación de parámetros
"""
import os
import time
import threading
from collections import deque
from datetime import datetime
from functools import wraps

from flask import Blueprint, request, jsonify
from sqlalchemy.orm import joinedload

from app import db
from app.models import Evento
from app.utils.timezone import ahora_argentina

export_bp = Blueprint('export', __name__)

MAX_LIMIT = 500
DEFAULT_LIMIT = 200
RATE_LIMIT_REQUESTS = 30      # requests
RATE_LIMIT_WINDOW = 60        # segundos
CACHE_TTL = 60                # segundos
CACHE_MAX_ENTRIES = 100

_rate_lock = threading.Lock()
_request_log = deque()        # timestamps de requests aceptadas (una sola key)

_cache_lock = threading.Lock()
_cache = {}                   # querystring -> (timestamp, payload)


def _check_api_key():
    expected = os.environ.get('EXPORT_API_KEY')
    if not expected:
        return jsonify({'error': 'Export deshabilitado (EXPORT_API_KEY no configurada)'}), 503
    provided = request.headers.get('X-API-Key', '')
    if provided != expected:
        return jsonify({'error': 'API key inválida o ausente'}), 401
    return None


def _check_rate_limit():
    """30 requests por minuto. Devuelve None si pasa, o respuesta 429."""
    now = time.monotonic()
    with _rate_lock:
        while _request_log and now - _request_log[0] > RATE_LIMIT_WINDOW:
            _request_log.popleft()
        if len(_request_log) >= RATE_LIMIT_REQUESTS:
            retry_after = int(RATE_LIMIT_WINDOW - (now - _request_log[0])) + 1
            resp = jsonify({
                'error': 'Demasiadas requests. Máximo 30 por minuto.',
                'retry_after_segundos': retry_after
            })
            resp.status_code = 429
            resp.headers['Retry-After'] = str(retry_after)
            return resp
        _request_log.append(now)
    return None


def protegido(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        error = _check_api_key()
        if error:
            return error
        error = _check_rate_limit()
        if error:
            return error
        return f(*args, **kwargs)
    return wrapper


def _cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and time.monotonic() - entry[0] < CACHE_TTL:
            return entry[1]
    return None


def _cache_set(key, payload):
    with _cache_lock:
        if len(_cache) >= CACHE_MAX_ENTRIES:
            _cache.clear()
        _cache[key] = (time.monotonic(), payload)


def _iso(valor):
    return valor.isoformat() if valor else None


def _evento_export_dict(e):
    """Contrato de campos del export. Todo lo que sale hacia el dashboard está acá."""
    return {
        'id': e.id,
        'estado': e.estado,
        'titulo': e.titulo,
        'tipo': e.tipo,
        'canal_origen': e.canal_origen,
        'fecha_evento': _iso(e.fecha_evento),
        'horario_inicio': str(e.horario_inicio) if e.horario_inicio else None,
        'horario_fin': str(e.horario_fin) if e.horario_fin else None,
        'hora_consulta': str(e.hora_consulta) if e.hora_consulta else None,
        'cantidad_personas': e.cantidad_personas,
        'presupuesto': float(e.presupuesto) if e.presupuesto is not None else None,
        'fecha_presupuesto': _iso(e.fecha_presupuesto),
        'facturada': e.facturada,
        'es_prioritario': e.es_prioritario,
        'es_tentativo': e.es_tentativo,
        'motivo_rechazo': e.motivo_rechazo,
        'mensaje_original': e.mensaje_original,
        'fecha_creacion': _iso(e.created_at),
        'fecha_actualizacion': _iso(e.updated_at),
        'fecha_ultimo_cambio_estado': _iso(e.fecha_ultimo_cambio_estado),
        'local': {
            'id': e.local.id,
            'nombre': e.local.nombre,
        } if e.local else None,
        'vendedor': {
            'id': e.comercial.id,
            'nombre': e.comercial.nombre,
            'email': e.comercial.email,
        } if e.comercial else None,
        'cliente': {
            'id': e.cliente.id,
            'nombre': e.cliente.nombre,
            'telefono': e.cliente.telefono,
            'email': e.cliente.email,
            'empresa': e.cliente.empresa,
            'notas': e.cliente.notas,
            'fecha_creacion': _iso(e.cliente.created_at),
        } if e.cliente else None,
    }


# GET /api/export/ping - Probar conectividad y API key
@export_bp.route('/ping', methods=['GET'])
@protegido
def ping():
    return jsonify({
        'status': 'ok',
        'server_time': ahora_argentina().isoformat(),
        'timezone': 'America/Argentina/Buenos_Aires (UTC-3)'
    })


# GET /api/export/eventos - Export de tarjetas del pipeline
@export_bp.route('/eventos', methods=['GET'])
@protegido
def export_eventos():
    # server_time se toma ANTES de la query: usarlo como updated_since de la
    # próxima llamada garantiza no perder cambios ocurridos durante esta.
    server_time = ahora_argentina()

    try:
        limit = min(int(request.args.get('limit', DEFAULT_LIMIT)), MAX_LIMIT)
        if limit < 1:
            limit = DEFAULT_LIMIT
    except ValueError:
        return jsonify({'error': 'limit debe ser un número entero'}), 400

    try:
        after_id = int(request.args.get('after_id', 0))
    except ValueError:
        return jsonify({'error': 'after_id debe ser un número entero'}), 400

    updated_since = None
    updated_since_raw = request.args.get('updated_since')
    if updated_since_raw:
        try:
            updated_since = datetime.fromisoformat(updated_since_raw)
            if updated_since.tzinfo is not None:
                # Normalizar a hora argentina naive (todo el CRM opera en UTC-3)
                from app.utils.timezone import AR_TIMEZONE
                updated_since = updated_since.astimezone(AR_TIMEZONE).replace(tzinfo=None)
        except ValueError:
            return jsonify({'error': 'updated_since debe ser fecha ISO, ej: 2026-09-10T15:30:00'}), 400

    cache_key = f"{limit}|{after_id}|{updated_since_raw}"
    cached = _cache_get(cache_key)
    if cached:
        return jsonify(cached)

    query = (Evento.query
             .options(joinedload(Evento.cliente),
                      joinedload(Evento.local),
                      joinedload(Evento.comercial))
             .filter(Evento.id > after_id))

    if updated_since:
        query = query.filter(Evento.updated_at >= updated_since)

    eventos = query.order_by(Evento.id.asc()).limit(limit + 1).all()

    has_more = len(eventos) > limit
    eventos = eventos[:limit]

    payload = {
        'eventos': [_evento_export_dict(e) for e in eventos],
        'cantidad': len(eventos),
        'has_more': has_more,
        'next_after_id': eventos[-1].id if eventos else after_id,
        'server_time': server_time.isoformat(),
        'timezone': 'America/Argentina/Buenos_Aires (UTC-3)'
    }

    _cache_set(cache_key, payload)
    return jsonify(payload)
