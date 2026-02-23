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
    'Gastronomía',
    'Venue',
    'Técnica',
    'Servicios',
    'Otros'
]

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
    created_at = db.Column(db.DateTime, default=ahora_argentina)
    updated_at = db.Column(db.DateTime, default=ahora_argentina, onupdate=ahora_argentina)

    # Relación con evento
    evento = db.relationship('Evento', backref=db.backref('precheck_conceptos', lazy='dynamic', cascade='all, delete-orphan'))

    @property
    def subtotal(self):
        """Calcula el subtotal (cantidad * precio_unitario)"""
        return Decimal(str(self.cantidad)) * Decimal(str(self.precio_unitario))

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
    comprobante_url = db.Column(db.String(500), nullable=True)  # URL en GCP bucket
    comprobante_nombre = db.Column(db.String(255), nullable=True)  # Nombre original del archivo
    notas = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=ahora_argentina)
    updated_at = db.Column(db.DateTime, default=ahora_argentina, onupdate=ahora_argentina)

    # Relación con evento
    evento = db.relationship('Evento', backref=db.backref('precheck_pagos', lazy='dynamic', cascade='all, delete-orphan'))

    def to_dict(self):
        return {
            'id': self.id,
            'evento_id': self.evento_id,
            'metodo_pago': self.metodo_pago,
            'monto': float(self.monto) if self.monto else 0,
            'fecha_pago': self.fecha_pago.isoformat() if self.fecha_pago else None,
            'comprobante_url': self.comprobante_url,
            'comprobante_nombre': self.comprobante_nombre,
            'notas': self.notas,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


def calcular_resumen_precheck(evento):
    """
    Calcula el resumen completo del pre-check de un evento

    Returns:
        dict con totales, IVA, pendiente, etc.
    """
    from decimal import Decimal

    # Sumar conceptos
    total_conceptos = Decimal('0')
    for concepto in evento.precheck_conceptos:
        total_conceptos += concepto.subtotal

    # Sumar adicionales
    total_adicionales = Decimal('0')
    for adicional in evento.precheck_adicionales:
        total_adicionales += Decimal(str(adicional.monto))

    # Calcular subtotal
    subtotal = total_conceptos + total_adicionales

    # Calcular IVA si está facturada
    iva = Decimal('0')
    if hasattr(evento, 'facturada') and evento.facturada:
        iva = subtotal * Decimal('0.21')

    # Total con IVA
    total = subtotal + iva

    # Sumar pagos
    total_pagado = Decimal('0')
    for pago in evento.precheck_pagos:
        total_pagado += Decimal(str(pago.monto))

    # Pendiente
    pendiente = total - total_pagado

    return {
        'total_conceptos': float(total_conceptos),
        'total_adicionales': float(total_adicionales),
        'subtotal': float(subtotal),
        'iva': float(iva),
        'total': float(total),
        'total_pagado': float(total_pagado),
        'pendiente': float(pendiente),
        'cantidad_conceptos': evento.precheck_conceptos.count(),
        'cantidad_adicionales': evento.precheck_adicionales.count(),
        'cantidad_pagos': evento.precheck_pagos.count(),
        'tiene_items': evento.precheck_conceptos.count() > 0 or evento.precheck_adicionales.count() > 0
    }
