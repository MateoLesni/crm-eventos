"""
Modelos SQLAlchemy para sistema Pre-Check
Tablas: precheck_conceptos, precheck_adicionales, precheck_pagos
"""
from app import db
from datetime import datetime
from decimal import Decimal
from app.utils.timezone import ahora_argentina


# Categorías disponibles para conceptos y adicionales
CATEGORIAS_PRECHECK = [
    'Menú',
    'Barra',
    'Vinos',
    'Espumante',
    'Exclusividad',
    'DJ / Setup',
    'Técnica',
    'Ambientación',
    'Valet / Estacionamiento',
    'Día de armado',
    'Café',
    'Descuento',
    'Otros',
]

# Categorías del esquema anterior: se siguen aceptando para no romper lo ya cargado
CATEGORIAS_LEGACY = ['Gastronomía', 'Venue', 'Servicios']

# Línea que genera el sistema al aplicar el ajuste por IPC (no se elige a mano)
CATEGORIA_AJUSTE_IPC = 'Ajuste IPC'

# Cómo se calcula la cantidad de un ítem del catálogo
MODALIDADES = {
    'por_persona': 'Por persona',
    'por_unidad': 'Por unidad',
    'fijo': 'Precio fijo',
}

# Estados del pre-check
ESTADOS_PRECHECK = ['BORRADOR', 'EN_REVISION', 'APROBADO', 'CERRADO']

# Métodos de pago
METODOS_PAGO = [
    'Efectivo',
    'Transferencia',
    'Tarjeta',
    'Cheque',
    'Otros'
]


class PrecheckConcepto(db.Model):
    """
    Conceptos del pre-check (menu, bar, DJ, luces, etc.)
    Permite valores negativos para bonificaciones/descuentos
    """
    __tablename__ = 'precheck_conceptos'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    evento_id = db.Column(db.Integer, db.ForeignKey('eventos.id', ondelete='CASCADE'), nullable=False, index=True)
    categoria = db.Column(db.String(50), nullable=False)  # Gastronomía, Venue, Técnica, Servicios, Otros
    categoria_otro = db.Column(db.String(100), nullable=True)  # Si categoria='Otros'
    descripcion = db.Column(db.String(255), nullable=False)
    cantidad = db.Column(db.Numeric(10, 2), nullable=False, default=1)
    precio_unitario = db.Column(db.Numeric(12, 2), nullable=False)
    observaciones = db.Column(db.Text, nullable=True)
    catalogo_item_id = db.Column(db.Integer, db.ForeignKey('catalogo_items.id', ondelete='SET NULL'), nullable=True)
    modalidad = db.Column(db.String(20), nullable=True)            # por_persona, por_unidad, fijo
    precio_lista = db.Column(db.Numeric(12, 2), nullable=True)     # precio del catálogo al momento de cargarlo
    ajusta_ipc = db.Column(db.Boolean, nullable=False, default=True)
    es_ajuste_ipc = db.Column(db.Boolean, nullable=False, default=False)
    ipc_periodo_desde = db.Column(db.String(7), nullable=True)     # AAAA-MM (solo líneas de ajuste)
    ipc_periodo_hasta = db.Column(db.String(7), nullable=True)
    created_at = db.Column(db.DateTime, default=ahora_argentina)
    updated_at = db.Column(db.DateTime, default=ahora_argentina, onupdate=ahora_argentina)

    # Relación con evento
    evento = db.relationship('Evento', backref=db.backref('precheck_conceptos', lazy='dynamic', cascade='all, delete-orphan'))

    @property
    def subtotal(self):
        """Calcula el subtotal (cantidad * precio_unitario)"""
        return Decimal(str(self.cantidad)) * Decimal(str(self.precio_unitario))

    @property
    def fuera_de_lista(self):
        """
        Precio distinto al del catálogo, ítem cargado a mano o descuento.
        Son los que tienen que aprobar Pilar o el Tano.
        """
        if self.es_ajuste_ipc:
            return False
        if Decimal(str(self.precio_unitario)) < 0:
            return True
        if self.precio_lista is None:
            return True
        return Decimal(str(self.precio_unitario)) != Decimal(str(self.precio_lista))

    def to_dict(self):
        return {
            'id': self.id,
            'evento_id': self.evento_id,
            'categoria': self.categoria,
            'categoria_otro': self.categoria_otro,
            'descripcion': self.descripcion,
            'cantidad': float(self.cantidad) if self.cantidad else 0,
            'precio_unitario': float(self.precio_unitario) if self.precio_unitario else 0,
            'subtotal': float(self.subtotal),
            'observaciones': self.observaciones,
            'catalogo_item_id': self.catalogo_item_id,
            'modalidad': self.modalidad,
            'precio_lista': float(self.precio_lista) if self.precio_lista is not None else None,
            'fuera_de_lista': self.fuera_de_lista,
            'ajusta_ipc': bool(self.ajusta_ipc),
            'es_ajuste_ipc': bool(self.es_ajuste_ipc),
            'ipc_periodo_desde': self.ipc_periodo_desde,
            'ipc_periodo_hasta': self.ipc_periodo_hasta,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class PrecheckAdicional(db.Model):
    """
    Adicionales del pre-check (items extra con monto fijo)
    """
    __tablename__ = 'precheck_adicionales'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    evento_id = db.Column(db.Integer, db.ForeignKey('eventos.id', ondelete='CASCADE'), nullable=False, index=True)
    categoria = db.Column(db.String(50), nullable=False)  # Gastronomía, Venue, Técnica, Servicios, Otros
    categoria_otro = db.Column(db.String(100), nullable=True)  # Si categoria='Otros'
    descripcion = db.Column(db.String(255), nullable=False)
    monto = db.Column(db.Numeric(12, 2), nullable=False)
    observaciones = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=ahora_argentina)
    updated_at = db.Column(db.DateTime, default=ahora_argentina, onupdate=ahora_argentina)

    # Relación con evento
    evento = db.relationship('Evento', backref=db.backref('precheck_adicionales', lazy='dynamic', cascade='all, delete-orphan'))

    def to_dict(self):
        return {
            'id': self.id,
            'evento_id': self.evento_id,
            'categoria': self.categoria,
            'categoria_otro': self.categoria_otro,
            'descripcion': self.descripcion,
            'monto': float(self.monto) if self.monto else 0,
            'observaciones': self.observaciones,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class PrecheckPago(db.Model):
    """
    Pagos registrados para el pre-check
    Incluye comprobante (imagen/PDF en GCP bucket)
    """
    __tablename__ = 'precheck_pagos'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    evento_id = db.Column(db.Integer, db.ForeignKey('eventos.id', ondelete='CASCADE'), nullable=False, index=True)
    metodo_pago = db.Column(db.String(50), nullable=False)  # Efectivo, Transferencia, Tarjeta, Cheque, Otros
    monto = db.Column(db.Numeric(12, 2), nullable=False)
    fecha_pago = db.Column(db.Date, nullable=False)
    fecha_deposito = db.Column(db.Date, nullable=True)
    fecha_acreditacion = db.Column(db.Date, nullable=True)
    comprobante_url = db.Column(db.String(500), nullable=True)  # URL en GCP bucket
    comprobante_nombre = db.Column(db.String(255), nullable=True)  # Nombre original del archivo
    notas = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=ahora_argentina)
    updated_at = db.Column(db.DateTime, default=ahora_argentina, onupdate=ahora_argentina)

    # Campos de validación (tesorería)
    estado = db.Column(db.String(20), nullable=False, default='REVISION')  # REVISION, VALIDADO, RECHAZADO
    numero_oppen = db.Column(db.String(50), nullable=True)
    validado_por_id = db.Column(db.Integer, db.ForeignKey('usuarios.id', ondelete='SET NULL'), nullable=True)
    fecha_validacion = db.Column(db.DateTime, nullable=True)
    motivo_rechazo = db.Column(db.Text, nullable=True)
    monto_original = db.Column(db.Numeric(12, 2), nullable=True)
    observacion_monto = db.Column(db.Text, nullable=True)

    # Relación con evento
    evento = db.relationship('Evento', backref=db.backref('precheck_pagos', lazy='dynamic', cascade='all, delete-orphan'))
    validado_por = db.relationship('Usuario', foreign_keys=[validado_por_id])

    def to_dict(self):
        return {
            'id': self.id,
            'evento_id': self.evento_id,
            'metodo_pago': self.metodo_pago,
            'monto': float(self.monto) if self.monto else 0,
            'fecha_pago': self.fecha_pago.isoformat() if self.fecha_pago else None,
            'fecha_deposito': self.fecha_deposito.isoformat() if self.fecha_deposito else None,
            'fecha_acreditacion': self.fecha_acreditacion.isoformat() if self.fecha_acreditacion else None,
            'comprobante_url': self.comprobante_url,
            'comprobante_nombre': self.comprobante_nombre,
            'notas': self.notas,
            'estado': self.estado,
            'numero_oppen': self.numero_oppen,
            'validado_por_id': self.validado_por_id,
            'validado_por_nombre': self.validado_por.nombre if self.validado_por else None,
            'fecha_validacion': self.fecha_validacion.isoformat() if self.fecha_validacion else None,
            'motivo_rechazo': self.motivo_rechazo,
            'monto_original': float(self.monto_original) if self.monto_original else None,
            'observacion_monto': self.observacion_monto,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


def calcular_resumen_precheck(evento):
    """Resumen de totales del pre-check (se mantiene el nombre por compatibilidad)."""
    from app.utils.precheck_calculo import calcular_resumen
    return calcular_resumen(evento)


class LocalSector(db.Model):
    """
    Espacios/sectores de cada local (salón, terraza, exclusivo total...).
    Cada uno con su capacidad y el valor de la exclusividad.
    """
    __tablename__ = 'local_sectores'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    local_id = db.Column(db.Integer, db.ForeignKey('locales.id', ondelete='CASCADE'), nullable=False, index=True)
    nombre = db.Column(db.String(100), nullable=False)
    pax_min = db.Column(db.Integer, nullable=True)
    pax_max = db.Column(db.Integer, nullable=True)
    precio_exclusividad = db.Column(db.Numeric(14, 2), nullable=True)
    observaciones = db.Column(db.Text, nullable=True)
    activo = db.Column(db.Boolean, nullable=False, default=True)
    orden = db.Column(db.Integer, nullable=False, default=0)
    updated_at = db.Column(db.DateTime, default=ahora_argentina, onupdate=ahora_argentina)

    local = db.relationship('Local')

    def to_dict(self):
        return {
            'id': self.id,
            'local_id': self.local_id,
            'local_nombre': self.local.nombre if self.local else None,
            'nombre': self.nombre,
            'pax_min': self.pax_min,
            'pax_max': self.pax_max,
            'precio_exclusividad': float(self.precio_exclusividad) if self.precio_exclusividad is not None else None,
            'observaciones': self.observaciones,
            'activo': bool(self.activo),
            'orden': self.orden,
        }


class CatalogoItem(db.Model):
    """
    Lista de precios que mantienen Pilar y el Tano. local_id NULL = vale para todos los locales.
    """
    __tablename__ = 'catalogo_items'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    local_id = db.Column(db.Integer, db.ForeignKey('locales.id', ondelete='CASCADE'), nullable=True, index=True)
    categoria = db.Column(db.String(50), nullable=False)
    nombre = db.Column(db.String(200), nullable=False)
    descripcion = db.Column(db.Text, nullable=True)
    modalidad = db.Column(db.String(20), nullable=False, default='por_persona')
    precio = db.Column(db.Numeric(14, 2), nullable=False)
    ajusta_ipc = db.Column(db.Boolean, nullable=False, default=True)
    activo = db.Column(db.Boolean, nullable=False, default=True)
    orden = db.Column(db.Integer, nullable=False, default=0)
    updated_at = db.Column(db.DateTime, default=ahora_argentina, onupdate=ahora_argentina)
    updated_by_id = db.Column(db.Integer, db.ForeignKey('usuarios.id', ondelete='SET NULL'), nullable=True)

    local = db.relationship('Local')
    updated_by = db.relationship('Usuario')

    def to_dict(self):
        return {
            'id': self.id,
            'local_id': self.local_id,
            'local_nombre': self.local.nombre if self.local else 'Todos los locales',
            'categoria': self.categoria,
            'nombre': self.nombre,
            'descripcion': self.descripcion,
            'modalidad': self.modalidad,
            'precio': float(self.precio) if self.precio is not None else 0,
            'ajusta_ipc': bool(self.ajusta_ipc),
            'activo': bool(self.activo),
            'orden': self.orden,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'updated_by': self.updated_by.nombre if self.updated_by else None,
        }


class PrecheckConfig(db.Model):
    """Parámetros generales editables desde la app (clave/valor)."""
    __tablename__ = 'precheck_config'

    clave = db.Column(db.String(60), primary_key=True)
    valor = db.Column(db.Text, nullable=True)
    updated_at = db.Column(db.DateTime, default=ahora_argentina, onupdate=ahora_argentina)
    updated_by_id = db.Column(db.Integer, db.ForeignKey('usuarios.id', ondelete='SET NULL'), nullable=True)


# Valores por defecto si todavía no se configuraron.
# propina_local_<id>: porcentaje de propina de cada local (0 = no se discrimina)
CONFIG_DEFAULTS = {
    'sena_porcentaje': '50',
    'dias_saldo_antes_evento': '7',
    'condiciones': '',
}


def leer_config():
    valores = dict(CONFIG_DEFAULTS)
    for c in PrecheckConfig.query.all():
        if c.valor is not None:
            valores[c.clave] = c.valor
    return valores


class Precheck(db.Model):
    """Cabecera del pre-check: un registro por evento."""
    __tablename__ = 'prechecks'

    evento_id = db.Column(db.Integer, db.ForeignKey('eventos.id', ondelete='CASCADE'), primary_key=True)
    sector_id = db.Column(db.Integer, db.ForeignKey('local_sectores.id', ondelete='SET NULL'), nullable=True)
    motivo = db.Column(db.String(200), nullable=True)
    razon_social = db.Column(db.String(200), nullable=True)   # empresa/agencia que factura, si aplica
    propina_porcentaje = db.Column(db.Numeric(5, 2), nullable=False, default=0)
    estado = db.Column(db.String(20), nullable=False, default='BORRADOR')
    modificado_post_aprobacion = db.Column(db.Boolean, nullable=False, default=False)
    enviado_revision_at = db.Column(db.DateTime, nullable=True)
    enviado_revision_por_id = db.Column(db.Integer, db.ForeignKey('usuarios.id', ondelete='SET NULL'), nullable=True)
    aprobado_at = db.Column(db.DateTime, nullable=True)
    aprobado_por_id = db.Column(db.Integer, db.ForeignKey('usuarios.id', ondelete='SET NULL'), nullable=True)
    cerrado_at = db.Column(db.DateTime, nullable=True)
    cerrado_por_id = db.Column(db.Integer, db.ForeignKey('usuarios.id', ondelete='SET NULL'), nullable=True)
    monto_final = db.Column(db.Numeric(14, 2), nullable=True)   # total al cerrar
    saldo_al_cierre = db.Column(db.Numeric(14, 2), nullable=True)
    created_at = db.Column(db.DateTime, default=ahora_argentina)
    updated_at = db.Column(db.DateTime, default=ahora_argentina, onupdate=ahora_argentina)

    evento = db.relationship('Evento', backref=db.backref('precheck', uselist=False, cascade='all, delete-orphan'))
    sector = db.relationship('LocalSector')
    enviado_revision_por = db.relationship('Usuario', foreign_keys=[enviado_revision_por_id])
    aprobado_por = db.relationship('Usuario', foreign_keys=[aprobado_por_id])
    cerrado_por = db.relationship('Usuario', foreign_keys=[cerrado_por_id])

    def to_dict(self):
        def fecha(d):
            return d.isoformat() if d else None
        return {
            'sector_id': self.sector_id,
            'sector': self.sector.to_dict() if self.sector else None,
            'motivo': self.motivo,
            'razon_social': self.razon_social,
            'propina_porcentaje': float(self.propina_porcentaje or 0),
            'estado': self.estado,
            'modificado_post_aprobacion': bool(self.modificado_post_aprobacion),
            'enviado_revision_at': fecha(self.enviado_revision_at),
            'enviado_revision_por': self.enviado_revision_por.nombre if self.enviado_revision_por else None,
            'aprobado_at': fecha(self.aprobado_at),
            'aprobado_por': self.aprobado_por.nombre if self.aprobado_por else None,
            'cerrado_at': fecha(self.cerrado_at),
            'cerrado_por': self.cerrado_por.nombre if self.cerrado_por else None,
            'monto_final': float(self.monto_final) if self.monto_final is not None else None,
            'saldo_al_cierre': float(self.saldo_al_cierre) if self.saldo_al_cierre is not None else None,
        }


class PrecheckHistorial(db.Model):
    """Quién cambió qué y cuándo en el pre-check."""
    __tablename__ = 'precheck_historial'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    evento_id = db.Column(db.Integer, db.ForeignKey('eventos.id', ondelete='CASCADE'), nullable=False, index=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id', ondelete='SET NULL'), nullable=True)
    accion = db.Column(db.String(60), nullable=False)
    detalle = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=ahora_argentina, index=True)

    usuario = db.relationship('Usuario')

    def to_dict(self):
        return {
            'id': self.id,
            'accion': self.accion,
            'detalle': self.detalle,
            'usuario': self.usuario.nombre if self.usuario else 'Sistema',
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class IpcIndice(db.Model):
    """
    IPC Nivel General Nacional (INDEC, base dic 2016), un registro por mes.
    Se trae de la API de series de datos.gob.ar y se guarda acá para no
    depender de que esa API responda cada vez que se calcula un ajuste.
    """
    __tablename__ = 'ipc_indices'

    periodo = db.Column(db.Date, primary_key=True)  # primer día del mes
    valor = db.Column(db.Numeric(14, 4), nullable=False)
    actualizado_at = db.Column(db.DateTime, default=ahora_argentina, onupdate=ahora_argentina)

    def to_dict(self):
        return {
            'periodo': self.periodo.strftime('%Y-%m'),
            'valor': float(self.valor),
        }
