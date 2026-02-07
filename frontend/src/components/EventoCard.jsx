import './EventoCard.css';

// Colores de prioridad (los círculos a la derecha)
const PRIORIDAD_INDICADOR = {
  alta: '#ef4444',    // Rojo
  media: '#f59e0b',   // Amarillo
  normal: '#22c55e',  // Verde
  baja: '#6b7280',    // Gris
};

// Avatares de colores para comerciales
const AVATAR_COLORS = [
  '#f59e0b', // Amarillo
  '#22c55e', // Verde
  '#3b82f6', // Azul
  '#8b5cf6', // Violeta
  '#ec4899', // Rosa
];

// Genera título automático: "PAX 20 — Costa 7070 — Social"
function generarTituloAuto(evento) {
  const partes = [];

  if (evento.cantidad_personas) {
    partes.push(`PAX ${evento.cantidad_personas}`);
  }

  if (evento.local?.nombre) {
    partes.push(evento.local.nombre);
  }

  if (evento.tipo) {
    partes.push(evento.tipo.charAt(0).toUpperCase() + evento.tipo.slice(1));
  }

  if (partes.length > 0) {
    return partes.join(' — ');
  }

  // Fallback si no hay datos
  return `Evento de ${evento.cliente?.nombre || 'cliente'}`;
}

export default function EventoCard({ evento, isDragging, onClick }) {
  const prioridadColor = PRIORIDAD_INDICADOR[evento.prioridad] || PRIORIDAD_INDICADOR.normal;

  // Color del avatar basado en el ID del comercial
  const avatarColor = evento.comercial
    ? AVATAR_COLORS[(evento.comercial.id - 1) % AVATAR_COLORS.length]
    : '#9ca3af';

  // Título: usa titulo_display del backend, o genera localmente como fallback
  const titulo = evento.titulo_display || evento.titulo || generarTituloAuto(evento);

  return (
    <div
      className={`evento-card ${isDragging ? 'dragging' : ''}`}
      onClick={onClick}
    >
      <div className="card-content">
        <div className="card-main">
          <h4 className="card-titulo">
            {titulo}
          </h4>
          <p className="card-cliente">
            {evento.cliente?.nombre || 'Sin cliente'}
          </p>
        </div>

        <div className="card-right">
          <span
            className="prioridad-indicator"
            style={{ backgroundColor: prioridadColor }}
            title={`Prioridad ${evento.prioridad || 'normal'}`}
          />
        </div>
      </div>

      <div className="card-footer">
        <div className="card-avatar" style={{ backgroundColor: avatarColor }}>
          {evento.comercial?.nombre?.charAt(0) || '?'}
        </div>
        <span className="card-monto">
          ${evento.presupuesto ? evento.presupuesto.toLocaleString() : '0'}
        </span>
        <button className="card-arrow" onClick={(e) => { e.stopPropagation(); onClick(); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
