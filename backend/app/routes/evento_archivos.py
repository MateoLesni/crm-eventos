"""
Presupuestos adjuntos a un evento.
Reutiliza el bucket de Cloud Storage de los comprobantes de pago; los archivos
se sirven con URLs firmadas temporales, nunca públicas.
"""
import os
import uuid

from flask import Blueprint, g, jsonify, request

from app import db
from app.models import Evento, EventoArchivo
from app.utils.seguridad import login_requerido
from app.utils.storage import eliminar_archivo, generar_signed_url, subir_archivo

evento_archivos_bp = Blueprint('evento_archivos', __name__)

EXTENSIONES_PERMITIDAS = {'pdf', 'xlsx', 'xls', 'docx', 'doc', 'png', 'jpg', 'jpeg'}
TAMANO_MAXIMO = 15 * 1024 * 1024  # 15 MB


def _puede_acceder(evento, usuario):
    # Mismo criterio que el pre-check: admin o el comercial del evento
    return usuario.rol == 'admin' or evento.comercial_id == usuario.id


def _con_url(archivo):
    datos = archivo.to_dict()
    try:
        datos['url'] = generar_signed_url(archivo.blob_path)
    except Exception:
        datos['url'] = None
    return datos


# GET /api/eventos/:id/presupuestos
@evento_archivos_bp.route('/<int:evento_id>/presupuestos', methods=['GET'])
@login_requerido
def listar_presupuestos(evento_id):
    evento = Evento.query.get_or_404(evento_id)
    if not _puede_acceder(evento, g.usuario):
        return jsonify({'error': 'No tenés acceso a este evento'}), 403

    archivos = (EventoArchivo.query
                .filter_by(evento_id=evento_id, tipo='presupuesto')
                .order_by(EventoArchivo.created_at.desc())
                .all())
    return jsonify({'archivos': [_con_url(a) for a in archivos]})


# POST /api/eventos/:id/presupuestos  (multipart, campo "file")
@evento_archivos_bp.route('/<int:evento_id>/presupuestos', methods=['POST'])
@login_requerido
def subir_presupuesto(evento_id):
    evento = Evento.query.get_or_404(evento_id)
    if not _puede_acceder(evento, g.usuario):
        return jsonify({'error': 'No tenés acceso a este evento'}), 403

    archivo = request.files.get('file')
    if not archivo or not archivo.filename:
        return jsonify({'error': 'No se envió ningún archivo'}), 400

    ext = archivo.filename.rsplit('.', 1)[-1].lower() if '.' in archivo.filename else ''
    if ext not in EXTENSIONES_PERMITIDAS:
        return jsonify({'error': f'Formato no permitido. Usá: {", ".join(sorted(EXTENSIONES_PERMITIDAS))}'}), 400

    archivo.stream.seek(0, os.SEEK_END)
    tamano = archivo.stream.tell()
    archivo.stream.seek(0)
    if tamano > TAMANO_MAXIMO:
        return jsonify({'error': 'El archivo supera los 15 MB'}), 400

    blob_path = f'presupuestos/{evento_id}/{uuid.uuid4().hex}.{ext}'
    try:
        subir_archivo(archivo, blob_path, content_type=archivo.content_type)
    except Exception as e:
        return jsonify({'error': f'No se pudo subir el archivo: {e}'}), 500

    registro = EventoArchivo(
        evento_id=evento_id,
        tipo='presupuesto',
        blob_path=blob_path,
        nombre_original=archivo.filename[:255],
        content_type=archivo.content_type,
        tamano_bytes=tamano,
        subido_por_id=g.usuario.id,
    )
    db.session.add(registro)
    db.session.commit()
    return jsonify({'message': 'Presupuesto adjuntado', 'archivo': _con_url(registro)}), 201


# DELETE /api/eventos/:id/presupuestos/:archivo_id
@evento_archivos_bp.route('/<int:evento_id>/presupuestos/<int:archivo_id>', methods=['DELETE'])
@login_requerido
def eliminar_presupuesto(evento_id, archivo_id):
    evento = Evento.query.get_or_404(evento_id)
    if not _puede_acceder(evento, g.usuario):
        return jsonify({'error': 'No tenés acceso a este evento'}), 403

    registro = EventoArchivo.query.filter_by(id=archivo_id, evento_id=evento_id).first_or_404()
    try:
        eliminar_archivo(registro.blob_path)
    except Exception as e:
        print(f'Error eliminando presupuesto del bucket: {e}')
    db.session.delete(registro)
    db.session.commit()
    return jsonify({'message': 'Presupuesto eliminado'})
