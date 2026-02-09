from app import db
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

# Tabla de Locales
class Local(db.Model):
    __tablename__ = 'locales'

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(20), nullable=False)  # azul, verde, amarillo, etc.
    activo = db.Column(db.Boolean, default=True)

    eventos = db.relationship('Evento', backref='local', lazy='dynamic')

# Tabla de Usuarios (comerciales y admin)
class Usuario(db.Model):
    __tablename__ = 'usuarios'

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    rol = db.Column(db.String(20), nullable=False, default='comercial')  # admin, comercial
    activo = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    eventos_asignados = db.relationship('Evento', backref='comercial', lazy='dynamic')
    actividades = db.relationship('Actividad', backref='usuario', lazy='dynamic')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'nombre': self.nombre,
            'email': self.email,
            'rol': self.rol,
            'activo': self.activo
        }

# Tabla de Clientes (identificados por teléfono)
class Cliente(db.Model):
    __tablename__ = 'clientes'

    id = db.Column(db.Integer, primary_key=True)
    telefono = db.Column(db.String(30), unique=True, nullable=False)  # Identificador único
    nombre = db.Column(db.String(150), nullable=False)
    email = db.Column(db.String(120))
    empresa = db.Column(db.String(150))  # Para corporativos
    notas = db.Column(db.Text)
    comercial_preferido_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    eventos = db.relationship('Evento', backref='cliente', lazy='dynamic')
    comercial_preferido = db.relationship('Usuario', foreign_keys=[comercial_preferido_id])

    def to_dict(self):
        return {
            'id': self.id,
            'telefono': self.telefono,
            'nombre': self.nombre,
            'email': self.email,
            'empresa': self.empresa,
            'notas': self.notas,
            'cantidad_eventos': self.eventos.count(),
            'comercial_preferido': self.comercial_preferido.nombre if self.comercial_preferido else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

# Tabla de Eventos (el core del CRM)
class Evento(db.Model):
    __tablename__ = 'eventos'

    id = db.Column(db.Integer, primary_key=True)

    # Relaciones
    cliente_id = db.Column(db.Integer, db.ForeignKey('clientes.id'), nullable=False)
    local_id = db.Column(db.Integer, db.ForeignKey('locales.id'))
    comercial_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'))

    # Datos del evento
    titulo = db.Column(db.String(200))  # "Cumpleaños Juan", "Corporativo Acme"
    fecha_evento = db.Column(db.Date)
    horario_inicio = db.Column(db.Time)
    horario_fin = db.Column(db.Time)
    hora_consulta = db.Column(db.Time)  # Hora en que el cliente hizo la consulta
    cantidad_personas = db.Column(db.Integer)
    tipo = db.Column(db.String(20))  # social, corporativo

    # Estado y seguimiento
    estado = db.Column(db.String(30), default='CONSULTA_ENTRANTE')
    # Estados: CONSULTA_ENTRANTE, ASIGNADO, CONTACTADO, COTIZADO, CONFIRMADO, RECHAZADO, CONCLUIDO

    # Pre-check
    facturada = db.Column(db.Boolean, default=False)  # Para cálculo de IVA 21%

    # Datos comerciales
    presupuesto = db.Column(db.Numeric(12, 2))
    fecha_presupuesto = db.Column(db.Date)
    canal_origen = db.Column(db.String(30))  # web, mail_directo, instagram, whatsapp, telefono, referido

    # Datos del mail original (para trazabilidad)
    mensaje_original = db.Column(db.Text)
    thread_id = db.Column(db.String(100))  # Para vincular con Gmail

    # Prioridad/Alerta (los círculos de colores que viste)
    prioridad = db.Column(db.String(20), default='normal')  # alta, normal, baja

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    actividades = db.relationship('Actividad', backref='evento', lazy='dynamic', order_by='desc(Actividad.created_at)')

    def generar_titulo_auto(self):
        """Genera título automático: PAX 20 — Costa 7070 — Social"""
        partes = []

        if self.cantidad_personas:
            partes.append(f"PAX {self.cantidad_personas}")

        if self.local:
            partes.append(self.local.nombre)

        if self.tipo:
            partes.append(self.tipo.capitalize())

        if partes:
            return ' — '.join(partes)

        # Fallback
        return f"Evento de {self.cliente.nombre if self.cliente else 'cliente'}"

    def to_dict(self):
        return {
            'id': self.id,
            'titulo': self.titulo,  # Título personalizado (puede ser None)
            'titulo_display': self.titulo or self.generar_titulo_auto(),  # Título a mostrar
            'cliente': self.cliente.to_dict() if self.cliente else None,
            'local': {'id': self.local.id, 'nombre': self.local.nombre, 'color': self.local.color} if self.local else None,
            'comercial': self.comercial.to_dict() if self.comercial else None,
            'fecha_evento': self.fecha_evento.isoformat() if self.fecha_evento else None,
            'horario_inicio': self.horario_inicio.isoformat() if self.horario_inicio else None,
            'horario_fin': self.horario_fin.isoformat() if self.horario_fin else None,
            'cantidad_personas': self.cantidad_personas,
            'tipo': self.tipo,
            'estado': self.estado,
            'facturada': self.facturada,
            'presupuesto': float(self.presupuesto) if self.presupuesto else None,
            'fecha_presupuesto': self.fecha_presupuesto.isoformat() if self.fecha_presupuesto else None,
            'canal_origen': self.canal_origen,
            'prioridad': self.prioridad,
            'mensaje_original': self.mensaje_original,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'cantidad_actividades': self.actividades.count(),
            'es_cliente_recurrente': self.cliente.eventos.count() > 1 if self.cliente else False,
            'tiene_precheck': self.precheck_conceptos.count() > 0 or self.precheck_adicionales.count() > 0 if hasattr(self, 'precheck_conceptos') else False
        }

# Tabla de Actividades (historial flexible)
class Actividad(db.Model):
    __tablename__ = 'actividades'

    id = db.Column(db.Integer, primary_key=True)
    evento_id = db.Column(db.Integer, db.ForeignKey('eventos.id'), nullable=False)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'))

    tipo = db.Column(db.String(30), nullable=False)  # nota, llamada, mail, whatsapp, reunion, presupuesto
    contenido = db.Column(db.Text, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'tipo': self.tipo,
            'contenido': self.contenido,
            'usuario': self.usuario.nombre if self.usuario else 'Sistema',
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

# Tabla de Respuestas de Mail (para asignación de comerciales vía N8N)
class RespuestaMail(db.Model):
    __tablename__ = 'respuestas_mails'

    id = db.Column(db.Integer, primary_key=True)
    thread_id = db.Column(db.String(100), nullable=False, index=True)  # Relaciona con eventos.thread_id
    mail = db.Column(db.String(120), nullable=False)  # Email del comercial que respondió
    nombre_comercial = db.Column(db.String(100))  # Nombre del comercial
    mensaje = db.Column(db.Text)  # Contenido del mensaje de respuesta
    fecha_respuesta = db.Column(db.Date)
    hora_respuesta = db.Column(db.Time)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'thread_id': self.thread_id,
            'mail': self.mail,
            'nombre_comercial': self.nombre_comercial,
            'mensaje': self.mensaje,
            'fecha_respuesta': self.fecha_respuesta.isoformat() if self.fecha_respuesta else None,
            'hora_respuesta': self.hora_respuesta.isoformat() if self.hora_respuesta else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
