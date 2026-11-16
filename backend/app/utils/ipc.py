"""
Ajuste por IPC del saldo de un pre-check.

Fuente: API de series de tiempo de datos.gob.ar, serie
148.3_INIVELNAL_DICI_M_26 (IPC Nivel General Nacional, INDEC, base dic 2016).
Es de acceso libre y no pide clave.

Regla (validar con administración):
- El índice base es el del mes en que se pagó la seña.
- El índice final es el último que publicó el INDEC.
- Ajuste = monto × (índice final / índice base − 1).
  Ej.: seña en agosto y último publicado octubre → se aplica la inflación
  de septiembre y octubre.
- Si el último publicado es el mismo mes de la seña (o anterior), no hay ajuste.
"""
import time
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

import requests

from app import db
from app.models_precheck import IpcIndice

SERIE_IPC = '148.3_INIVELNAL_DICI_M_26'
URL_SERIES = 'https://apis.datos.gob.ar/series/api/series/'
TIMEOUT = 10

# No consultar al INDEC más de una vez cada 6 h por instancia
_ultimo_intento = 0.0
INTERVALO_REINTENTO = 6 * 3600


def primer_dia_mes(fecha):
    return date(fecha.year, fecha.month, 1)


def actualizar_ipc():
    """Trae toda la serie y hace upsert. Devuelve cantidad de meses guardados y el último periodo."""
    global _ultimo_intento
    _ultimo_intento = time.time()
    resp = requests.get(URL_SERIES, params={
        'ids': SERIE_IPC, 'format': 'json', 'limit': 1000, 'start_date': '2017-01-01',
    }, timeout=TIMEOUT)
    resp.raise_for_status()
    filas = resp.json().get('data') or []

    existentes = {i.periodo: i for i in IpcIndice.query.all()}
    cambios = 0
    for periodo_txt, valor in filas:
        if valor is None:
            continue
        periodo = date.fromisoformat(periodo_txt[:10])
        valor = Decimal(str(valor))
        actual = existentes.get(periodo)
        if actual is None:
            db.session.add(IpcIndice(periodo=periodo, valor=valor))
            cambios += 1
        elif Decimal(str(actual.valor)) != valor:  # el INDEC a veces revisa meses previos
            actual.valor = valor
            cambios += 1
    db.session.commit()
    ultimo = IpcIndice.query.order_by(IpcIndice.periodo.desc()).first()
    return {'meses_actualizados': cambios, 'ultimo_periodo': ultimo.periodo.strftime('%Y-%m') if ultimo else None}


def _ultimo_indice():
    return IpcIndice.query.order_by(IpcIndice.periodo.desc()).first()


def asegurar_ipc_al_dia(hoy=None):
    """
    Si el último mes guardado tiene más de ~45 días, intenta actualizar
    (el INDEC publica a mediados del mes siguiente). Si la API falla,
    se sigue con lo que hay guardado.
    """
    hoy = hoy or date.today()
    ultimo = _ultimo_indice()
    desactualizado = ultimo is None or (hoy - ultimo.periodo).days > 45
    if desactualizado and time.time() - _ultimo_intento > INTERVALO_REINTENTO:
        try:
            actualizar_ipc()
        except Exception as e:  # noqa: BLE001 — la API externa no puede romper el pre-check
            db.session.rollback()
            print(f'No se pudo actualizar el IPC desde datos.gob.ar: {e}')


def calcular_ajuste_ipc(monto, fecha_base, actualizar=True):
    """
    Calcula el ajuste por IPC de `monto` desde el mes de `fecha_base` hasta el último
    índice publicado. Devuelve un dict con el detalle (sirve para mostrarlo en el
    pre-check y para dejar registro de qué índices se usaron).
    """
    if actualizar:
        asegurar_ipc_al_dia()

    monto = Decimal(str(monto or 0))
    periodo_base = primer_dia_mes(fecha_base)
    base = db.session.get(IpcIndice, periodo_base)
    final = _ultimo_indice()

    resultado = {
        'monto_base': float(monto),
        'periodo_base': periodo_base.strftime('%Y-%m'),
        'indice_base': float(base.valor) if base else None,
        'periodo_final': final.periodo.strftime('%Y-%m') if final else None,
        'indice_final': float(final.valor) if final else None,
        'variacion_pct': 0.0,
        'ajuste': 0.0,
        'aplica': False,
        'motivo': None,
    }
    if final is None:
        resultado['motivo'] = 'No hay índices de IPC cargados'
        return resultado
    if final.periodo <= periodo_base:
        resultado['motivo'] = 'Todavía no se publicó un IPC posterior al mes de la seña'
        return resultado
    if base is None:
        resultado['motivo'] = f'No hay índice para {periodo_base:%Y-%m}'
        return resultado

    factor = Decimal(str(final.valor)) / Decimal(str(base.valor))
    ajuste = (monto * (factor - 1)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    resultado.update({
        'variacion_pct': float(((factor - 1) * 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)),
        'ajuste': float(ajuste),
        'aplica': True,
    })
    return resultado
