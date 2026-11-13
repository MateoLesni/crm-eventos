"""
Identificación de clientes sin duplicar fichas.

El mismo teléfono llega en formatos distintos según el canal (549..., "11 4421-0966",
"+54 9 ..."). Se compara siempre por telefono_normalizado: los últimos 10 dígitos.
No se reescribe el teléfono original, que queda como lo cargaron.
"""
from sqlalchemy import func

from app import db
from app.models import Cliente, Evento, Usuario
from app.utils.telefono import normalizar_telefono


def buscar_cliente(telefono=None, email=None):
    """Cliente existente por teléfono (normalizado) y, si no aparece, por mail."""
    tel = normalizar_telefono(telefono)
    if tel:
        cliente = Cliente.query.filter_by(telefono_normalizado=tel).order_by(Cliente.id.asc()).first()
        if cliente:
            return cliente
    if email and str(email).strip():
        return (Cliente.query
                .filter(func.lower(Cliente.email) == str(email).strip().lower())
                .order_by(Cliente.id.asc())
                .first())
    return None


def _clave_grupo(cliente_id, telefono_normalizado, email):
    # Fichas de cliente duplicadas (mismo teléfono o mail) cuentan como una sola persona
    if telefono_normalizado:
        return f'tel:{telefono_normalizado}'
    if email:
        return f'mail:{email.strip().lower()}'
    return f'id:{cliente_id}'


def resumen_recurrencia(cliente_ids=None):
    """
    {cliente_id: {cantidad_eventos, es_cliente_recurrente, comercial_preferido}}
    en una sola consulta agrupada. Agrupa fichas duplicadas del mismo cliente.
    """
    filas = (db.session.query(
                Cliente.id, Cliente.telefono_normalizado, Cliente.email, Cliente.comercial_preferido_id,
                func.count(Evento.id))
             .outerjoin(Evento, (Evento.cliente_id == Cliente.id) & (Evento.estado != 'ELIMINADO'))
             .group_by(Cliente.id, Cliente.telefono_normalizado, Cliente.email, Cliente.comercial_preferido_id)
             .all())

    grupos = {}
    clave_de = {}
    for cid, tel, email, pref_id, cant in filas:
        clave = _clave_grupo(cid, tel, email)
        clave_de[cid] = clave
        g = grupos.setdefault(clave, {'cantidad': 0, 'pref_id': None, 'pref_cliente': -1})
        g['cantidad'] += cant
        # Si hay varias fichas con comercial preferido, gana la más reciente
        if pref_id and cid > g['pref_cliente']:
            g['pref_id'], g['pref_cliente'] = pref_id, cid

    nombres = {u.id: u.nombre for u in Usuario.query.with_entities(Usuario.id, Usuario.nombre).all()}

    resultado = {}
    for cid in (cliente_ids if cliente_ids is not None else clave_de.keys()):
        g = grupos.get(clave_de.get(cid))
        if not g:
            continue
        resultado[cid] = {
            'cantidad_eventos': g['cantidad'],
            'es_cliente_recurrente': g['cantidad'] > 1,
            'comercial_preferido': {'id': g['pref_id'], 'nombre': nombres.get(g['pref_id'])} if g['pref_id'] else None,
        }
    return resultado
