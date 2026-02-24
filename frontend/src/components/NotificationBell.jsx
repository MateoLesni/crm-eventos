import { useState, useEffect, useRef } from 'react';
import { slaApi } from '../services/api';
import './NotificationBell.css';

const SEEN_KEY = 'crm_sla_seen_ids';

function getSeenIds() {
  try {
    const saved = localStorage.getItem(SEEN_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

function formatearTiempo(segundos) {
  const horas = Math.floor(segundos / 3600);
  const dias = Math.floor(horas / 24);
  if (dias >= 1) return `${dias}d ${horas % 24}h`;
  return `${horas}h`;
}

export default function NotificationBell({ onEventoClick }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState(() => getSeenIds());
  const ref = useRef(null);

  const fetchNotificaciones = async () => {
    try {
      const response = await slaApi.obtenerNotificaciones();
      setData(response.data);
    } catch (error) {
      console.error('Error cargando notificaciones SLA:', error);
    }
  };

  useEffect(() => {
    fetchNotificaciones();
    const interval = setInterval(fetchNotificaciones, 60000);
    return () => clearInterval(interval);
  }, []);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Contar solo los no vistos
  const eventos = data?.eventos || [];
  const unseenCount = eventos.filter(e => !seenIds.has(e.id)).length;

  const handleOpen = () => {
    if (!open && eventos.length > 0) {
      // Marcar todos los actuales como vistos
      const newSeen = new Set(seenIds);
      eventos.forEach(e => newSeen.add(e.id));
      setSeenIds(newSeen);
      saveSeenIds(newSeen);
    }
    setOpen(!open);
  };

  const handleEventoItemClick = (eventoId) => {
    setOpen(false);
    if (onEventoClick) onEventoClick(eventoId);
  };

  return (
    <div className="notification-bell" ref={ref}>
      <button
        className={`btn-icon${unseenCount > 0 ? ' has-notifications' : ''}`}
        title="Alertas SLA"
        onClick={handleOpen}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unseenCount > 0 && (
          <span className="notification-badge">{unseenCount > 99 ? '99+' : unseenCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <span className="notification-title">Alertas SLA</span>
            {eventos.length > 0 && (
              <div className="notification-summary">
                {data.total_criticos > 0 && (
                  <span className="summary-chip critico">
                    {data.total_criticos} critico{data.total_criticos !== 1 ? 's' : ''}
                  </span>
                )}
                {data.total_alertas > 0 && (
                  <span className="summary-chip alerta">
                    {data.total_alertas} alerta{data.total_alertas !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="notification-list">
            {eventos.length === 0 ? (
              <div className="notification-empty">Sin alertas activas</div>
            ) : (
              eventos.map((evento) => (
                <div
                  key={evento.id}
                  className={`notification-item ${evento.sla_status}`}
                  onClick={() => handleEventoItemClick(evento.id)}
                >
                  <div className="notification-item-content">
                    <span className="notification-item-title">
                      {evento.titulo_display || `Evento #${evento.id}`}
                    </span>
                    <span className="notification-item-meta">
                      {evento.cliente_nombre || 'Sin cliente'}
                      {evento.comercial_nombre && ` · ${evento.comercial_nombre}`}
                    </span>
                  </div>
                  <div className="notification-item-right">
                    <span className={`notification-item-time ${evento.sla_status}`}>
                      {formatearTiempo(evento.segundos)}
                    </span>
                    <span className="notification-item-estado">{evento.estado.replace('_', ' ')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
