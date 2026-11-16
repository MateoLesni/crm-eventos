"""
Catálogo del pre-check: lista de precios, sectores de cada local y parámetros.
Lo consulta cualquier usuario logueado; lo modifican solo los admin (Pilar, el Tano, administración).

GET    /api/catalogo/items?local_id=&incluir_inactivos=1
POST   /api/catalogo/items
PUT    /api/catalogo/items/<id>
POST   /api/catalogo/items/copiar        {desde_local_id, hacia_local_id}
GET    /api/catalogo/sectores?local_id=&incluir_inactivos=1
POST   /api/catalogo/sectores
PUT    /api/catalogo/sectores/<id>
GET    /api/catalogo/config
PUT    /api/catalogo/config
"""
from decimal import Decimal, InvalidOperation

from flask import Blueprint, g, jsonify, request

from app import db
from app.models import Local
from app.models_precheck import (
    CATEGORIAS_PRECHECK, MODALIDADES, CatalogoItem, LocalSector, PrecheckConfig, leer_config,
)
from app.utils.precheck_calculo import ordenar_catalogo
from app.utils.seguridad import admin_requerido, login_requerido

catalogo_bp = Blueprint('catalogo', __name__)


def _decimal(valor, campo, minimo=None, maximo=None, opcional=False):
    if valor in (None, '') and opcional:
        return None
    try:
        n = Decimal(str(valor))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f'{campo} debe ser un número')
    if not n.is_finite():
        raise ValueError(f'{campo} debe ser un número')
    if minimo is not None and n < minimo:
        raise ValueError(f'{campo} no puede ser menor a {minimo}')
    if maximo is not None and n > maximo:
        raise ValueError(f'{campo} no puede ser mayor a {maximo}')
    return n


def _entero(valor, campo, opcional=True):
    if valor in (None, '') and opcional:
        return None
    try:
        n = int(valor)
    except (ValueError, TypeError):
        raise ValueError(f'{campo} debe ser un número entero')
    if n < 0:
        raise ValueError(f'{campo} no puede ser negativo')
    return n


def _local_valido(local_id):
    if local_id in (None, '', 0, '0'):
        return None
    local = db.session.get(Local, int(local_id))
    if not local:
        raise ValueError('Local inexistente')
    return local.id


# ==================== ÍTEMS ====================

@catalogo_bp.route('/items', methods=['GET'])
@login_requerido
def listar_items():
    q = CatalogoItem.query
    local_id = request.args.get('local_id')
    if local_id:
        q = q.filter(db.or_(CatalogoItem.local_id == int(local_id), CatalogoItem.local_id.is_(None)))
    if request.args.get('incluir_inactivos') not in ('1', 'true'):
        q = q.filter(CatalogoItem.activo.is_(True))
    items = ordenar_catalogo(q.all())
    return jsonify({'items': [i.to_dict() for i in items], 'categorias': CATEGORIAS_PRECHECK,
                    'modalidades': MODALIDADES}), 200


def _aplicar_item(item, data):
    if 'local_id' in data:
        item.local_id = _local_valido(data['local_id'])
    if 'categoria' in data:
        if data['categoria'] not in CATEGORIAS_PRECHECK:
            raise ValueError('Categoría inválida')
        item.categoria = data['categoria']
    if 'nombre' in data:
        nombre = (data['nombre'] or '').strip()
        if not nombre:
            raise ValueError('El nombre es obligatorio')
        item.nombre = nombre[:200]
    if 'descripcion' in data:
        item.descripcion = (data['descripcion'] or '').strip() or None
    if 'modalidad' in data:
        if data['modalidad'] not in MODALIDADES:
            raise ValueError('Modalidad inválida')
        item.modalidad = data['modalidad']
    if 'precio' in data:
        item.precio = _decimal(data['precio'], 'Precio')
    if 'ajusta_ipc' in data:
        item.ajusta_ipc = bool(data['ajusta_ipc'])
    if 'activo' in data:
        item.activo = bool(data['activo'])
    if 'orden' in data:
        item.orden = _entero(data['orden'], 'Orden') or 0
    if not item.categoria or not item.nombre or item.precio is None:
        raise ValueError('Faltan datos: categoría, nombre y precio')
    if not item.modalidad:
        item.modalidad = 'por_persona'
    item.updated_by_id = g.usuario.id


@catalogo_bp.route('/items', methods=['POST'])
@admin_requerido
def crear_item():
    item = CatalogoItem()
    try:
        _aplicar_item(item, request.get_json(silent=True) or {})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201


@catalogo_bp.route('/items/<int:item_id>', methods=['PUT'])
@admin_requerido
def actualizar_item(item_id):
    item = db.session.get(CatalogoItem, item_id)
    if not item:
        return jsonify({'error': 'No existe'}), 404
    try:
        _aplicar_item(item, request.get_json(silent=True) or {})
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    db.session.commit()
    return jsonify(item.to_dict()), 200


@catalogo_bp.route('/items/copiar', methods=['POST'])
@admin_requerido
def copiar_items():
    """Copia los ítems activos de un local a otro (para no cargar todo de cero)."""
    data = request.get_json(silent=True) or {}
    try:
        desde = _local_valido(data.get('desde_local_id'))
        hacia = _local_valido(data.get('hacia_local_id'))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    if not desde or not hacia or desde == hacia:
        return jsonify({'error': 'Elegí dos locales distintos'}), 400
    existentes = {(i.categoria, i.nombre.lower()) for i in CatalogoItem.query.filter_by(local_id=hacia).all()}
    copiados = 0
    for i in CatalogoItem.query.filter_by(local_id=desde, activo=True).all():
        if (i.categoria, i.nombre.lower()) in existentes:
            continue
        db.session.add(CatalogoItem(local_id=hacia, categoria=i.categoria, nombre=i.nombre, descripcion=i.descripcion,
                                    modalidad=i.modalidad, precio=i.precio, ajusta_ipc=i.ajusta_ipc,
                                    orden=i.orden, updated_by_id=g.usuario.id))
        copiados += 1
    db.session.commit()
    return jsonify({'copiados': copiados}), 200


# ==================== SECTORES ====================

@catalogo_bp.route('/sectores', methods=['GET'])
@login_requerido
def listar_sectores():
    q = LocalSector.query
    if request.args.get('local_id'):
        q = q.filter_by(local_id=int(request.args['local_id']))
    if request.args.get('incluir_inactivos') not in ('1', 'true'):
        q = q.filter(LocalSector.activo.is_(True))
    sectores = q.order_by(LocalSector.local_id, LocalSector.orden, LocalSector.nombre).all()
    return jsonify({'sectores': [s.to_dict() for s in sectores]}), 200


def _aplicar_sector(sector, data):
    if 'local_id' in data:
        local_id = _local_valido(data['local_id'])
        if not local_id:
            raise ValueError('El sector tiene que tener un local')
        sector.local_id = local_id
    if 'nombre' in data:
        nombre = (data['nombre'] or '').strip()
        if not nombre:
            raise ValueError('El nombre es obligatorio')
        sector.nombre = nombre[:100]
    if 'pax_min' in data:
        sector.pax_min = _entero(data['pax_min'], 'Pax mínimo')
    if 'pax_max' in data:
        sector.pax_max = _entero(data['pax_max'], 'Pax máximo')
    if 'precio_exclusividad' in data:
        sector.precio_exclusividad = _decimal(data['precio_exclusividad'], 'Exclusividad', minimo=0, opcional=True)
    if 'observaciones' in data:
        sector.observaciones = (data['observaciones'] or '').strip() or None
    if 'activo' in data:
        sector.activo = bool(data['activo'])
    if 'orden' in data:
        sector.orden = _entero(data['orden'], 'Orden') or 0
    if sector.pax_min and sector.pax_max and sector.pax_min > sector.pax_max:
        raise ValueError('El mínimo de personas no puede ser mayor al máximo')
    if not sector.local_id or not sector.nombre:
        raise ValueError('Faltan datos: local y nombre')


@catalogo_bp.route('/sectores', methods=['POST'])
@admin_requerido
def crear_sector():
    sector = LocalSector()
    try:
        _aplicar_sector(sector, request.get_json(silent=True) or {})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    db.session.add(sector)
    db.session.commit()
    return jsonify(sector.to_dict()), 201


@catalogo_bp.route('/sectores/<int:sector_id>', methods=['PUT'])
@admin_requerido
def actualizar_sector(sector_id):
    sector = db.session.get(LocalSector, sector_id)
    if not sector:
        return jsonify({'error': 'No existe'}), 404
    try:
        _aplicar_sector(sector, request.get_json(silent=True) or {})
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    db.session.commit()
    return jsonify(sector.to_dict()), 200


# ==================== CONFIGURACIÓN ====================

def _config_respuesta():
    valores = leer_config()
    locales = Local.query.filter_by(activo=True).order_by(Local.nombre).all()
    return {
        'sena_porcentaje': float(valores.get('sena_porcentaje') or 50),
        'dias_saldo_antes_evento': int(float(valores.get('dias_saldo_antes_evento') or 7)),
        'condiciones': valores.get('condiciones') or '',
        'propinas': [{'local_id': l.id, 'local': l.nombre,
                      'porcentaje': float(valores.get(f'propina_local_{l.id}') or 0)} for l in locales],
    }


@catalogo_bp.route('/config', methods=['GET'])
@login_requerido
def obtener_config():
    return jsonify(_config_respuesta()), 200


def _guardar(clave, valor):
    fila = db.session.get(PrecheckConfig, clave)
    if fila is None:
        fila = PrecheckConfig(clave=clave)
        db.session.add(fila)
    fila.valor = valor
    fila.updated_by_id = g.usuario.id


@catalogo_bp.route('/config', methods=['PUT'])
@admin_requerido
def actualizar_config():
    data = request.get_json(silent=True) or {}
    try:
        if 'sena_porcentaje' in data:
            _guardar('sena_porcentaje', str(_decimal(data['sena_porcentaje'], 'Seña', minimo=0, maximo=100)))
        if 'dias_saldo_antes_evento' in data:
            dias = _entero(data['dias_saldo_antes_evento'], 'Días', opcional=False)
            if dias > 90:
                raise ValueError('Días: máximo 90')
            _guardar('dias_saldo_antes_evento', str(dias))
        if 'condiciones' in data:
            texto = (data['condiciones'] or '').strip()
            if len(texto) > 20000:
                raise ValueError('El texto de condiciones es demasiado largo')
            _guardar('condiciones', texto)
        for p in data.get('propinas') or []:
            local_id = _local_valido(p.get('local_id'))
            if not local_id:
                raise ValueError('Local inválido en propinas')
            _guardar(f'propina_local_{local_id}', str(_decimal(p.get('porcentaje') or 0, 'Propina', minimo=0, maximo=30)))
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    db.session.commit()
    return jsonify(_config_respuesta()), 200

