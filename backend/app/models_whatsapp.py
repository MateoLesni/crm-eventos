"""
Modelos SQLAlchemy para WhatsApp Evolution API
Completamente separados del CRM de eventos
"""
from app import db
from datetime import datetime


class WAContacto(db.Model):
    """
    Almacena información única de cada cliente/lead de WhatsApp.
    Tabla: wa_contactos
    """
    __tablename__ = 'wa_contactos'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    numero_original = db.Column(db.String(20), nullable=False, index=True)
    numero_normalizado = db.Column(db.String(20), nullable=False, unique=True, index=True)
    numero_whatsapp = db.Column(db.String(30), nullable=True, index=True)
    nombre = db.Column(db.String(100), nullable=True)
    apellido = db.Column(db.String(100), nullable=True)
    email = db.Column(db.String(150), nullable=True)
    empresa = db.Column(db.String(150), nullable=True)
    es_cliente = db.Column(db.Boolean, default=False)
    estado = db.Column(db.String(20), default='nuevo', index=True)
    notas = db.Column(db.Text, nullable=True)
    fecha_creacion = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    fecha_actualizacion = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relación con conversaciones
    conversaciones = db.relationship('WAConversacion', back_populates='contacto', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'numero_original': self.numero_original,
            'numero_normalizado': self.numero_normalizado,
            'numero_whatsapp': self.numero_whatsapp,
            'nombre': self.nombre,
            'apellido': self.apellido,
            'nombre_completo': f"{self.nombre or ''} {self.apellido or ''}".strip() or None,
            'email': self.email,
            'empresa': self.empresa,
            'es_cliente': self.es_cliente,
            'estado': self.estado,
            'notas': self.notas,
            'fecha_creacion': self.fecha_creacion.isoformat() if self.fecha_creacion else None,
            'fecha_actualizacion': self.fecha_actualizacion.isoformat() if self.fecha_actualizacion else None
        }


class WAConversacion(db.Model):
    """
    Cada conversación = un hilo completo de chat con un contacto.
    Tabla: wa_conversaciones
    """
    __tablename__ = 'wa_conversaciones'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    contacto_id = db.Column(db.Integer, db.ForeignKey('wa_contactos.id', ondelete='CASCADE'), nullable=False, index=True)
    remote_jid = db.Column(db.String(50), nullable=False, index=True)
    instancia_nombre = db.Column(db.String(50), nullable=False, default='whatsapp_nuevo')
    estado = db.Column(db.String(20), default='abierta', index=True)
    ultima_actividad = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    total_mensajes = db.Column(db.Integer, default=0)
    mensajes_recibidos = db.Column(db.Integer, default=0)
    mensajes_enviados = db.Column(db.Integer, default=0)
    vendedor_numero = db.Column(db.String(20), nullable=True)
    vendedor_nombre = db.Column(db.String(100), nullable=True)
    fecha_creacion = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    fecha_actualizacion = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relaciones
    contacto = db.relationship('WAContacto', back_populates='conversaciones')
    mensajes = db.relationship('WAMensaje', back_populates='conversacion', cascade='all, delete-orphan', order_by='WAMensaje.timestamp')

    def to_dict(self, include_mensajes=False):
        data = {
            'id': self.id,
            'contacto_id': self.contacto_id,
            'contacto': self.contacto.to_dict() if self.contacto else None,
            'remote_jid': self.remote_jid,
            'instancia_nombre': self.instancia_nombre,
            'estado': self.estado,
            'ultima_actividad': self.ultima_actividad.isoformat() if self.ultima_actividad else None,
            'total_mensajes': self.total_mensajes,
            'mensajes_recibidos': self.mensajes_recibidos,
            'mensajes_enviados': self.mensajes_enviados,
            'vendedor_numero': self.vendedor_numero,
            'vendedor_nombre': self.vendedor_nombre,
            'fecha_creacion': self.fecha_creacion.isoformat() if self.fecha_creacion else None,
            'fecha_actualizacion': self.fecha_actualizacion.isoformat() if self.fecha_actualizacion else None
        }
        if include_mensajes:
            data['mensajes'] = [m.to_dict() for m in self.mensajes]
        return data


class WAMensaje(db.Model):
    """
    Almacena TODOS los mensajes individuales (enviados y recibidos).
    Tabla: wa_mensajes
    """
    __tablename__ = 'wa_mensajes'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    conversacion_id = db.Column(db.Integer, db.ForeignKey('wa_conversaciones.id', ondelete='CASCADE'), nullable=False, index=True)
    mensaje_id = db.Column(db.String(100), nullable=False, unique=True, index=True)
    texto = db.Column(db.Text, nullable=True)
    tipo_mensaje = db.Column(db.String(20), default='text')
    es_enviado = db.Column(db.Boolean, nullable=False, index=True)
    from_me = db.Column(db.Boolean, nullable=False)
    numero_remitente = db.Column(db.String(50), nullable=True)
    timestamp = db.Column(db.BigInteger, nullable=False, index=True)
    fecha_mensaje = db.Column(db.DateTime, nullable=False, index=True)
    fecha_creacion_bd = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    estado_lectura = db.Column(db.String(20), nullable=True)
    tiene_multimedia = db.Column(db.Boolean, default=False)
    multimedia_url = db.Column(db.String(500), nullable=True)
    mensaje_completo_json = db.Column(db.JSON, nullable=True)

    # Relación con conversación
    conversacion = db.relationship('WAConversacion', back_populates='mensajes')

    def to_dict(self):
        return {
            'id': self.id,
            'conversacion_id': self.conversacion_id,
            'mensaje_id': self.mensaje_id,
            'texto': self.texto,
            'tipo_mensaje': self.tipo_mensaje,
            'es_enviado': self.es_enviado,
            'from_me': self.from_me,
            'numero_remitente': self.numero_remitente,
            'timestamp': self.timestamp,
            'fecha_mensaje': self.fecha_mensaje.isoformat() if self.fecha_mensaje else None,
            'fecha_creacion_bd': self.fecha_creacion_bd.isoformat() if self.fecha_creacion_bd else None,
            'estado_lectura': self.estado_lectura,
            'tiene_multimedia': self.tiene_multimedia,
            'multimedia_url': self.multimedia_url
        }
