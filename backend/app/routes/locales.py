"""
Rutas para gestión de Locales
"""
from flask import Blueprint, jsonify
from app import db
from app.models import Local
from app.routes.auth import get_current_user_from_token

locales_bp = Blueprint('locales', __name__)


def get_current_user():
    return get_current_user_from_token()


@locales_bp.route('', methods=['GET'])
def listar_locales():
    """
    Obtener lista de locales activos.
    """
    user = get_current_user()

    locales = Local.query.filter_by(activo=True).order_by(Local.nombre).all()

    return jsonify([{
        'id': l.id,
        'nombre': l.nombre,
        'color': l.color,
        'direccion': l.direccion if hasattr(l, 'direccion') else None
    } for l in locales])


@locales_bp.route('/<int:local_id>', methods=['GET'])
def obtener_local(local_id):
    """
    Obtener un local específico por ID.
    """
    user = get_current_user()

    local = Local.query.get_or_404(local_id)

    return jsonify({
        'id': local.id,
        'nombre': local.nombre,
        'color': local.color,
        'direccion': local.direccion if hasattr(local, 'direccion') else None,
        'activo': local.activo
    })
