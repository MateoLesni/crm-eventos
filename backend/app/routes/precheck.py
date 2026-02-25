"""
Rutas API para sistema Pre-Check
Endpoints para conceptos, adicionales, pagos y resumen
"""
from flask import Blueprint, request, jsonify
from app import db
from app.models import Evento
from app.models_precheck import (
    PrecheckConcepto, PrecheckAdicional, PrecheckPago,
    CATEGORIAS_PRECHECK, METODOS_PAGO, calcular_resumen_precheck
)
from app.routes.auth import token_required
from datetime import datetime, date, timedelta
from google.cloud import storage
import os
import uuid

precheck_bp = Blueprint('precheck', __name__)

# Configuración del bucket de GCP
GCP_BUCKET_NAME = os.environ.get('GCP_BUCKET_COMPROBANTES', 'crm-eventos-comprobantes')


def verificar_permiso_edicion(evento, usuario):
    """
    Verifica si el usuario puede editar el pre-check del evento.
    - Solo editable en APROBADO o CONCLUIDO
    - En CONCLUIDO, solo editable hasta 5 días después de la fecha del evento
    - Los pagos siempre son editables
    """
    if evento.estado not in ['APROBADO', 'CONCLUIDO']:
        return False, 'El pre-check solo está disponible para eventos aprobados o concluidos'

    if evento.estado == 'CONCLUIDO' and evento.fecha_evento:
        dias_desde_evento = (date.today() - evento.fecha_evento).days
        if dias_desde_evento > 5:
            return False, 'El pre-check ya no es editable (más de 5 días desde el evento)'

    # Admin puede editar todo
    if usuario.rol == 'admin':
        return True, None

    # Comercial solo puede editar sus propios eventos
    if evento.comercial_id != usuario.id:
        return False, 'No tienes permiso para editar este pre-check'

    return True, None


def verificar_permiso_pagos(evento, usuario):
    """
    Verifica si el usuario puede agregar/editar pagos.
    Los pagos siempre son editables (sin límite de tiempo).
    """
    if evento.estado not in ['APROBADO', 'CONCLUIDO']:
        return False, 'Los pagos solo están disponibles para eventos aprobados o concluidos'

    # Admin puede editar todo
    if usuario.rol == 'admin':
        return True, None

    # Comercial solo puede editar sus propios eventos
    if evento.comercial_id != usuario.id:
        return False, 'No tienes permiso para editar los pagos de este evento'

    return True, None


# ==================== RESUMEN ====================

@precheck_bp.route('/<int:evento_id>', methods=['GET'])
@token_required
def obtener_precheck(current_user, evento_id):
    """Obtener pre-check completo de un evento"""
    evento = Evento.query.get_or_404(evento_id)

    # Verificar acceso
    if current_user.rol != 'admin' and evento.comercial_id != current_user.id:
        return jsonify({'error': 'No tienes acceso a este evento'}), 403

    # Obtener todos los datos
    conceptos = [c.to_dict() for c in evento.precheck_conceptos.order_by(PrecheckConcepto.categoria, PrecheckConcepto.id)]
    adicionales = [a.to_dict() for a in evento.precheck_adicionales.order_by(PrecheckAdicional.categoria, PrecheckAdicional.id)]
    pagos = [p.to_dict() for p in evento.precheck_pagos.order_by(PrecheckPago.fecha_pago.desc())]
    resumen = calcular_resumen_precheck(evento)

    # Verificar si es editable
    puede_editar, _ = verificar_permiso_edicion(evento, current_user)
    puede_editar_pagos, _ = verificar_permiso_pagos(evento, current_user)

    return jsonify({
        'evento_id': evento_id,
        'facturada': evento.facturada,
        'estado': evento.estado,
        'conceptos': conceptos,
        'adicionales': adicionales,
        'pagos': pagos,
        'resumen': resumen,
        'puede_editar': puede_editar,
        'puede_editar_pagos': puede_editar_pagos,
        'categorias': CATEGORIAS_PRECHECK,
        'metodos_pago': METODOS_PAGO
    }), 200


# ==================== CONCEPTOS ====================

@precheck_bp.route('/<int:evento_id>/conceptos', methods=['POST'])
@token_required
def agregar_concepto(current_user, evento_id):
    """Agregar un concepto al pre-check"""
    evento = Evento.query.get_or_404(evento_id)

    puede_editar, error = verificar_permiso_edicion(evento, current_user)
    if not puede_editar:
        return jsonify({'error': error}), 403

    data = request.json
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    # Validar campos requeridos
    required = ['categoria', 'descripcion', 'cantidad', 'precio_unitario']
    for field in required:
        if field not in data:
            return jsonify({'error': f'Campo {field} es requerido'}), 400

    concepto = PrecheckConcepto(
        evento_id=evento_id,
        categoria=data['categoria'],
        categoria_otro=data.get('categoria_otro') if data['categoria'] == 'Otros' else None,
        descripcion=data['descripcion'],
        cantidad=data['cantidad'],
        precio_unitario=data['precio_unitario']
    )

    db.session.add(concepto)
    db.session.commit()

    return jsonify({
        'message': 'Concepto agregado',
        'concepto': concepto.to_dict(),
        'resumen': calcular_resumen_precheck(evento)
    }), 201


@precheck_bp.route('/<int:evento_id>/conceptos/<int:concepto_id>', methods=['PUT'])
@token_required
def actualizar_concepto(current_user, evento_id, concepto_id):
    """Actualizar un concepto del pre-check"""
    evento = Evento.query.get_or_404(evento_id)
    concepto = PrecheckConcepto.query.filter_by(id=concepto_id, evento_id=evento_id).first_or_404()

    puede_editar, error = verificar_permiso_edicion(evento, current_user)
    if not puede_editar:
        return jsonify({'error': error}), 403

    data = request.json
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    if 'categoria' in data:
        concepto.categoria = data['categoria']
        concepto.categoria_otro = data.get('categoria_otro') if data['categoria'] == 'Otros' else None
    if 'descripcion' in data:
        concepto.descripcion = data['descripcion']
    if 'cantidad' in data:
        concepto.cantidad = data['cantidad']
    if 'precio_unitario' in data:
        concepto.precio_unitario = data['precio_unitario']

    db.session.commit()

    return jsonify({
        'message': 'Concepto actualizado',
        'concepto': concepto.to_dict(),
        'resumen': calcular_resumen_precheck(evento)
    }), 200


@precheck_bp.route('/<int:evento_id>/conceptos/<int:concepto_id>', methods=['DELETE'])
@token_required
def eliminar_concepto(current_user, evento_id, concepto_id):
    """Eliminar un concepto del pre-check"""
    evento = Evento.query.get_or_404(evento_id)
    concepto = PrecheckConcepto.query.filter_by(id=concepto_id, evento_id=evento_id).first_or_404()

    puede_editar, error = verificar_permiso_edicion(evento, current_user)
    if not puede_editar:
        return jsonify({'error': error}), 403

    db.session.delete(concepto)
    db.session.commit()

    return jsonify({
        'message': 'Concepto eliminado',
        'resumen': calcular_resumen_precheck(evento)
    }), 200


# ==================== ADICIONALES ====================

@precheck_bp.route('/<int:evento_id>/adicionales', methods=['POST'])
@token_required
def agregar_adicional(current_user, evento_id):
    """Agregar un adicional al pre-check"""
    evento = Evento.query.get_or_404(evento_id)

    puede_editar, error = verificar_permiso_edicion(evento, current_user)
    if not puede_editar:
        return jsonify({'error': error}), 403

    data = request.json
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    # Validar campos requeridos
    required = ['categoria', 'descripcion', 'monto']
    for field in required:
        if field not in data:
            return jsonify({'error': f'Campo {field} es requerido'}), 400

    adicional = PrecheckAdicional(
        evento_id=evento_id,
        categoria=data['categoria'],
        categoria_otro=data.get('categoria_otro') if data['categoria'] == 'Otros' else None,
        descripcion=data['descripcion'],
        monto=data['monto']
    )

    db.session.add(adicional)
    db.session.commit()

    return jsonify({
        'message': 'Adicional agregado',
        'adicional': adicional.to_dict(),
        'resumen': calcular_resumen_precheck(evento)
    }), 201


@precheck_bp.route('/<int:evento_id>/adicionales/<int:adicional_id>', methods=['PUT'])
@token_required
def actualizar_adicional(current_user, evento_id, adicional_id):
    """Actualizar un adicional del pre-check"""
    evento = Evento.query.get_or_404(evento_id)
    adicional = PrecheckAdicional.query.filter_by(id=adicional_id, evento_id=evento_id).first_or_404()

    puede_editar, error = verificar_permiso_edicion(evento, current_user)
    if not puede_editar:
        return jsonify({'error': error}), 403

    data = request.json
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    if 'categoria' in data:
        adicional.categoria = data['categoria']
        adicional.categoria_otro = data.get('categoria_otro') if data['categoria'] == 'Otros' else None
    if 'descripcion' in data:
        adicional.descripcion = data['descripcion']
    if 'monto' in data:
        adicional.monto = data['monto']

    db.session.commit()

    return jsonify({
        'message': 'Adicional actualizado',
        'adicional': adicional.to_dict(),
        'resumen': calcular_resumen_precheck(evento)
    }), 200


@precheck_bp.route('/<int:evento_id>/adicionales/<int:adicional_id>', methods=['DELETE'])
@token_required
def eliminar_adicional(current_user, evento_id, adicional_id):
    """Eliminar un adicional del pre-check"""
    evento = Evento.query.get_or_404(evento_id)
    adicional = PrecheckAdicional.query.filter_by(id=adicional_id, evento_id=evento_id).first_or_404()

    puede_editar, error = verificar_permiso_edicion(evento, current_user)
    if not puede_editar:
        return jsonify({'error': error}), 403

    db.session.delete(adicional)
    db.session.commit()

    return jsonify({
        'message': 'Adicional eliminado',
        'resumen': calcular_resumen_precheck(evento)
    }), 200


# ==================== PAGOS ====================

@precheck_bp.route('/<int:evento_id>/pagos', methods=['POST'])
@token_required
def agregar_pago(current_user, evento_id):
    """Agregar un pago al pre-check"""
    evento = Evento.query.get_or_404(evento_id)

    puede_editar, error = verificar_permiso_pagos(evento, current_user)
    if not puede_editar:
        return jsonify({'error': error}), 403

    data = request.json
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    # Validar campos requeridos
    required = ['metodo_pago', 'monto', 'fecha_pago']
    for field in required:
        if field not in data:
            return jsonify({'error': f'Campo {field} es requerido'}), 400

    pago = PrecheckPago(
        evento_id=evento_id,
        metodo_pago=data['metodo_pago'],
        monto=data['monto'],
        fecha_pago=datetime.strptime(data['fecha_pago'], '%Y-%m-%d').date(),
        notas=data.get('notas')
    )

    db.session.add(pago)
    db.session.commit()

    return jsonify({
        'message': 'Pago agregado',
        'pago': pago.to_dict(),
        'resumen': calcular_resumen_precheck(evento)
    }), 201


@precheck_bp.route('/<int:evento_id>/pagos/<int:pago_id>', methods=['PUT'])
@token_required
def actualizar_pago(current_user, evento_id, pago_id):
    """Actualizar un pago del pre-check"""
    evento = Evento.query.get_or_404(evento_id)
    pago = PrecheckPago.query.filter_by(id=pago_id, evento_id=evento_id).first_or_404()

    # Solo se pueden editar pagos en REVISION
    if pago.estado != 'REVISION':
        return jsonify({'error': 'Solo se pueden editar pagos en revisión'}), 403

    puede_editar, error = verificar_permiso_pagos(evento, current_user)
    if not puede_editar:
        return jsonify({'error': error}), 403

    data = request.json
    if not data:
        return jsonify({'error': 'Datos requeridos'}), 400

    if 'metodo_pago' in data:
        pago.metodo_pago = data['metodo_pago']
    if 'monto' in data:
        pago.monto = data['monto']
    if 'fecha_pago' in data:
        pago.fecha_pago = datetime.strptime(data['fecha_pago'], '%Y-%m-%d').date()
    if 'notas' in data:
        pago.notas = data['notas']

    db.session.commit()

    return jsonify({
        'message': 'Pago actualizado',
        'pago': pago.to_dict(),
        'resumen': calcular_resumen_precheck(evento)
    }), 200


@precheck_bp.route('/<int:evento_id>/pagos/<int:pago_id>', methods=['DELETE'])
@token_required
def eliminar_pago(current_user, evento_id, pago_id):
    """Eliminar un pago del pre-check"""
    evento = Evento.query.get_or_404(evento_id)
    pago = PrecheckPago.query.filter_by(id=pago_id, evento_id=evento_id).first_or_404()

    # Solo se pueden eliminar pagos en REVISION
    if pago.estado != 'REVISION':
        return jsonify({'error': 'Solo se pueden eliminar pagos en revisión'}), 403

    puede_editar, error = verificar_permiso_pagos(evento, current_user)
    if not puede_editar:
        return jsonify({'error': error}), 403

    # Si tiene comprobante, eliminarlo del bucket
    if pago.comprobante_url:
        try:
            eliminar_archivo_bucket(pago.comprobante_url)
        except Exception as e:
            print(f"Error eliminando comprobante: {e}")

    db.session.delete(pago)
    db.session.commit()

    return jsonify({
        'message': 'Pago eliminado',
        'resumen': calcular_resumen_precheck(evento)
    }), 200


# ==================== COMPROBANTES ====================

def eliminar_archivo_bucket(url):
    """Eliminar archivo del bucket de GCP"""
    try:
        # Extraer el nombre del blob de la URL
        blob_name = url.split(f'{GCP_BUCKET_NAME}/')[-1]
        storage_client = storage.Client()
        bucket = storage_client.bucket(GCP_BUCKET_NAME)
        blob = bucket.blob(blob_name)
        blob.delete()
    except Exception as e:
        print(f"Error eliminando archivo: {e}")


@precheck_bp.route('/<int:evento_id>/pagos/<int:pago_id>/comprobante', methods=['POST'])
@token_required
def subir_comprobante(current_user, evento_id, pago_id):
    """Subir comprobante de pago"""
    evento = Evento.query.get_or_404(evento_id)
    pago = PrecheckPago.query.filter_by(id=pago_id, evento_id=evento_id).first_or_404()

    puede_editar, error = verificar_permiso_pagos(evento, current_user)
    if not puede_editar:
        return jsonify({'error': error}), 403

    if 'file' not in request.files:
        return jsonify({'error': 'No se envió archivo'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Nombre de archivo vacío'}), 400

    # Validar extensión
    allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'pdf'}
    ext = file.filename.rsplit('.', 1)[-1].lower()
    if ext not in allowed_extensions:
        return jsonify({'error': f'Extensión no permitida. Usar: {", ".join(allowed_extensions)}'}), 400

    # Si ya tiene comprobante, eliminar el anterior
    if pago.comprobante_url:
        try:
            eliminar_archivo_bucket(pago.comprobante_url)
        except Exception as e:
            print(f"Error eliminando comprobante anterior: {e}")

    # Generar nombre único
    filename = f"comprobantes/{evento_id}/{pago_id}_{uuid.uuid4().hex}.{ext}"

    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(GCP_BUCKET_NAME)
        blob = bucket.blob(filename)

        # Subir archivo
        blob.upload_from_file(file, content_type=file.content_type)

        # Construir URL pública (bucket tiene acceso uniforme con IAM público)
        url = f"https://storage.googleapis.com/{GCP_BUCKET_NAME}/{filename}"

        # Actualizar pago
        pago.comprobante_url = url
        pago.comprobante_nombre = file.filename
        db.session.commit()

        return jsonify({
            'message': 'Comprobante subido',
            'pago': pago.to_dict()
        }), 200

    except Exception as e:
        return jsonify({'error': f'Error subiendo archivo: {str(e)}'}), 500


@precheck_bp.route('/<int:evento_id>/pagos/<int:pago_id>/comprobante', methods=['DELETE'])
@token_required
def eliminar_comprobante(current_user, evento_id, pago_id):
    """Eliminar comprobante de pago"""
    evento = Evento.query.get_or_404(evento_id)
    pago = PrecheckPago.query.filter_by(id=pago_id, evento_id=evento_id).first_or_404()

    puede_editar, error = verificar_permiso_pagos(evento, current_user)
    if not puede_editar:
        return jsonify({'error': error}), 403

    if not pago.comprobante_url:
        return jsonify({'error': 'No hay comprobante para eliminar'}), 400

    try:
        eliminar_archivo_bucket(pago.comprobante_url)
    except Exception as e:
        print(f"Error eliminando comprobante: {e}")

    pago.comprobante_url = None
    pago.comprobante_nombre = None
    db.session.commit()

    return jsonify({
        'message': 'Comprobante eliminado',
        'pago': pago.to_dict()
    }), 200


# ==================== FACTURADA ====================

@precheck_bp.route('/<int:evento_id>/facturada', methods=['PUT'])
@token_required
def actualizar_facturada(current_user, evento_id):
    """Actualizar estado de facturada (para cálculo de IVA)"""
    evento = Evento.query.get_or_404(evento_id)

    puede_editar, error = verificar_permiso_edicion(evento, current_user)
    if not puede_editar:
        return jsonify({'error': error}), 403

    data = request.json
    if 'facturada' not in data:
        return jsonify({'error': 'Campo facturada requerido'}), 400

    evento.facturada = data['facturada']
    db.session.commit()

    return jsonify({
        'message': 'Estado de facturación actualizado',
        'facturada': evento.facturada,
        'resumen': calcular_resumen_precheck(evento)
    }), 200


# ==================== TRANSICIÓN A CONCLUIDO ====================

@precheck_bp.route('/verificar-concluidos', methods=['POST'])
@token_required
def verificar_eventos_concluidos(current_user):
    """
    Verificar y actualizar eventos que deberían estar en CONCLUIDO.
    Solo admin puede ejecutar esto manualmente.
    Se ejecuta automáticamente en un cron job.
    """
    if current_user.rol != 'admin':
        return jsonify({'error': 'Solo admin puede ejecutar esta acción'}), 403

    hoy = date.today()
    eventos_actualizados = []

    # Buscar eventos APROBADO con fecha pasada
    eventos = Evento.query.filter(
        Evento.estado == 'APROBADO',
        Evento.fecha_evento < hoy
    ).all()

    for evento in eventos:
        evento.estado = 'CONCLUIDO'
        eventos_actualizados.append({
            'id': evento.id,
            'titulo': evento.titulo or evento.generar_titulo_auto(),
            'fecha_evento': evento.fecha_evento.isoformat()
        })

    db.session.commit()

    return jsonify({
        'message': f'{len(eventos_actualizados)} eventos actualizados a CONCLUIDO',
        'eventos': eventos_actualizados
    }), 200


# ==================== EXPORTAR PDF ====================

@precheck_bp.route('/<int:evento_id>/pdf', methods=['GET'])
@token_required
def exportar_pdf(current_user, evento_id):
    """Generar y descargar PDF del pre-check"""
    from flask import send_file
    from app.utils.pdf_generator import generar_pdf_precheck

    evento = Evento.query.get_or_404(evento_id)

    # Verificar acceso
    if current_user.rol != 'admin' and evento.comercial_id != current_user.id:
        return jsonify({'error': 'No tienes acceso a este evento'}), 403

    # Obtener datos
    conceptos = [c.to_dict() for c in evento.precheck_conceptos.order_by(PrecheckConcepto.categoria, PrecheckConcepto.id)]
    adicionales = [a.to_dict() for a in evento.precheck_adicionales.order_by(PrecheckAdicional.categoria, PrecheckAdicional.id)]
    pagos = [p.to_dict() for p in evento.precheck_pagos.order_by(PrecheckPago.fecha_pago.desc())]
    resumen = calcular_resumen_precheck(evento)

    # Generar PDF
    evento_dict = evento.to_dict(include_counts=True)
    pdf_buffer = generar_pdf_precheck(evento_dict, conceptos, adicionales, pagos, resumen)

    # Nombre del archivo
    cliente_nombre = evento.cliente.nombre.replace(' ', '_') if evento.cliente else 'cliente'
    fecha = evento.fecha_evento.strftime('%Y%m%d') if evento.fecha_evento else 'sin_fecha'
    filename = f"precheck_{cliente_nombre}_{fecha}.pdf"

    return send_file(
        pdf_buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=filename
    )
