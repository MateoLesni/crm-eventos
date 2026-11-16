"""
Hoja de ruta (HDR) de cada evento: el detalle operativo para el local y cocina.

GET    /api/hoja-ruta/<evento_id>                 contenido, versiones, planos y la versión sugerida desde el pre-check
PUT    /api/hoja-ruta/<evento_id>                 {contenido} guarda (queda "con cambios sin enviar")
POST   /api/hoja-ruta/<evento_id>/enviar          {nota} congela una versión nueva (v1, v2...) con el resumen de cambios
POST   /api/hoja-ruta/<evento_id>/planos          multipart "file" (imagen) -> plano
DELETE /api/hoja-ruta/<evento_id>/planos/<id>
GET    /api/hoja-ruta/<evento_id>/pdf             PDF sin precios para el local y cocina
"""
import json
import os
import uuid

from flask import Blueprint, g, jsonify, request, send_file

from app import db
from app.models import Evento, EventoArchivo
from app.models_precheck import HojaRuta, HojaRutaVersion, PrecheckHistorial
from app.utils import hoja_ruta as hr
from app.utils.seguridad import login_requerido
from app.utils.storage import eliminar_archivo, generar_signed_url, subir_archivo

hoja_ruta_bp = Blueprint('hoja_ruta', __name__)

ESTADOS_CON_HDR = ('APROBADO', 'CONCLUIDO')
EXT_PLANOS = {'png', 'jpg', 'jpeg', 'webp'}
TAMANO_MAXIMO = 15 * 1024 * 1024


def _puede_ver(evento, usuario):
    return usuario.rol == 'admin' or evento.comercial_id == usuario.id


def _puede_editar(evento, usuario):
    if evento.estado not in ESTADOS_CON_HDR:
        return False, 'La hoja de ruta se arma cuando el evento está aprobado'
    if not _puede_ver(evento, usuario):
        return False, 'No tenés permiso para editar esta hoja de ruta'
    return True, None


def _planos(evento_id):
    return EventoArchivo.query.filter_by(evento_id=evento_id, tipo='plano').order_by(EventoArchivo.created_at).all()


def _plano_dict(a):
    d = a.to_dict()
    try:
        d['url'] = generar_signed_url(a.blob_path)
    except Exception:  # noqa: BLE001
        d['url'] = None
    return d


def _registrar(evento_id, accion, detalle=None):
    db.session.add(PrecheckHistorial(evento_id=evento_id, usuario_id=g.usuario.id, accion=accion, detalle=detalle))


def _instantanea(evento, contenido):
    return {'cabecera': hr.cabecera(evento), 'contenido': contenido, 'planos': [a.id for a in _planos(evento.id)]}


@hoja_ruta_bp.route('/<int:evento_id>', methods=['GET'])
@login_requerido
def obtener(evento_id):
    evento = Evento.query.get_or_404(evento_id)
    if not _puede_ver(evento, g.usuario):
        return jsonify({'error': 'No tenés acceso a este evento'}), 403
    hoja = evento.hoja_ruta
    puede, motivo = _puede_editar(evento, g.usuario)
    sugerido = hr.sugerido_desde_precheck(evento)
    versiones = HojaRutaVersion.query.filter_by(evento_id=evento_id).order_by(HojaRutaVersion.version.desc()).all()
    return jsonify({
        'existe': hoja is not None,
        'contenido': hr.cargar(hoja.contenido) if hoja else sugerido,
        'sugerido': sugerido,
        'cabecera': hr.cabecera(evento),
        'version': hoja.version if hoja else 0,
        'cambios_sin_enviar': bool(hoja.cambios_sin_enviar) if hoja else True,
        'updated_at': hoja.updated_at.isoformat() if hoja and hoja.updated_at else None,
        'updated_by': hoja.updated_by.nombre if hoja and hoja.updated_by else None,
        'versiones': [v.to_dict() for v in versiones],
        'planos': [_plano_dict(a) for a in _planos(evento_id)],
        'dias_timing': hr.DIAS_TIMING,
        'puede_editar': puede,
        'motivo_no_editable': motivo,
    }), 200


@hoja_ruta_bp.route('/<int:evento_id>', methods=['PUT'])
@login_requerido
def guardar(evento_id):
    evento = Evento.query.get_or_404(evento_id)
    puede, motivo = _puede_editar(evento, g.usuario)
    if not puede:
        return jsonify({'error': motivo}), 403
    data = request.get_json(silent=True) or {}
    try:
        contenido = hr.normalizar(data.get('contenido'))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    hoja = evento.hoja_ruta
    anterior = hr.cargar(hoja.contenido) if hoja else None
    if hoja is None:
        hoja = HojaRuta(evento_id=evento_id, version=0)
        db.session.add(hoja)
        evento.hoja_ruta = hoja
    texto = json.dumps(contenido, ensure_ascii=False)
    if hoja.contenido != texto:
        secciones = [nombre for clave, nombre in hr.NOMBRES_SECCION.items()
                     if anterior is None or json.dumps(anterior.get(clave), sort_keys=True) != json.dumps(contenido.get(clave), sort_keys=True)]
        hoja.contenido = texto
        hoja.cambios_sin_enviar = True
        hoja.updated_by_id = g.usuario.id
        _registrar(evento_id, 'Hoja de ruta: guardó cambios', ', '.join(secciones) if anterior else 'Creó la hoja de ruta')
    db.session.commit()
    return jsonify({'ok': True, 'contenido': contenido, 'cambios_sin_enviar': hoja.cambios_sin_enviar,
                    'version': hoja.version}), 200


@hoja_ruta_bp.route('/<int:evento_id>/enviar', methods=['POST'])
@login_requerido
def enviar(evento_id):
    """Congela la versión que se manda al local (v1, v2...). El texto de cambios sirve para avisar al grupo."""
    evento = Evento.query.get_or_404(evento_id)
    puede, motivo = _puede_editar(evento, g.usuario)
    if not puede:
        return jsonify({'error': motivo}), 403
    hoja = evento.hoja_ruta
    if hoja is None:
        return jsonify({'error': 'Guardá la hoja de ruta antes de enviarla'}), 400
    nota = ((request.get_json(silent=True) or {}).get('nota') or '').strip()[:1000] or None

    actual = _instantanea(evento, hr.cargar(hoja.contenido))
    ultima = HojaRutaVersion.query.filter_by(evento_id=evento_id).order_by(HojaRutaVersion.version.desc()).first()
    anterior = json.loads(ultima.contenido) if ultima else None
    cambios = hr.resumen_cambios(anterior, actual)
    if ultima and cambios.startswith('Sin cambios'):
        return jsonify({'error': 'No hay cambios desde la última versión enviada'}), 400

    hoja.version = (ultima.version if ultima else 0) + 1
    hoja.cambios_sin_enviar = False
    version = HojaRutaVersion(evento_id=evento_id, version=hoja.version, contenido=json.dumps(actual, ensure_ascii=False),
                              cambios=cambios, nota=nota, enviada_por_id=g.usuario.id)
    db.session.add(version)
    _registrar(evento_id, f'Hoja de ruta: envió v{hoja.version}', cambios + (f'. {nota}' if nota else ''))
    db.session.commit()
    return jsonify({'ok': True, 'version': version.to_dict()}), 201


@hoja_ruta_bp.route('/<int:evento_id>/planos', methods=['POST'])
@login_requerido
def subir_plano(evento_id):
    evento = Evento.query.get_or_404(evento_id)
    puede, motivo = _puede_editar(evento, g.usuario)
    if not puede:
        return jsonify({'error': motivo}), 403
    archivo = request.files.get('file')
    if not archivo or not archivo.filename:
        return jsonify({'error': 'No se envió archivo'}), 400
    ext = archivo.filename.rsplit('.', 1)[-1].lower() if '.' in archivo.filename else ''
    if ext not in EXT_PLANOS:
        return jsonify({'error': 'El plano tiene que ser una imagen (png, jpg o webp)'}), 400
    archivo.seek(0, os.SEEK_END)
    tamano = archivo.tell()
    archivo.seek(0)
    if tamano > TAMANO_MAXIMO:
        return jsonify({'error': 'La imagen supera los 15 MB'}), 400
    blob = f'planos/{evento_id}/{uuid.uuid4().hex}.{ext}'
    try:
        subir_archivo(archivo, blob, content_type=archivo.content_type)
    except Exception as e:  # noqa: BLE001
        return jsonify({'error': f'No se pudo subir: {e}'}), 500
    registro = EventoArchivo(evento_id=evento_id, tipo='plano', blob_path=blob, nombre_original=archivo.filename[:255],
                             content_type=archivo.content_type, tamano_bytes=tamano, subido_por_id=g.usuario.id)
    db.session.add(registro)
    if evento.hoja_ruta:
        evento.hoja_ruta.cambios_sin_enviar = True
    _registrar(evento_id, 'Hoja de ruta: subió plano', archivo.filename[:255])
    db.session.commit()
    return jsonify(_plano_dict(registro)), 201


@hoja_ruta_bp.route('/<int:evento_id>/planos/<int:archivo_id>', methods=['DELETE'])
@login_requerido
def eliminar_plano(evento_id, archivo_id):
    evento = Evento.query.get_or_404(evento_id)
    puede, motivo = _puede_editar(evento, g.usuario)
    if not puede:
        return jsonify({'error': motivo}), 403
    registro = EventoArchivo.query.filter_by(id=archivo_id, evento_id=evento_id, tipo='plano').first_or_404()
    try:
        eliminar_archivo(registro.blob_path)
    except Exception:  # noqa: BLE001
        pass
    _registrar(evento_id, 'Hoja de ruta: quitó plano', registro.nombre_original)
    if evento.hoja_ruta:
        evento.hoja_ruta.cambios_sin_enviar = True
    db.session.delete(registro)
    db.session.commit()
    return jsonify({'ok': True}), 200


@hoja_ruta_bp.route('/<int:evento_id>/pdf', methods=['GET'])
@login_requerido
def pdf(evento_id):
    import re
    from app.utils.pdf_hoja_ruta import generar_pdf_hoja_ruta

    evento = Evento.query.get_or_404(evento_id)
    if not _puede_ver(evento, g.usuario):
        return jsonify({'error': 'No tenés acceso a este evento'}), 403
    hoja = evento.hoja_ruta
    contenido = hr.cargar(hoja.contenido) if hoja else hr.sugerido_desde_precheck(evento)
    ultima = HojaRutaVersion.query.filter_by(evento_id=evento_id).order_by(HojaRutaVersion.version.desc()).first()
    buffer = generar_pdf_hoja_ruta(evento, hr.cabecera(evento), contenido, _planos(evento_id), hoja, ultima)
    cliente = re.sub(r'[^A-Za-z0-9]+', '_', evento.cliente.nombre if evento.cliente else 'cliente').strip('_')
    fecha = evento.fecha_evento.strftime('%Y%m%d') if evento.fecha_evento else 'sin_fecha'
    return send_file(buffer, mimetype='application/pdf', as_attachment=True, download_name=f'hoja_ruta_{cliente}_{fecha}.pdf')
