"""
Rutas API del Pre-Check.

Flujo: el comercial lo arma (BORRADOR) -> lo manda a revisión (EN_REVISION) ->
Pilar o el Tano lo aprueban (APROBADO) -> se cierra el primer día hábil
después del evento con los adicionales (CERRADO). Todo cambio queda en el historial.
"""
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request

from app import db
from app.models import Evento
from app.models_precheck import (
    CATEGORIA_AJUSTE_IPC, CATEGORIAS_LEGACY, CATEGORIAS_PRECHECK,
    METODOS_PAGO, MODALIDADES, CatalogoItem, LocalSector, Precheck, PrecheckAdicional,
    PrecheckConcepto, PrecheckHistorial, PrecheckPago, leer_config,
)
from app.routes.auth import token_required
from app.utils.precheck_calculo import (
    calcular_alertas, calcular_ipc_pendiente, calcular_resumen, ordenar_catalogo, ordenar_items, proximo_dia_habil,
)
from app.utils.storage import eliminar_archivo, enrich_pago_dict, subir_archivo
from app.utils.timezone import ahora_argentina

precheck_bp = Blueprint('precheck', __name__)

ESTADOS_EVENTO_CON_PRECHECK = ('APROBADO', 'CONCLUIDO')


# ==================== HELPERS ====================

def _es_admin(usuario):
    return usuario.rol == 'admin'


def _puede_ver(evento, usuario):
    return _es_admin(usuario) or evento.comercial_id == usuario.id


def _estado_precheck(evento):
    return evento.precheck.estado if evento.precheck else 'BORRADOR'


def verificar_permiso_edicion(evento, usuario):
    """Puede editar ítems/cabecera: evento confirmado, dueño o admin, y pre-check sin cerrar."""
    if evento.estado not in ESTADOS_EVENTO_CON_PRECHECK:
        return False, 'El pre-check solo está disponible para eventos aprobados o concluidos'
    if not _puede_ver(evento, usuario):
        return False, 'No tienes permiso para editar este pre-check'
    if _estado_precheck(evento) == 'CERRADO':
        return False, 'El pre-check está cerrado. Pilar o el Tano pueden reabrirlo.'
    return True, None


def verificar_permiso_pagos(evento, usuario):
    """Los pagos se pueden cargar siempre (también con el pre-check cerrado: cuenta corriente)."""
    if evento.estado not in ESTADOS_EVENTO_CON_PRECHECK:
        return False, 'Los pagos solo están disponibles para eventos aprobados o concluidos'
    if not _puede_ver(evento, usuario):
        return False, 'No tienes permiso para editar los pagos de este evento'
    return True, None


def obtener_o_crear_precheck(evento):
    pc = evento.precheck
    if pc is None:
        config = leer_config()
        propina = config.get(f'propina_local_{evento.local_id}') or '0'
        pc = Precheck(evento_id=evento.id, estado='BORRADOR', propina_porcentaje=Decimal(str(propina)))
        db.session.add(pc)
        evento.precheck = pc
    return pc


def registrar(evento, usuario, accion, detalle=None):
    db.session.add(PrecheckHistorial(
        evento_id=evento.id, usuario_id=usuario.id if usuario else None, accion=accion, detalle=detalle))


def marcar_cambio(evento, usuario):
    """Si alguien que no es admin cambia un pre-check ya aprobado, queda marcado para que lo revisen."""
    pc = obtener_o_crear_precheck(evento)
    if pc.estado == 'APROBADO' and not _es_admin(usuario):
        pc.modificado_post_aprobacion = True


def _num(valor, campo, permitir_negativo=True):
    try:
        n = Decimal(str(valor))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f'{campo} debe ser un número')
    if not n.is_finite():
        raise ValueError(f'{campo} debe ser un número')
    if not permitir_negativo and n < 0:
        raise ValueError(f'{campo} no puede ser negativo')
    return n


def _pesos(n):
    return f"${float(n):,.0f}".replace(',', '.')


def _categoria_valida(cat):
    return cat in CATEGORIAS_PRECHECK or cat in CATEGORIAS_LEGACY


def _nombre_categoria(obj):
    return obj.categoria_otro if obj.categoria == 'Otros' and obj.categoria_otro else obj.categoria


def _permisos(evento, usuario):
    puede_editar, motivo = verificar_permiso_edicion(evento, usuario)
    puede_pagos, _ = verificar_permiso_pagos(evento, usuario)
    estado = _estado_precheck(evento)
    admin = _es_admin(usuario)
    return {
        'puede_editar': puede_editar,
        'motivo_no_editable': motivo,
        'puede_editar_pagos': puede_pagos,
        'es_admin': admin,
        'puede_enviar_revision': puede_editar and estado == 'BORRADOR',
        'puede_aprobar': admin and estado in ('BORRADOR', 'EN_REVISION') or (
            admin and estado == 'APROBADO' and bool(evento.precheck and evento.precheck.modificado_post_aprobacion)),
        'puede_devolver': admin and estado == 'EN_REVISION',
        'puede_cerrar': admin and estado == 'APROBADO' and bool(evento.fecha_evento) and date.today() > evento.fecha_evento,
        'puede_reabrir': admin and estado == 'CERRADO',
        'puede_aplicar_ipc': admin and puede_editar,
    }


def _respuesta_resumen(evento, extra=None):
    """Lo que devuelven las acciones de edición: resumen + alertas actualizados."""
    resumen = calcular_resumen(evento)
    data = {'resumen': resumen, 'alertas': calcular_alertas(evento, resumen)}
    if extra:
        data.update(extra)
    return data


# ==================== OBTENER ====================

@precheck_bp.route('/<int:evento_id>', methods=['GET'])
@token_required
def obtener_precheck(current_user, evento_id):
    evento = Evento.query.get_or_404(evento_id)
    if not _puede_ver(evento, current_user):
        return jsonify({'error': 'No tienes acceso a este evento'}), 403

    conceptos = ordenar_items(evento.precheck_conceptos.all())
    adicionales = ordenar_items(evento.precheck_adicionales.all())
    pagos = evento.precheck_pagos.order_by(PrecheckPago.fecha_pago.desc())
    resumen = calcular_resumen(evento)

    catalogo = CatalogoItem.query.filter(
        CatalogoItem.activo.is_(True),
        db.or_(CatalogoItem.local_id == evento.local_id, CatalogoItem.local_id.is_(None)),
    ).all()
    catalogo = ordenar_catalogo(catalogo)
    sectores = LocalSector.query.filter_by(local_id=evento.local_id, activo=True) \
        .order_by(LocalSector.orden, LocalSector.nombre).all() if evento.local_id else []
    historial = PrecheckHistorial.query.filter_by(evento_id=evento_id) \
        .order_by(PrecheckHistorial.created_at.desc(), PrecheckHistorial.id.desc()).limit(200).all()
    config = leer_config()
    permisos = _permisos(evento, current_user)

    cabecera = evento.precheck.to_dict() if evento.precheck else {
        'sector_id': None, 'sector': None, 'motivo': None, 'razon_social': None,
        'propina_porcentaje': float(config.get(f'propina_local_{evento.local_id}') or 0),
        'estado': 'BORRADOR', 'modificado_post_aprobacion': False,
    }

    return jsonify({
        'evento_id': evento_id,
        'estado': evento.estado,
        'facturada': evento.facturada,
        'evento': {
            'fecha_evento': evento.fecha_evento.isoformat() if evento.fecha_evento else None,
            'horario_inicio': evento.horario_inicio.strftime('%H:%M') if evento.horario_inicio else None,
            'horario_fin': evento.horario_fin.strftime('%H:%M') if evento.horario_fin else None,
            'cantidad_personas': evento.cantidad_personas,
            'local_id': evento.local_id,
            'local': evento.local.nombre if evento.local else None,
            'cliente': evento.cliente.nombre if evento.cliente else None,
            'es_agencia': bool(getattr(evento.cliente, 'es_agencia', False)) if evento.cliente else False,
            'fecha_cierre_sugerida': proximo_dia_habil(evento.fecha_evento).isoformat() if evento.fecha_evento else None,
        },
        'precheck': cabecera,
        'conceptos': [c.to_dict() for c in conceptos],
        'adicionales': [a.to_dict() for a in adicionales],
        'pagos': [enrich_pago_dict(p.to_dict()) for p in pagos],
        'resumen': resumen,
        'alertas': calcular_alertas(evento, resumen),
        'historial': [h.to_dict() for h in historial],
        'catalogo': [i.to_dict() for i in catalogo],
        'sectores': [s.to_dict() for s in sectores],
        'config': {
            'sena_porcentaje': float(config.get('sena_porcentaje') or 50),
            'dias_saldo_antes_evento': int(float(config.get('dias_saldo_antes_evento') or 7)),
            'tiene_condiciones': bool((config.get('condiciones') or '').strip()),
        },
        'permisos': permisos,
        # compatibilidad con la versión anterior del frontend
        'puede_editar': permisos['puede_editar'],
        'puede_editar_pagos': permisos['puede_editar_pagos'],
        'categorias': CATEGORIAS_PRECHECK,
        'modalidades': MODALIDADES,
        'metodos_pago': METODOS_PAGO,
    }), 200


# ==================== CABECERA ====================

@precheck_bp.route('/<int:evento_id>/cabecera', methods=['PUT'])
@token_required
def actualizar_cabecera(current_user, evento_id):
    evento = Evento.query.get_or_404(evento_id)
    ok, error = verificar_permiso_edicion(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    data = request.get_json(silent=True) or {}
    pc = obtener_o_crear_precheck(evento)
    cambios = []

    if 'sector_id' in data:
        sector = None
        if data['sector_id']:
            sector = db.session.get(LocalSector, int(data['sector_id']))
            if not sector or sector.local_id != evento.local_id:
                return jsonify({'error': 'El sector no pertenece al local del evento'}), 400
        if pc.sector_id != (sector.id if sector else None):
            cambios.append(f"Sector: {pc.sector.nombre if pc.sector else '—'} → {sector.nombre if sector else '—'}")
            pc.sector_id = sector.id if sector else None
            pc.sector = sector
    for campo, etiqueta, largo in (('motivo', 'Motivo', 200), ('razon_social', 'Razón social', 200)):
        if campo in data:
            nuevo = (data[campo] or '').strip()[:largo] or None
            if getattr(pc, campo) != nuevo:
                cambios.append(f"{etiqueta}: {getattr(pc, campo) or '—'} → {nuevo or '—'}")
                setattr(pc, campo, nuevo)
    if 'propina_porcentaje' in data:
        try:
            pct = _num(data['propina_porcentaje'] or 0, 'Propina', permitir_negativo=False)
        except ValueError as e:
            return jsonify({'error': str(e)}), 400
        if pct > 30:
            return jsonify({'error': 'La propina no puede superar el 30%'}), 400
        if Decimal(str(pc.propina_porcentaje or 0)) != pct:
            cambios.append(f"Propina: {float(pc.propina_porcentaje or 0):g}% → {float(pct):g}%")
            pc.propina_porcentaje = pct

    if cambios:
        marcar_cambio(evento, current_user)
        registrar(evento, current_user, 'Datos del pre-check', '; '.join(cambios))
    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {'precheck': pc.to_dict()})), 200


# ==================== ESTADOS ====================

@precheck_bp.route('/<int:evento_id>/estado', methods=['POST'])
@token_required
def cambiar_estado(current_user, evento_id):
    evento = Evento.query.get_or_404(evento_id)
    if not _puede_ver(evento, current_user):
        return jsonify({'error': 'No tienes acceso a este evento'}), 403
    if evento.estado not in ESTADOS_EVENTO_CON_PRECHECK:
        return jsonify({'error': 'El pre-check solo está disponible para eventos aprobados o concluidos'}), 403

    data = request.get_json(silent=True) or {}
    accion = data.get('accion')
    comentario = (data.get('comentario') or '').strip()
    permisos = _permisos(evento, current_user)
    pc = obtener_o_crear_precheck(evento)
    ahora = ahora_argentina()
    resumen = calcular_resumen(evento)

    if accion == 'enviar':
        if not permisos['puede_enviar_revision']:
            return jsonify({'error': 'Solo se puede enviar a revisión un pre-check en borrador'}), 403
        if not resumen['tiene_items']:
            return jsonify({'error': 'Cargá al menos un ítem antes de enviarlo a revisión'}), 400
        pc.estado = 'EN_REVISION'
        pc.enviado_revision_at, pc.enviado_revision_por_id = ahora, current_user.id
        registrar(evento, current_user, 'Envió a revisión', comentario or None)

    elif accion == 'aprobar':
        if not permisos['puede_aprobar']:
            return jsonify({'error': 'Solo Pilar o el Tano pueden aprobar el pre-check'}), 403
        era_cambio = pc.estado == 'APROBADO'
        pc.estado = 'APROBADO'
        pc.modificado_post_aprobacion = False
        pc.aprobado_at, pc.aprobado_por_id = ahora, current_user.id
        registrar(evento, current_user, 'Aprobó los cambios' if era_cambio else 'Aprobó el pre-check',
                  f"Total {_pesos(resumen['total'])}" + (f'. {comentario}' if comentario else ''))

    elif accion == 'devolver':
        if not permisos['puede_devolver']:
            return jsonify({'error': 'Solo se puede devolver un pre-check en revisión'}), 403
        if not comentario:
            return jsonify({'error': 'Indicá qué hay que corregir'}), 400
        pc.estado = 'BORRADOR'
        registrar(evento, current_user, 'Devolvió para corregir', comentario)

    elif accion == 'cerrar':
        if not permisos['puede_cerrar']:
            return jsonify({'error': 'Solo se puede cerrar un pre-check aprobado (lo cierra Pilar o el Tano)'}), 403
        if not evento.fecha_evento or date.today() <= evento.fecha_evento:
            return jsonify({'error': 'El pre-check se cierra después del evento, con los adicionales cargados'}), 400
        if resumen['pendiente'] > 0.5 and not comentario:
            return jsonify({'error': f"Queda un saldo de {_pesos(resumen['pendiente'])}. Para cerrar igual, "
                                     'dejá un comentario (ej.: pasa a cuenta corriente del local)'}), 400
        pc.estado = 'CERRADO'
        pc.cerrado_at, pc.cerrado_por_id = ahora, current_user.id
        pc.monto_final = Decimal(str(resumen['total']))
        pc.saldo_al_cierre = Decimal(str(resumen['pendiente']))
        registrar(evento, current_user, 'Cerró el pre-check',
                  f"Total final {_pesos(resumen['total'])}, saldo {_pesos(resumen['pendiente'])}"
                  + (f'. {comentario}' if comentario else ''))

    elif accion == 'reabrir':
        if not permisos['puede_reabrir']:
            return jsonify({'error': 'Solo Pilar o el Tano pueden reabrir un pre-check cerrado'}), 403
        if not comentario:
            return jsonify({'error': 'Indicá por qué se reabre'}), 400
        pc.estado = 'APROBADO'
        pc.cerrado_at = pc.cerrado_por_id = None
        registrar(evento, current_user, 'Reabrió el pre-check', comentario)

    else:
        return jsonify({'error': 'Acción inválida'}), 400

    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {
        'precheck': pc.to_dict(), 'permisos': _permisos(evento, current_user)})), 200


# ==================== CONCEPTOS ====================

def _aplicar_datos_concepto(concepto, data, evento):
    """Valida y asigna los campos de un concepto. Devuelve lista de cambios legibles."""
    cambios = []
    if 'catalogo_item_id' in data and data['catalogo_item_id']:
        item = db.session.get(CatalogoItem, int(data['catalogo_item_id']))
        if not item or (item.local_id and item.local_id != evento.local_id):
            raise ValueError('El ítem del catálogo no corresponde al local del evento')
        concepto.catalogo_item_id = item.id
        concepto.precio_lista = item.precio
        concepto.modalidad = item.modalidad
        concepto.ajusta_ipc = item.ajusta_ipc
        data.setdefault('categoria', item.categoria)
        data.setdefault('descripcion', item.nombre)
        data.setdefault('precio_unitario', float(item.precio))
        if item.modalidad == 'por_persona':
            data.setdefault('cantidad', evento.cantidad_personas or 1)
    elif data.get('exclusividad_sector'):
        pc = evento.precheck
        if not pc or not pc.sector or pc.sector.precio_exclusividad is None:
            raise ValueError('El sector elegido no tiene precio de exclusividad cargado')
        concepto.catalogo_item_id = None
        concepto.precio_lista = pc.sector.precio_exclusividad
        concepto.modalidad = 'fijo'
        data.setdefault('categoria', 'Exclusividad')
        data.setdefault('descripcion', f'Exclusividad {pc.sector.nombre}')
        data.setdefault('precio_unitario', float(pc.sector.precio_exclusividad))
        data.setdefault('cantidad', 1)

    if 'categoria' in data:
        if not _categoria_valida(data['categoria']):
            raise ValueError('Categoría inválida')
        if concepto.categoria != data['categoria']:
            if concepto.categoria:
                cambios.append(f"categoría {concepto.categoria} → {data['categoria']}")
            concepto.categoria = data['categoria']
        concepto.categoria_otro = (data.get('categoria_otro') or None) if data['categoria'] == 'Otros' else None
    if 'descripcion' in data:
        desc = (data['descripcion'] or '').strip()
        if not desc:
            raise ValueError('La descripción es obligatoria')
        if concepto.descripcion and concepto.descripcion != desc:
            cambios.append(f'descripción "{concepto.descripcion}" → "{desc}"')
        concepto.descripcion = desc[:255]
    if 'cantidad' in data:
        cant = _num(data['cantidad'], 'Cantidad', permitir_negativo=False)
        if concepto.cantidad is not None and Decimal(str(concepto.cantidad)) != cant:
            cambios.append(f'cantidad {float(concepto.cantidad):g} → {float(cant):g}')
        concepto.cantidad = cant
    if 'precio_unitario' in data:
        precio = _num(data['precio_unitario'], 'Precio')
        if concepto.precio_unitario is not None and Decimal(str(concepto.precio_unitario)) != precio:
            cambios.append(f'precio {_pesos(concepto.precio_unitario)} → {_pesos(precio)}')
        concepto.precio_unitario = precio
    if 'observaciones' in data:
        obs = (data['observaciones'] or '').strip() or None
        if concepto.id and concepto.observaciones != obs:
            cambios.append('observaciones')
        concepto.observaciones = obs
    if 'ajusta_ipc' in data:
        concepto.ajusta_ipc = bool(data['ajusta_ipc'])
    if concepto.cantidad is None:
        concepto.cantidad = Decimal('1')
    if concepto.categoria is None or concepto.descripcion is None or concepto.precio_unitario is None:
        raise ValueError('Faltan datos: categoría, descripción y precio')
    return cambios


@precheck_bp.route('/<int:evento_id>/conceptos', methods=['POST'])
@token_required
def agregar_concepto(current_user, evento_id):
    evento = Evento.query.get_or_404(evento_id)
    ok, error = verificar_permiso_edicion(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    data = dict(request.get_json(silent=True) or {})
    obtener_o_crear_precheck(evento)

    concepto = PrecheckConcepto(evento_id=evento_id)
    if not data.get('catalogo_item_id') and not data.get('exclusividad_sector'):
        concepto.precio_lista = None  # cargado a mano: queda como fuera de lista
    try:
        _aplicar_datos_concepto(concepto, data, evento)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    db.session.add(concepto)
    marcar_cambio(evento, current_user)
    detalle = f"{_nombre_categoria(concepto)} — {concepto.descripcion}: {float(concepto.cantidad):g} × {_pesos(concepto.precio_unitario)}"
    if concepto.fuera_de_lista:
        detalle += ' (fuera de lista)' if concepto.precio_lista is not None else ' (cargado a mano)'
    registrar(evento, current_user, 'Agregó ítem', detalle)
    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {'message': 'Concepto agregado', 'concepto': concepto.to_dict()})), 201


@precheck_bp.route('/<int:evento_id>/conceptos/<int:concepto_id>', methods=['PUT'])
@token_required
def actualizar_concepto(current_user, evento_id, concepto_id):
    evento = Evento.query.get_or_404(evento_id)
    concepto = PrecheckConcepto.query.filter_by(id=concepto_id, evento_id=evento_id).first_or_404()
    ok, error = verificar_permiso_edicion(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    if concepto.es_ajuste_ipc and not _es_admin(current_user):
        return jsonify({'error': 'El ajuste por IPC solo lo modifica administración'}), 403
    data = dict(request.get_json(silent=True) or {})
    data.pop('catalogo_item_id', None)
    data.pop('exclusividad_sector', None)
    try:
        cambios = _aplicar_datos_concepto(concepto, data, evento)
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    if cambios:
        marcar_cambio(evento, current_user)
        registrar(evento, current_user, 'Modificó ítem', f"{concepto.descripcion}: {', '.join(cambios)}")
    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {'message': 'Concepto actualizado', 'concepto': concepto.to_dict()})), 200


@precheck_bp.route('/<int:evento_id>/conceptos/<int:concepto_id>', methods=['DELETE'])
@token_required
def eliminar_concepto(current_user, evento_id, concepto_id):
    evento = Evento.query.get_or_404(evento_id)
    concepto = PrecheckConcepto.query.filter_by(id=concepto_id, evento_id=evento_id).first_or_404()
    ok, error = verificar_permiso_edicion(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    if concepto.es_ajuste_ipc and not _es_admin(current_user):
        return jsonify({'error': 'El ajuste por IPC solo lo modifica administración'}), 403
    registrar(evento, current_user, 'Eliminó ítem',
              f"{_nombre_categoria(concepto)} — {concepto.descripcion}: {float(concepto.cantidad):g} × {_pesos(concepto.precio_unitario)}")
    marcar_cambio(evento, current_user)
    db.session.delete(concepto)
    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {'message': 'Concepto eliminado'})), 200


# ==================== ADICIONALES ====================

def _aplicar_datos_adicional(adicional, data):
    cambios = []
    if 'categoria' in data:
        if not _categoria_valida(data['categoria']):
            raise ValueError('Categoría inválida')
        adicional.categoria = data['categoria']
        adicional.categoria_otro = (data.get('categoria_otro') or None) if data['categoria'] == 'Otros' else None
    if 'descripcion' in data:
        desc = (data['descripcion'] or '').strip()
        if not desc:
            raise ValueError('La descripción es obligatoria')
        if adicional.descripcion and adicional.descripcion != desc:
            cambios.append(f'descripción "{adicional.descripcion}" → "{desc}"')
        adicional.descripcion = desc[:255]
    if 'monto' in data:
        monto = _num(data['monto'], 'Monto')
        if adicional.monto is not None and Decimal(str(adicional.monto)) != monto:
            cambios.append(f'monto {_pesos(adicional.monto)} → {_pesos(monto)}')
        adicional.monto = monto
    if 'observaciones' in data:
        obs = (data['observaciones'] or '').strip() or None
        if adicional.id and adicional.observaciones != obs:
            cambios.append('observaciones')
        adicional.observaciones = obs
    if adicional.categoria is None or adicional.descripcion is None or adicional.monto is None:
        raise ValueError('Faltan datos: categoría, descripción y monto')
    return cambios


@precheck_bp.route('/<int:evento_id>/adicionales', methods=['POST'])
@token_required
def agregar_adicional(current_user, evento_id):
    evento = Evento.query.get_or_404(evento_id)
    ok, error = verificar_permiso_edicion(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    data = request.get_json(silent=True) or {}
    obtener_o_crear_precheck(evento)
    adicional = PrecheckAdicional(evento_id=evento_id)
    try:
        _aplicar_datos_adicional(adicional, data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    db.session.add(adicional)
    marcar_cambio(evento, current_user)
    registrar(evento, current_user, 'Agregó adicional',
              f'{_nombre_categoria(adicional)} — {adicional.descripcion}: {_pesos(adicional.monto)}')
    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {'message': 'Adicional agregado', 'adicional': adicional.to_dict()})), 201


@precheck_bp.route('/<int:evento_id>/adicionales/<int:adicional_id>', methods=['PUT'])
@token_required
def actualizar_adicional(current_user, evento_id, adicional_id):
    evento = Evento.query.get_or_404(evento_id)
    adicional = PrecheckAdicional.query.filter_by(id=adicional_id, evento_id=evento_id).first_or_404()
    ok, error = verificar_permiso_edicion(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    try:
        cambios = _aplicar_datos_adicional(adicional, request.get_json(silent=True) or {})
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    if cambios:
        marcar_cambio(evento, current_user)
        registrar(evento, current_user, 'Modificó adicional', f"{adicional.descripcion}: {', '.join(cambios)}")
    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {'message': 'Adicional actualizado', 'adicional': adicional.to_dict()})), 200


@precheck_bp.route('/<int:evento_id>/adicionales/<int:adicional_id>', methods=['DELETE'])
@token_required
def eliminar_adicional(current_user, evento_id, adicional_id):
    evento = Evento.query.get_or_404(evento_id)
    adicional = PrecheckAdicional.query.filter_by(id=adicional_id, evento_id=evento_id).first_or_404()
    ok, error = verificar_permiso_edicion(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    registrar(evento, current_user, 'Eliminó adicional',
              f'{_nombre_categoria(adicional)} — {adicional.descripcion}: {_pesos(adicional.monto)}')
    marcar_cambio(evento, current_user)
    db.session.delete(adicional)
    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {'message': 'Adicional eliminado'})), 200


# ==================== AJUSTE IPC ====================

@precheck_bp.route('/<int:evento_id>/ipc', methods=['GET'])
@token_required
def simular_ipc(current_user, evento_id):
    evento = Evento.query.get_or_404(evento_id)
    if not _puede_ver(evento, current_user):
        return jsonify({'error': 'No tienes acceso a este evento'}), 403
    return jsonify(calcular_ipc_pendiente(evento, calcular_resumen(evento))), 200


@precheck_bp.route('/<int:evento_id>/ipc', methods=['POST'])
@token_required
def aplicar_ipc(current_user, evento_id):
    evento = Evento.query.get_or_404(evento_id)
    if not _permisos(evento, current_user)['puede_aplicar_ipc']:
        return jsonify({'error': 'El ajuste por IPC lo aplica administración, con el pre-check abierto'}), 403
    calculo = calcular_ipc_pendiente(evento, calcular_resumen(evento))
    if not calculo.get('aplica') or not calculo.get('ajuste'):
        return jsonify({'error': calculo.get('motivo') or 'No corresponde ajuste'}), 400

    desde, hasta = calculo['periodo_base'], calculo['periodo_final']
    obtener_o_crear_precheck(evento)
    linea = PrecheckConcepto(
        evento_id=evento_id, categoria=CATEGORIA_AJUSTE_IPC,
        descripcion=f'Ajuste IPC {desde} a {hasta} ({calculo["variacion_pct"]:.2f}%)',
        cantidad=Decimal('1'), precio_unitario=Decimal(str(calculo['ajuste'])),
        precio_lista=Decimal(str(calculo['ajuste'])), modalidad='fijo',
        ajusta_ipc=False, es_ajuste_ipc=True, ipc_periodo_desde=desde, ipc_periodo_hasta=hasta,
        observaciones=(f"Sobre saldo de {_pesos(calculo['monto_base'])}. IPC INDEC {desde}: "
                       f"{calculo['indice_base']:.2f}; {hasta}: {calculo['indice_final']:.2f}"),
    )
    db.session.add(linea)
    registrar(evento, current_user, 'Aplicó ajuste IPC', f"{linea.descripcion}: {_pesos(calculo['ajuste'])}")
    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {'message': 'Ajuste aplicado', 'concepto': linea.to_dict()})), 201


# ==================== PAGOS ====================

def _fecha(valor, campo):
    try:
        return datetime.strptime(valor, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        raise ValueError(f'{campo} inválida (AAAA-MM-DD)')


@precheck_bp.route('/<int:evento_id>/pagos', methods=['POST'])
@token_required
def agregar_pago(current_user, evento_id):
    evento = Evento.query.get_or_404(evento_id)
    ok, error = verificar_permiso_pagos(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    data = request.get_json(silent=True) or {}
    for field in ('metodo_pago', 'monto', 'fecha_deposito', 'fecha_acreditacion'):
        if field not in data:
            return jsonify({'error': f'Campo {field} es requerido'}), 400
    try:
        monto = _num(data['monto'], 'Monto', permitir_negativo=False)
        fecha_deposito = _fecha(data['fecha_deposito'], 'Fecha de depósito')
        fecha_acreditacion = _fecha(data['fecha_acreditacion'], 'Fecha de acreditación')
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    if monto <= 0:
        return jsonify({'error': 'El monto debe ser mayor a cero'}), 400

    pago = PrecheckPago(
        evento_id=evento_id, metodo_pago=data['metodo_pago'], monto=monto,
        fecha_pago=fecha_deposito, fecha_deposito=fecha_deposito,
        fecha_acreditacion=fecha_acreditacion, notas=data.get('notas'))
    db.session.add(pago)
    obtener_o_crear_precheck(evento)
    registrar(evento, current_user, 'Cargó pago', f"{pago.metodo_pago} {_pesos(monto)} del {fecha_deposito:%d/%m/%Y}")
    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {'message': 'Pago agregado', 'pago': enrich_pago_dict(pago.to_dict())})), 201


@precheck_bp.route('/<int:evento_id>/pagos/<int:pago_id>', methods=['PUT'])
@token_required
def actualizar_pago(current_user, evento_id, pago_id):
    evento = Evento.query.get_or_404(evento_id)
    pago = PrecheckPago.query.filter_by(id=pago_id, evento_id=evento_id).first_or_404()
    if pago.estado != 'REVISION':
        return jsonify({'error': 'Solo se pueden editar pagos en revisión'}), 403
    ok, error = verificar_permiso_pagos(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    data = request.get_json(silent=True) or {}
    cambios = []
    try:
        if 'metodo_pago' in data and data['metodo_pago'] != pago.metodo_pago:
            cambios.append(f"método {pago.metodo_pago} → {data['metodo_pago']}")
            pago.metodo_pago = data['metodo_pago']
        if 'monto' in data:
            monto = _num(data['monto'], 'Monto', permitir_negativo=False)
            if Decimal(str(pago.monto)) != monto:
                cambios.append(f'monto {_pesos(pago.monto)} → {_pesos(monto)}')
            pago.monto = monto
        if 'fecha_deposito' in data:
            pago.fecha_deposito = pago.fecha_pago = _fecha(data['fecha_deposito'], 'Fecha de depósito')
        if 'fecha_acreditacion' in data:
            pago.fecha_acreditacion = _fecha(data['fecha_acreditacion'], 'Fecha de acreditación')
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    if 'notas' in data:
        pago.notas = data['notas']
    if cambios:
        registrar(evento, current_user, 'Modificó pago', ', '.join(cambios))
    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {'message': 'Pago actualizado', 'pago': enrich_pago_dict(pago.to_dict())})), 200


@precheck_bp.route('/<int:evento_id>/pagos/<int:pago_id>', methods=['DELETE'])
@token_required
def eliminar_pago(current_user, evento_id, pago_id):
    evento = Evento.query.get_or_404(evento_id)
    pago = PrecheckPago.query.filter_by(id=pago_id, evento_id=evento_id).first_or_404()
    if pago.estado != 'REVISION':
        return jsonify({'error': 'Solo se pueden eliminar pagos en revisión'}), 403
    ok, error = verificar_permiso_pagos(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    if pago.comprobante_url:
        try:
            eliminar_archivo(pago.comprobante_url)
        except Exception as e:  # noqa: BLE001
            print(f"Error eliminando comprobante: {e}")
    registrar(evento, current_user, 'Eliminó pago', f"{pago.metodo_pago} {_pesos(pago.monto)}")
    db.session.delete(pago)
    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {'message': 'Pago eliminado'})), 200


# ==================== COMPROBANTES ====================

@precheck_bp.route('/<int:evento_id>/pagos/<int:pago_id>/comprobante', methods=['POST'])
@token_required
def subir_comprobante(current_user, evento_id, pago_id):
    evento = Evento.query.get_or_404(evento_id)
    pago = PrecheckPago.query.filter_by(id=pago_id, evento_id=evento_id).first_or_404()
    ok, error = verificar_permiso_pagos(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    if 'file' not in request.files:
        return jsonify({'error': 'No se envió archivo'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nombre de archivo vacío'}), 400
    permitidas = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'webp'}
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in permitidas:
        return jsonify({'error': f'Extensión no permitida. Usar: {", ".join(sorted(permitidas))}'}), 400

    if pago.comprobante_url:
        try:
            eliminar_archivo(pago.comprobante_url)
        except Exception as e:  # noqa: BLE001
            print(f"Error eliminando comprobante anterior: {e}")
    filename = f"comprobantes/{evento_id}/{pago_id}_{uuid.uuid4().hex}.{ext}"
    try:
        pago.comprobante_url = subir_archivo(file, filename, content_type=file.content_type)
        pago.comprobante_nombre = file.filename
        registrar(evento, current_user, 'Subió comprobante', f"Pago {_pesos(pago.monto)}: {file.filename}")
        db.session.commit()
        return jsonify({'message': 'Comprobante subido', 'pago': enrich_pago_dict(pago.to_dict())}), 200
    except Exception as e:  # noqa: BLE001
        db.session.rollback()
        return jsonify({'error': f'Error subiendo archivo: {str(e)}'}), 500


@precheck_bp.route('/<int:evento_id>/pagos/<int:pago_id>/comprobante', methods=['DELETE'])
@token_required
def eliminar_comprobante(current_user, evento_id, pago_id):
    evento = Evento.query.get_or_404(evento_id)
    pago = PrecheckPago.query.filter_by(id=pago_id, evento_id=evento_id).first_or_404()
    ok, error = verificar_permiso_pagos(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    if pago.estado != 'REVISION':
        return jsonify({'error': 'El comprobante de un pago ya validado o rechazado no se puede quitar'}), 403
    if not pago.comprobante_url:
        return jsonify({'error': 'No hay comprobante para eliminar'}), 400
    try:
        eliminar_archivo(pago.comprobante_url)
    except Exception as e:  # noqa: BLE001
        print(f"Error eliminando comprobante: {e}")
    pago.comprobante_url = None
    pago.comprobante_nombre = None
    registrar(evento, current_user, 'Quitó comprobante', f"Pago {_pesos(pago.monto)}")
    db.session.commit()
    return jsonify({'message': 'Comprobante eliminado', 'pago': enrich_pago_dict(pago.to_dict())}), 200


# ==================== FACTURADA ====================

@precheck_bp.route('/<int:evento_id>/facturada', methods=['PUT'])
@token_required
def actualizar_facturada(current_user, evento_id):
    evento = Evento.query.get_or_404(evento_id)
    ok, error = verificar_permiso_edicion(evento, current_user)
    if not ok:
        return jsonify({'error': error}), 403
    data = request.get_json(silent=True) or {}
    if 'facturada' not in data:
        return jsonify({'error': 'Campo facturada requerido'}), 400
    nuevo = bool(data['facturada'])
    if bool(evento.facturada) != nuevo:
        evento.facturada = nuevo
        obtener_o_crear_precheck(evento)
        marcar_cambio(evento, current_user)
        registrar(evento, current_user, 'Facturación', 'Con factura (+21% IVA)' if nuevo else 'Sin factura')
    db.session.commit()
    return jsonify(_respuesta_resumen(evento, {
        'message': 'Estado de facturación actualizado', 'facturada': evento.facturada})), 200


# ==================== TRANSICIÓN A CONCLUIDO ====================

@precheck_bp.route('/verificar-concluidos', methods=['POST'])
@token_required
def verificar_eventos_concluidos(current_user):
    """Pasa a CONCLUIDO los eventos APROBADO con fecha pasada. Solo admin."""
    if current_user.rol != 'admin':
        return jsonify({'error': 'Solo admin puede ejecutar esta acción'}), 403
    hoy = date.today()
    eventos = Evento.query.filter(Evento.estado == 'APROBADO', Evento.fecha_evento < hoy).all()
    actualizados = []
    for evento in eventos:
        evento.estado = 'CONCLUIDO'
        actualizados.append({'id': evento.id, 'titulo': evento.titulo or evento.generar_titulo_auto(),
                             'fecha_evento': evento.fecha_evento.isoformat()})
    db.session.commit()
    return jsonify({'message': f'{len(actualizados)} eventos actualizados a CONCLUIDO', 'eventos': actualizados}), 200


# ==================== PDF ====================

@precheck_bp.route('/<int:evento_id>/pdf', methods=['GET'])
@token_required
def exportar_pdf(current_user, evento_id):
    """PDF para mandarle al cliente, con el anexo de condiciones."""
    import re
    from flask import send_file
    from app.utils.pdf_generator import generar_pdf_precheck

    evento = Evento.query.get_or_404(evento_id)
    if not _puede_ver(evento, current_user):
        return jsonify({'error': 'No tienes acceso a este evento'}), 403

    conceptos = [c.to_dict() for c in ordenar_items(evento.precheck_conceptos.all())]
    adicionales = [a.to_dict() for a in ordenar_items(evento.precheck_adicionales.all())]
    pagos = [p.to_dict() for p in evento.precheck_pagos.order_by(PrecheckPago.fecha_pago)]
    resumen = calcular_resumen(evento)
    config = leer_config()

    pdf_buffer = generar_pdf_precheck(evento, evento.precheck, conceptos, adicionales, pagos, resumen,
                                      config.get('condiciones') or '')
    cliente = re.sub(r'[^A-Za-z0-9]+', '_', evento.cliente.nombre if evento.cliente else 'cliente').strip('_')
    fecha = evento.fecha_evento.strftime('%Y%m%d') if evento.fecha_evento else 'sin_fecha'
    return send_file(pdf_buffer, mimetype='application/pdf', as_attachment=True,
                     download_name=f"precheck_{cliente}_{fecha}.pdf")
