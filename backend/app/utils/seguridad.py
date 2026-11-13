"""
Control de acceso de la API.

- login_requerido: usuario logueado (JWT) y activo.
- admin_requerido: usuario logueado con rol admin.
- servicio_requerido: integraciones (n8n, Evolution) con la clave de servicio.
- servicio_o_login: lo usan tanto la app (JWT) como las integraciones (clave).
- servicio_o_admin: procesos internos (cron, migraciones): clave o admin.

La clave de servicio se manda en el header X-API-Key, o en ?key= para el
webhook de Evolution (que no permite headers propios). Mientras
SERVICE_KEY_ENFORCE != 'true', las llamadas de integraciones sin clave se
aceptan y quedan registradas en el log, para migrar n8n y Evolution sin
cortar la entrada de leads.
"""
import hmac
import logging
import os
from functools import wraps

from flask import g, jsonify, request

from app.routes.auth import get_current_user_from_token

logger = logging.getLogger(__name__)


def _clave_servicio_valida():
    esperada = os.environ.get('SERVICE_API_KEY', '')
    if not esperada:
        return False
    recibida = request.headers.get('X-API-Key') or request.args.get('key') or ''
    return hmac.compare_digest(recibida.encode(), esperada.encode())


def _clave_servicio_obligatoria():
    return os.environ.get('SERVICE_KEY_ENFORCE', 'false').lower() == 'true'


def _usuario_activo():
    usuario = get_current_user_from_token()
    if usuario and usuario.activo:
        return usuario
    return None


def _no_autenticado():
    return jsonify({'error': 'No autenticado'}), 401


def login_requerido(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        usuario = _usuario_activo()
        if not usuario:
            return _no_autenticado()
        g.usuario = usuario
        return f(*args, **kwargs)
    return wrapper


def admin_requerido(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        usuario = _usuario_activo()
        if not usuario:
            return _no_autenticado()
        if usuario.rol != 'admin':
            return jsonify({'error': 'Solo administradores'}), 403
        g.usuario = usuario
        return f(*args, **kwargs)
    return wrapper


def _permitir_en_transicion(f, args, kwargs):
    if not _clave_servicio_obligatoria():
        logger.warning('Integración sin clave de servicio en %s %s (modo transición)', request.method, request.path)
        g.usuario = None
        return f(*args, **kwargs)
    return jsonify({'error': 'Clave de servicio inválida o ausente'}), 401


def servicio_requerido(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if _clave_servicio_valida():
            g.usuario = None
            return f(*args, **kwargs)
        return _permitir_en_transicion(f, args, kwargs)
    return wrapper


def servicio_o_login(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if _clave_servicio_valida():
            g.usuario = None
            return f(*args, **kwargs)
        usuario = _usuario_activo()
        if usuario:
            g.usuario = usuario
            return f(*args, **kwargs)
        return _permitir_en_transicion(f, args, kwargs)
    return wrapper


def servicio_o_admin(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if _clave_servicio_valida():
            g.usuario = None
            return f(*args, **kwargs)
        usuario = _usuario_activo()
        if not usuario:
            return _no_autenticado()
        if usuario.rol != 'admin':
            return jsonify({'error': 'Solo administradores'}), 403
        g.usuario = usuario
        return f(*args, **kwargs)
    return wrapper
