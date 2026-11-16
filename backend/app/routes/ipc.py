"""
IPC (INDEC) para el ajuste del saldo de los pre-checks.

GET  /api/ipc                    últimos índices guardados (usuarios logueados)
GET  /api/ipc/calcular?monto=&desde=AAAA-MM-DD   simula el ajuste
POST /api/ipc/actualizar         fuerza la actualización desde datos.gob.ar
                                 (admin, o clave de servicio para un cron)
"""
from datetime import date

from flask import Blueprint, jsonify, request

from app.models_precheck import IpcIndice
from app.utils.ipc import actualizar_ipc, asegurar_ipc_al_dia, calcular_ajuste_ipc
from app.utils.seguridad import login_requerido, servicio_o_admin

ipc_bp = Blueprint('ipc', __name__)


@ipc_bp.route('', methods=['GET'])
@login_requerido
def listar_ipc():
    asegurar_ipc_al_dia()
    meses = IpcIndice.query.order_by(IpcIndice.periodo.desc()).limit(24).all()
    return jsonify({'serie': 'IPC Nivel General Nacional (INDEC, base dic 2016)',
                    'indices': [m.to_dict() for m in meses]}), 200


@ipc_bp.route('/calcular', methods=['GET'])
@login_requerido
def simular_ajuste():
    try:
        monto = float(request.args.get('monto', '0'))
        desde = date.fromisoformat(request.args.get('desde', ''))
    except ValueError:
        return jsonify({'error': 'Parámetros: monto (número) y desde (AAAA-MM-DD)'}), 400
    return jsonify(calcular_ajuste_ipc(monto, desde)), 200


@ipc_bp.route('/actualizar', methods=['POST'])
@servicio_o_admin
def forzar_actualizacion():
    try:
        return jsonify(actualizar_ipc()), 200
    except Exception as e:  # noqa: BLE001
        return jsonify({'error': f'No se pudo consultar datos.gob.ar: {e}'}), 502
