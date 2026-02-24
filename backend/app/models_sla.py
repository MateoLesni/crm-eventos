"""
Modelo SQLAlchemy para violaciones de SLA.
Registra cuándo un evento supera el umbral crítico en un estado,
para informes del CEO sobre demoras y responsables.
"""
from app import db
from app.utils.timezone import ahora_argentina


class SlaViolation(db.Model):
    """
    Registro persistente de violaciones SLA críticas.
    Se crea una sola vez por combinación (evento_id, estado) cuando
    el evento supera el umbral crítico. No se elimina si el evento avanza.
    """
    __tablename__ = 'sla_violations'

    id = db.Column(db.Integer, primary_key=True)
    evento_id = db.Column(db.Integer, db.ForeignKey('eventos.id', ondelete='CASCADE'), nullable=False, index=True)
    estado = db.Column(db.String(30), nullable=False)
    comercial_id = db.Column(db.Integer, db.ForeignKey('usuarios.id', ondelete='SET NULL'), nullable=True, index=True)
    comercial_nombre = db.Column(db.String(100))
    fecha_violacion = db.Column(db.DateTime, nullable=False, index=True)
    segundos_transcurridos = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=ahora_argentina)

    evento = db.relationship('Evento', backref='sla_violations')
    comercial = db.relationship('Usuario')

    def to_dict(self):
        return {
            'id': self.id,
            'evento_id': self.evento_id,
            'estado': self.estado,
            'comercial_id': self.comercial_id,
            'comercial_nombre': self.comercial_nombre,
            'fecha_violacion': self.fecha_violacion.isoformat() if self.fecha_violacion else None,
            'segundos_transcurridos': self.segundos_transcurridos,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
