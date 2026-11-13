import { useEffect, useMemo, useState } from 'react';
import { metricasApi } from '../services/api';
import EventoModal from '../components/EventoModal';
import {
  ESTADO_NOMBRE, FILTROS_INICIALES, LOCALES, PAX_PRESETS, SIN_LOCAL, TRAMOS,
  aplicarFiltros, calidadDatos, cohortes, diasSinMovimiento, esValido, etiquetaPeriodo, fmtDias, fmtFecha,
  fmtHoras, fmtNum, fmtPct, fmtPesos, fmtPesosCorto, leadsPorLocal, localDe, motivos, pipelinePorAntiguedad,
  primeraRespuesta, rendimientoPor, resumen, sumaMonto,
} from './metricasCalculos';
import './Metricas.css';

const colorLocal = (local) => {
  const i = LOCALES.indexOf(local);
  return i >= 0 ? `var(--serie-${i + 1})` : 'var(--serie-gris)';
};

// ---------- Piezas chicas ----------

function Numero({ valor, onAbrir, titulo, className = '' }) {
  if (!onAbrir) return <span className={className}>{valor}</span>;
  return (
    <button type="button" className={`numero-abrible ${className}`} onClick={onAbrir} title={titulo || 'Ver los eventos que forman este número'}>
      {valor}
    </button>
  );
}

function Kpi({ titulo, valor, detalle, definicion, onAbrir, destacado }) {
  return (
    <div className={`kpi ${destacado ? 'kpi-destacado' : ''}`}>
      <div className="kpi-titulo">{titulo}</div>
      <Numero valor={valor} onAbrir={onAbrir} className="kpi-valor" />
      {detalle && <div className="kpi-detalle">{detalle}</div>}
      {definicion && <div className="kpi-definicion">{definicion}</div>}
    </div>
  );
}

function Seccion({ titulo, bajada, acciones, children }) {
  return (
    <section className="met-seccion">
      <header className="met-seccion-header">
        <div>
          <h2>{titulo}</h2>
          {bajada && <p className="met-bajada">{bajada}</p>}
        </div>
        {acciones && <div className="met-seccion-acciones">{acciones}</div>}
      </header>
      {children}
    </section>
  );
}

function Selector({ opciones, valor, onCambio }) {
  return (
    <div className="met-selector" role="tablist">
      {opciones.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={valor === o.id}
          className={valor === o.id ? 'activo' : ''} onClick={() => onCambio(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Lista de respaldo: lo que hay detrás de cada número ----------

function descargarCsv(nombre, lista, columnaExtra) {
  const enc = ['ID', 'Cliente', 'Local', 'Comercial', 'Estado', 'Creado', 'Fecha evento', 'PAX', 'Monto', ...(columnaExtra ? [columnaExtra.titulo] : [])];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const filas = lista.map((e) => [e.id, e.cliente, e.local || '', e.comercial || '', ESTADO_NOMBRE[e.estado] || e.estado,
    (e.creado || '').slice(0, 10), e.fecha_evento || '', e.pax ?? '', e.monto || 0,
    ...(columnaExtra ? [columnaExtra.valor(e)] : [])].map(esc).join(','));
  const blob = new Blob(['﻿' + [enc.join(','), ...filas].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ListaRespaldo({ detalle, onCerrar, onAbrirEvento }) {
  const [orden, setOrden] = useState({ campo: 'id', dir: 'desc' });
  const { titulo, definicion, lista, columnaExtra } = detalle;
  const ordenada = useMemo(() => {
    const v = (e) => (orden.campo === 'extra' ? columnaExtra?.orden?.(e) ?? columnaExtra?.valor(e) : e[orden.campo]) ?? '';
    return [...lista].sort((a, b) => (v(a) > v(b) ? 1 : v(a) < v(b) ? -1 : 0) * (orden.dir === 'asc' ? 1 : -1));
  }, [lista, orden, columnaExtra]);

  const th = (campo, label, clase = '') => (
    <th className={clase}>
      <button type="button" onClick={() => setOrden({ campo, dir: orden.campo === campo && orden.dir === 'desc' ? 'asc' : 'desc' })}>
        {label}{orden.campo === campo ? (orden.dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );

  return (
    <div className="respaldo-overlay" onClick={onCerrar}>
      <aside className="respaldo" onClick={(e) => e.stopPropagation()} aria-label={titulo}>
        <header className="respaldo-header">
          <div>
            <h3>{titulo}</h3>
            {definicion && <p className="respaldo-definicion">{definicion}</p>}
            <p className="respaldo-totales">
              {fmtNum(lista.length)} eventos · {fmtPesos(sumaMonto(lista))} cotizados
            </p>
          </div>
          <div className="respaldo-acciones">
            <button type="button" className="met-btn" onClick={() => descargarCsv(titulo, ordenada, columnaExtra)}>Descargar CSV</button>
            <button type="button" className="met-btn-cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
          </div>
        </header>
        <div className="respaldo-tabla-wrap">
          <table className="met-tabla respaldo-tabla">
            <thead>
              <tr>
                {th('id', 'ID')}
                {th('cliente', 'Cliente')}
                {th('local', 'Local')}
                {th('comercial', 'Comercial')}
                {th('estado', 'Estado')}
                {th('creado', 'Creado')}
                {th('fecha_evento', 'Evento')}
                {th('monto', 'Monto', 'num')}
                {columnaExtra && th('extra', columnaExtra.titulo)}
              </tr>
            </thead>
            <tbody>
              {ordenada.slice(0, 500).map((e) => (
                <tr key={e.id} onClick={() => onAbrirEvento(e.id)} title="Abrir la ficha del evento">
                  <td className="mono">#{e.id}</td>
                  <td>{e.cliente || '—'}{e.migrado && <span className="marca-migrado" title="Migrado del CRM anterior">M</span>}</td>
                  <td>{e.local || <span className="tenue">Sin local</span>}</td>
                  <td>{e.comercial || <span className="tenue">Sin asignar</span>}</td>
                  <td><span className={`estado-pill estado-${e.estado.toLowerCase()}`}>{ESTADO_NOMBRE[e.estado] || e.estado}</span></td>
                  <td>{fmtFecha(e.creado)}</td>
                  <td>{fmtFecha(e.fecha_evento)}</td>
                  <td className="num">{e.monto ? fmtPesos(e.monto) : <span className="tenue">—</span>}</td>
                  {columnaExtra && <td className="extra">{columnaExtra.valor(e)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {ordenada.length > 500 && (
            <p className="respaldo-nota">Se muestran 500 de {fmtNum(ordenada.length)}. El CSV trae todos.</p>
          )}
          {ordenada.length === 0 && <p className="respaldo-nota">No hay eventos en este grupo.</p>}
        </div>
      </aside>
    </div>
  );
}

// ---------- Gráfico de columnas apiladas (leads por local en el tiempo) ----------

function ColumnasApiladas({ datos, locales, agrupacion, onAbrir }) {
  const [hover, setHover] = useState(null);
  const filas = agrupacion === 'dia' ? datos.slice(-60) : datos;
  const maximo = Math.max(1, ...filas.map((f) => f.total.length));
  const ancho = 900;
  const alto = 260;
  const margen = { izq: 36, der: 8, arriba: 10, abajo: 28 };
  const anchoUtil = ancho - margen.izq - margen.der;
  const altoUtil = alto - margen.arriba - margen.abajo;
  const paso = anchoUtil / Math.max(filas.length, 1);
  const barra = Math.max(2, Math.min(36, paso * 0.7));
  const escala = (v) => (v / maximo) * altoUtil;
  const ticks = [0, Math.round(maximo / 2), maximo];
  const cadaEtiqueta = Math.ceil(filas.length / 14);

  return (
    <div className="grafico-wrap">
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="grafico" role="img" aria-label="Leads por local en el tiempo">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={margen.izq} x2={ancho - margen.der} y1={margen.arriba + altoUtil - escala(t)} y2={margen.arriba + altoUtil - escala(t)} className="grid" />
            <text x={margen.izq - 6} y={margen.arriba + altoUtil - escala(t) + 4} className="eje" textAnchor="end">{fmtNum(t)}</text>
          </g>
        ))}
        {filas.map((f, i) => {
          const x = margen.izq + i * paso + (paso - barra) / 2;
          let y = margen.arriba + altoUtil;
          return (
            <g key={f.clave} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              onClick={() => onAbrir(`Leads creados en ${etiquetaPeriodo(f.clave, agrupacion)}`, f.total)} className="columna">
              <rect x={margen.izq + i * paso} y={margen.arriba} width={paso} height={altoUtil} className="hit" />
              {locales.map((local) => {
                const n = (f.celdas[local] || []).length;
                if (!n) return null;
                const h = escala(n);
                y -= h;
                return <rect key={local} x={x} y={y + 1} width={barra} height={Math.max(h - 2, 1)} rx={2} fill={colorLocal(local)} />;
              })}
              {i % cadaEtiqueta === 0 && (
                <text x={x + barra / 2} y={alto - 8} className="eje" textAnchor="middle">{etiquetaPeriodo(f.clave, agrupacion)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && filas[hover] && (
        <div className="tooltip" style={{ left: `${Math.min(80, ((hover + 0.5) / filas.length) * 100)}%` }}>
          <strong>{etiquetaPeriodo(filas[hover].clave, agrupacion)} · {fmtNum(filas[hover].total.length)} leads</strong>
          {locales.filter((l) => filas[hover].celdas[l]).map((l) => (
            <div key={l} className="tooltip-fila">
              <span className="punto" style={{ background: colorLocal(l) }} />{l}<span className="tooltip-num">{fmtNum(filas[hover].celdas[l].length)}</span>
            </div>
          ))}
          <div className="tooltip-ayuda">Clic para ver los eventos</div>
        </div>
      )}
      <div className="leyenda">
        {locales.map((l) => (
          <span key={l}><span className="punto" style={{ background: colorLocal(l) }} />{l}</span>
        ))}
      </div>
      {agrupacion === 'dia' && datos.length > 60 && <p className="met-nota">El gráfico muestra los últimos 60 días; la tabla tiene todo el período.</p>}
    </div>
  );
}

// ---------- Página ----------

export default function Metricas() {
  const [datos, setDatos] = useState(null);
  const [generado, setGenerado] = useState(null);
  const [error, setError] = useState(null);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [agrupacion, setAgrupacion] = useState('mes');
  const [vistaLeads, setVistaLeads] = useState('grafico');
  const [vistaRendimiento, setVistaRendimiento] = useState('comercial');
  const [detalle, setDetalle] = useState(null);
  const [eventoAbierto, setEventoAbierto] = useState(null);

  const cargar = () => metricasApi.dataset()
    .then((res) => {
      setError(null);
      setDatos(res.data.eventos);
      setGenerado(res.data.generado);
    })
    .catch((e) => setError(e.response?.data?.error || 'No se pudieron cargar las métricas.'));

  useEffect(() => { cargar(); }, []);

  const ahora = useMemo(() => (generado ? new Date(generado) : new Date()), [generado]);
  const hoy = useMemo(() => ahora.toISOString().slice(0, 10), [ahora]);

  const filtrados = useMemo(() => (datos ? aplicarFiltros(datos, filtros) : []), [datos, filtros]);
  const r = useMemo(() => resumen(filtrados), [filtrados]);
  const porPeriodo = useMemo(() => leadsPorLocal(filtrados, agrupacion), [filtrados, agrupacion]);
  const porComercial = useMemo(() => rendimientoPor(filtrados.filter(esValido), (e) => e.comercial_id || 0,
    (k, lista) => (k ? lista[0].comercial : 'Sin asignar')), [filtrados]);
  const porLocal = useMemo(() => rendimientoPor(filtrados.filter(esValido), localDe, (k) => k), [filtrados]);
  const listaCohortes = useMemo(() => cohortes(filtrados), [filtrados]);
  const listaMotivos = useMemo(() => motivos(filtrados), [filtrados]);
  const pipeline = useMemo(() => pipelinePorAntiguedad(filtrados, ahora), [filtrados, ahora]);
  const calidad = useMemo(() => calidadDatos(filtrados, hoy), [filtrados, hoy]);

  // Últimos 30 días: no depende de los filtros (igual que en el tablero original)
  const ultimos30 = useMemo(() => {
    if (!datos) return [];
    const desde = new Date(ahora.getTime() - 30 * 864e5).toISOString().slice(0, 10);
    const recientes = datos.filter((e) => (e.creado || '').slice(0, 10) >= desde);
    const grupos = new Map();
    for (const e of recientes) {
      const k = localDe(e);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(e);
    }
    return [...grupos.entries()].map(([local, lista]) => ({ local, lista })).sort((a, b) => b.lista.length - a.lista.length);
  }, [datos, ahora]);

  const comerciales = useMemo(() => {
    if (!datos) return [];
    const m = new Map();
    datos.forEach((e) => e.comercial_id && m.set(e.comercial_id, e.comercial));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [datos]);

  const abrir = (titulo, lista, definicion, columnaExtra) => setDetalle({ titulo, lista, definicion, columnaExtra });
  const columnaDias = { titulo: 'Días sin movimiento', valor: (e) => diasSinMovimiento(e, ahora), orden: (e) => diasSinMovimiento(e, ahora) };
  const pipelineActivo = r.abiertos.filter((e) => diasSinMovimiento(e, ahora) <= 30);
  const pipelineFrio = r.abiertos.filter((e) => diasSinMovimiento(e, ahora) > 30);
  const filtrosActivos = JSON.stringify(filtros) !== JSON.stringify(FILTROS_INICIALES);
  const set = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value });

  if (error) {
    return (
      <div className="met-pagina">
        <div className="met-error">{error} <button type="button" className="met-btn" onClick={cargar}>Reintentar</button></div>
      </div>
    );
  }
  if (!datos) return <div className="met-pagina"><div className="met-cargando">Calculando métricas…</div></div>;

  const maxUltimos30 = Math.max(1, ...ultimos30.map((u) => u.lista.length));
  const maxMotivo = Math.max(1, ...listaMotivos.filas.map((m) => m.lista.length));

  return (
    <div className="met-pagina">
      <div className="met-aviso">
        <strong>Los montos son el presupuesto cotizado cargado en el CRM.</strong>{' '}
        La facturación final (con los agregados del pre-check) todavía vive en la planilla de ventas y se va a sumar con la sincronización.
        Datos al {fmtFecha(generado)} {generado?.slice(11, 16)} hs.
        <button type="button" className="met-link" onClick={cargar}>Actualizar</button>
      </div>

      {/* Filtros */}
      <div className="met-filtros">
        <label>Creado desde<input type="date" value={filtros.creadoDesde} onChange={set('creadoDesde')} /></label>
        <label>Creado hasta<input type="date" value={filtros.creadoHasta} onChange={set('creadoHasta')} /></label>
        <label>Evento desde<input type="date" value={filtros.eventoDesde} onChange={set('eventoDesde')} /></label>
        <label>Evento hasta<input type="date" value={filtros.eventoHasta} onChange={set('eventoHasta')} /></label>
        <label>Local
          <select value={filtros.local} onChange={set('local')}>
            <option value="">Todos</option>
            {LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
            <option value={SIN_LOCAL}>Sin local</option>
          </select>
        </label>
        <label>Comercial
          <select value={filtros.comercial} onChange={set('comercial')}>
            <option value="">Todos</option>
            {comerciales.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            <option value="sin">Sin asignar</option>
          </select>
        </label>
        <label>PAX
          <select value={filtros.pax} onChange={set('pax')}>
            {PAX_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label>Origen
          <select value={filtros.origen} onChange={set('origen')}>
            <option value="todos">Todos</option>
            <option value="crm">Cargados en el CRM</option>
            <option value="migrados">Migrados (18/02)</option>
          </select>
        </label>
        {filtrosActivos && <button type="button" className="met-link" onClick={() => setFiltros(FILTROS_INICIALES)}>Limpiar filtros</button>}
      </div>

      {/* Resumen */}
      <Seccion titulo="Resumen" bajada="Cada número se abre: hacé clic para ver los eventos que lo forman.">
        <div className="kpis">
          <Kpi titulo="Leads recibidos" valor={fmtNum(r.leads.length)}
            definicion="Todos los eventos del período, en cualquier estado."
            onAbrir={() => abrir('Leads recibidos', r.leads, 'Todos los eventos del período, en cualquier estado.')} />
          <Kpi titulo="Leads válidos" valor={fmtNum(r.validos.length)}
            detalle={<>
              <Numero valor={`${fmtNum(r.multireserva.length)} multireserva`} onAbrir={() => abrir('Multireserva / spam', r.multireserva, 'Estado Multireserva: no cuentan como leads comerciales.')} />
              {' · '}
              <Numero valor={`${fmtNum(r.eliminados.length)} eliminados`} onAbrir={() => abrir('Eliminados', r.eliminados, 'Eventos en la papelera.')} />
            </>}
            definicion="Leads recibidos menos multireserva y eliminados."
            onAbrir={() => abrir('Leads válidos', r.validos, 'Leads recibidos menos multireserva y eliminados.')} />
          <Kpi titulo="Vendidos" valor={fmtNum(r.vendidos.length)} destacado
            detalle={<>
              <Numero valor={`${fmtNum(r.aprobados.length)} aprobados`} onAbrir={() => abrir('Aprobados', r.aprobados, 'Estado Aprobado.')} />
              {' · '}
              <Numero valor={`${fmtNum(r.concluidos.length)} concluidos`} onAbrir={() => abrir('Concluidos', r.concluidos, 'Estado Concluido: el evento ya se realizó.')} />
            </>}
            definicion="Aprobados + concluidos."
            onAbrir={() => abrir('Vendidos', r.vendidos, 'Aprobados + concluidos.')} />
          <Kpi titulo="Conversión CRM" valor={fmtPct(r.conversion)}
            detalle={`${fmtNum(r.vendidos.length)} de ${fmtNum(r.validos.length)} válidos`}
            definicion="Vendidos ÷ leads válidos. Incluye leads todavía abiertos, así que los meses recientes salen más bajos."
            onAbrir={() => abrir('Conversión CRM: vendidos', r.vendidos, 'Numerador de la conversión. El denominador son los leads válidos.')} />
          <Kpi titulo="Tasa de cierre" valor={fmtPct(r.tasaCierre)} destacado
            detalle={`${fmtNum(r.vendidos.length)} ganados de ${fmtNum(r.decididos.length)} decididos`}
            definicion="Vendidos ÷ (vendidos + rechazados). Solo cuenta leads que ya se definieron: es la efectividad real del equipo."
            onAbrir={() => abrir('Leads decididos (ganados y perdidos)', r.decididos, 'Base de la tasa de cierre: vendidos + rechazados.')} />
          <Kpi titulo="Monto vendido" valor={fmtPesosCorto(r.montoVendido)} destacado
            detalle={<>
              <Numero valor={`${fmtPesosCorto(r.montoAprobados)} aprobados`} onAbrir={() => abrir('Monto de aprobados', r.aprobados)} />
              {' · '}
              <Numero valor={`${fmtPesosCorto(r.montoConcluidos)} concluidos`} onAbrir={() => abrir('Monto de concluidos', r.concluidos)} />
            </>}
            definicion="Suma del presupuesto cotizado de los vendidos."
            onAbrir={() => abrir('Monto vendido', r.vendidos, 'Suma del presupuesto cotizado de los vendidos.')} />
          <Kpi titulo="Ticket promedio" valor={fmtPesosCorto(r.ticket)}
            detalle={`sobre ${fmtNum(r.vendidosConMonto.length)} vendidos con monto`}
            definicion="Monto vendido ÷ vendidos que tienen monto cargado (los que no tienen monto no lo bajan)."
            onAbrir={() => abrir('Vendidos con monto cargado', r.vendidosConMonto)} />
          <Kpi titulo="Pipeline activo" valor={fmtPesosCorto(sumaMonto(pipelineActivo))}
            detalle={<>
              {fmtNum(pipelineActivo.length)} leads con movimiento en 30 días ·{' '}
              <Numero valor={`${fmtPesosCorto(sumaMonto(pipelineFrio))} frío`} onAbrir={() => abrir('Pipeline frío', pipelineFrio,
                'Leads abiertos que hace más de 30 días no cambian de estado: probablemente perdidos sin cerrar.', columnaDias)} />
            </>}
            definicion="Presupuesto cotizado de lo abierto que se movió en los últimos 30 días. Lo frío se separa porque casi nunca se convierte."
            onAbrir={() => abrir('Pipeline activo', pipelineActivo, 'Abiertos con cambio de estado en los últimos 30 días.', columnaDias)} />
        </div>
      </Seccion>

      {/* Leads por local */}
      <Seccion titulo="Leads por local"
        bajada={filtros.origen !== 'crm' && porPeriodo.filas.some((f) => f.clave.startsWith('2026-02'))
          ? 'Por fecha de creación. Ojo: febrero 2026 incluye 1.254 eventos migrados del CRM anterior el 18/02 (su fecha de creación no es la de la consulta). Filtrá por Origen para excluirlos.'
          : 'Por fecha de creación del lead.'}
        acciones={<>
          <Selector valor={agrupacion} onCambio={setAgrupacion}
            opciones={[{ id: 'mes', label: 'Mes' }, { id: 'semana', label: 'Semana' }, { id: 'dia', label: 'Día' }]} />
          <Selector valor={vistaLeads} onCambio={setVistaLeads}
            opciones={[{ id: 'grafico', label: 'Gráfico' }, { id: 'tabla', label: 'Tabla' }]} />
        </>}>
        {porPeriodo.filas.length === 0 ? <p className="met-vacio">No hay leads para los filtros elegidos.</p>
          : vistaLeads === 'grafico' ? (
            <ColumnasApiladas datos={porPeriodo.filas} locales={porPeriodo.locales} agrupacion={agrupacion}
              onAbrir={(t, l) => abrir(t, l)} />
          ) : (
            <div className="tabla-scroll">
              <table className="met-tabla">
                <thead>
                  <tr>
                    <th>Período</th>
                    {porPeriodo.locales.map((l) => <th key={l} className="num"><span className="punto" style={{ background: colorLocal(l) }} />{l}</th>)}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...porPeriodo.filas].reverse().map((f) => (
                    <tr key={f.clave}>
                      <td>{etiquetaPeriodo(f.clave, agrupacion)}</td>
                      {porPeriodo.locales.map((l) => (
                        <td key={l} className="num">
                          {f.celdas[l] ? <Numero valor={fmtNum(f.celdas[l].length)} onAbrir={() => abrir(`${l} · ${etiquetaPeriodo(f.clave, agrupacion)}`, f.celdas[l])} /> : <span className="tenue">0</span>}
                        </td>
                      ))}
                      <td className="num fuerte"><Numero valor={fmtNum(f.total.length)} onAbrir={() => abrir(`Total · ${etiquetaPeriodo(f.clave, agrupacion)}`, f.total)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Seccion>

      <div className="met-dos-columnas">
        {/* Últimos 30 días */}
        <Seccion titulo="Últimos 30 días" bajada="Leads creados por local. No depende de los filtros de arriba.">
          {ultimos30.length === 0 ? <p className="met-vacio">Sin leads en los últimos 30 días.</p> : (
            <div className="barras-h">
              {ultimos30.map((u) => (
                <button key={u.local} type="button" className="barra-h" onClick={() => abrir(`${u.local} · últimos 30 días`, u.lista)}>
                  <span className="barra-h-label">{u.local}</span>
                  <span className="barra-h-pista"><span className="barra-h-relleno" style={{ width: `${(u.lista.length / maxUltimos30) * 100}%`, background: colorLocal(u.local) }} /></span>
                  <span className="barra-h-valor">{fmtNum(u.lista.length)}</span>
                </button>
              ))}
            </div>
          )}
        </Seccion>

        {/* Motivos de pérdida */}
        <Seccion titulo="Por qué se pierden"
          bajada={`${fmtNum(listaMotivos.total)} rechazados, agrupados por tema a partir del motivo que escribió la comercial. "Otro" son textos que no encajan en ningún tema: abrilo para leerlos.`}>
          <div className="barras-h">
            {listaMotivos.filas.map((m) => (
              <button key={m.nombre} type="button" className="barra-h" onClick={() => abrir(`Rechazados · ${m.nombre}`, m.lista,
                'El texto original de cada motivo está en la última columna.', { titulo: 'Motivo escrito', valor: (e) => e.motivo || '—' })}>
                <span className="barra-h-label">{m.nombre}</span>
                <span className="barra-h-pista"><span className="barra-h-relleno perdida" style={{ width: `${(m.lista.length / maxMotivo) * 100}%` }} /></span>
                <span className="barra-h-valor">{fmtNum(m.lista.length)} <span className="tenue">· {fmtPct((m.lista.length / Math.max(listaMotivos.total, 1)) * 100)}</span></span>
              </button>
            ))}
          </div>
        </Seccion>
      </div>

      {/* Rendimiento */}
      <Seccion titulo="Rendimiento"
        bajada="Sobre leads válidos. Velocidad medida solo con leads cargados en el CRM (los migrados no tienen historial real). Con menos de 10 leads decididos la tasa de cierre es poco confiable y se muestra atenuada."
        acciones={<Selector valor={vistaRendimiento} onCambio={setVistaRendimiento}
          opciones={[{ id: 'comercial', label: 'Por comercial' }, { id: 'local', label: 'Por local' }]} />}>
        <div className="tabla-scroll">
          <table className="met-tabla">
            <thead>
              <tr>
                <th>{vistaRendimiento === 'comercial' ? 'Comercial' : 'Local'}</th>
                <th className="num">Leads</th>
                <th className="num">Vendidos</th>
                <th className="num">Perdidos</th>
                <th className="num">Abiertos</th>
                <th className="num">Conversión</th>
                <th className="num">Tasa de cierre</th>
                <th className="num">Monto vendido</th>
                <th className="num">Ticket prom.</th>
                <th className="num" title="Mediana desde que entra el lead hasta que pasa a contactado o cotizado">1ª respuesta</th>
                <th className="num" title="Mediana desde que entra el lead hasta que se aprueba">Hasta venta</th>
              </tr>
            </thead>
            <tbody>
              {(vistaRendimiento === 'comercial' ? porComercial : porLocal).map((g) => {
                const pocos = g.decididos.length < 10;
                return (
                  <tr key={g.clave}>
                    <td className="fuerte">{vistaRendimiento === 'local' && <span className="punto" style={{ background: colorLocal(g.nombre) }} />}{g.nombre}</td>
                    <td className="num"><Numero valor={fmtNum(g.validos.length)} onAbrir={() => abrir(`${g.nombre} · leads válidos`, g.validos)} /></td>
                    <td className="num"><Numero valor={fmtNum(g.vendidos.length)} onAbrir={() => abrir(`${g.nombre} · vendidos`, g.vendidos)} /></td>
                    <td className="num"><Numero valor={fmtNum(g.rechazados.length)} onAbrir={() => abrir(`${g.nombre} · perdidos`, g.rechazados, null, { titulo: 'Motivo', valor: (e) => e.motivo || '—' })} /></td>
                    <td className="num"><Numero valor={fmtNum(g.abiertos.length)} onAbrir={() => abrir(`${g.nombre} · abiertos`, g.abiertos, null, { titulo: 'Días sin movimiento', valor: (e) => diasSinMovimiento(e, ahora), orden: (e) => diasSinMovimiento(e, ahora) })} /></td>
                    <td className="num">{fmtPct(g.conversion)}</td>
                    <td className={`num ${pocos ? 'tenue' : 'fuerte'}`} title={pocos ? `Solo ${g.decididos.length} decididos: muestra chica` : undefined}>{fmtPct(g.tasaCierre)}</td>
                    <td className="num">{fmtPesosCorto(g.montoVendido)}</td>
                    <td className="num">{fmtPesosCorto(g.ticket)}</td>
                    <td className="num">
                      <Numero valor={<>{fmtHoras(g.horasRespuesta)}{g.respuestaMedibles.length > 0 && <span className="sub-monto">n = {fmtNum(g.respuestaMedibles.length)}</span>}</>} onAbrir={g.respuestaMedibles.length ? () => abrir(`${g.nombre} · tiempo a primera respuesta`, g.respuestaMedibles,
                        'Desde que entró el lead hasta que pasó a contactado o cotizado. La cifra de la tabla es la mediana.',
                        { titulo: 'Tiempo', valor: (e) => fmtHoras((new Date(primeraRespuesta(e)) - new Date(e.creado)) / 36e5), orden: (e) => new Date(primeraRespuesta(e)) - new Date(e.creado) }) : null} />
                    </td>
                    <td className="num">
                      <Numero valor={<>{fmtDias(g.diasVenta)}{g.ventasMedibles.length > 0 && <span className={`sub-monto ${g.ventasMedibles.length < 5 ? 'muestra-chica' : ''}`}>n = {fmtNum(g.ventasMedibles.length)}</span>}</>} onAbrir={g.ventasMedibles.length ? () => abrir(`${g.nombre} · tiempo hasta la venta`, g.ventasMedibles,
                        'Desde que entró el lead hasta que se aprobó. La cifra de la tabla es la mediana.',
                        { titulo: 'Días', valor: (e) => fmtDias((new Date(e.t_vendido) - new Date(e.creado)) / 864e5), orden: (e) => new Date(e.t_vendido) - new Date(e.creado) }) : null} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Seccion>

      {/* Cohortes */}
      <Seccion titulo="Qué pasó con lo que entró cada mes"
        bajada="Leads válidos agrupados por mes de creación. Muestra cuánto se ganó, se perdió y sigue abierto: los meses recientes tienen más abiertos porque todavía se están trabajando.">
        <div className="cohortes">
          <div className="cohorte-leyenda">
            <span><span className="punto" style={{ background: 'var(--est-ganado)' }} />Vendido</span>
            <span><span className="punto" style={{ background: 'var(--est-perdido)' }} />Perdido</span>
            <span><span className="punto" style={{ background: 'var(--est-abierto)' }} />Abierto</span>
          </div>
          {listaCohortes.map((c) => {
            const n = c.lista.length;
            const seg = (lista, clase, nombre) => lista.length > 0 && (
              <button type="button" className={`cohorte-seg ${clase}`} style={{ width: `${(lista.length / n) * 100}%` }}
                onClick={() => abrir(`${etiquetaPeriodo(c.mes, 'mes')} · ${nombre}`, lista)} title={`${nombre}: ${lista.length}`}>
                {lista.length / n >= 0.08 ? fmtPct((lista.length / n) * 100) : ''}
              </button>
            );
            return (
              <div key={c.mes} className="cohorte-fila">
                <span className="cohorte-mes">{etiquetaPeriodo(c.mes, 'mes')}{c.migrados > n / 2 && <span className="marca-migrado" title="Mayoría migrados del CRM anterior">M</span>}</span>
                <span className="cohorte-n"><Numero valor={fmtNum(n)} onAbrir={() => abrir(`${etiquetaPeriodo(c.mes, 'mes')} · leads válidos`, c.lista)} /></span>
                <span className="cohorte-barra">
                  {seg(c.vendidos, 'ganado', 'vendidos')}
                  {seg(c.rechazados, 'perdido', 'perdidos')}
                  {seg(c.abiertos, 'abierto', 'abiertos')}
                </span>
              </div>
            );
          })}
        </div>
      </Seccion>

      {/* Pipeline estancado */}
      <Seccion titulo="Pipeline que pide atención"
        bajada="Leads abiertos según cuánto hace que no cambian de estado. Lo de más de 30 días probablemente esté frío o mal cerrado.">
        <div className="tabla-scroll">
          <table className="met-tabla">
            <thead>
              <tr>
                <th>Etapa</th>
                {TRAMOS.map((t) => <th key={t.id} className="num">{t.label}</th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.map((p) => (
                <tr key={p.estado}>
                  <td className="fuerte">{ESTADO_NOMBRE[p.estado]}</td>
                  {p.tramos.map((t) => (
                    <td key={t.id} className={`num ${t.id === '30+' && t.lista.length ? 'alerta' : ''}`}>
                      {t.lista.length ? (
                        <Numero valor={<>{fmtNum(t.lista.length)}<span className="sub-monto">{sumaMonto(t.lista) ? fmtPesosCorto(sumaMonto(t.lista)) : ''}</span></>}
                          onAbrir={() => abrir(`${ESTADO_NOMBRE[p.estado]} · ${t.label} sin movimiento`, t.lista, null,
                            { titulo: 'Días sin movimiento', valor: (e) => diasSinMovimiento(e, ahora), orden: (e) => diasSinMovimiento(e, ahora) })} />
                      ) : <span className="tenue">0</span>}
                    </td>
                  ))}
                  <td className="num fuerte"><Numero valor={fmtNum(p.lista.length)} onAbrir={() => abrir(`${ESTADO_NOMBRE[p.estado]} · todos`, p.lista)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      {/* Calidad de datos */}
      <Seccion titulo="Calidad de los datos"
        bajada="Lo que hace que algún número de arriba sea menos confiable. Corregirlo en el CRM mejora todas las métricas.">
        <div className="calidad">
          {calidad.map((c) => (
            <button key={c.id} type="button" className={`calidad-item ${c.lista.length ? '' : 'ok'}`}
              onClick={() => abrir(c.titulo, c.lista, c.ayuda)} disabled={!c.lista.length}>
              <span className="calidad-num">{fmtNum(c.lista.length)}</span>
              <span className="calidad-titulo">{c.titulo}</span>
              <span className="calidad-ayuda">{c.ayuda}</span>
            </button>
          ))}
        </div>
      </Seccion>

      {detalle && <ListaRespaldo detalle={detalle} onCerrar={() => setDetalle(null)} onAbrirEvento={(id) => setEventoAbierto(id)} />}
      {eventoAbierto && (
        <EventoModal evento={{ id: eventoAbierto }} onClose={() => setEventoAbierto(null)}
          onUpdated={() => { setEventoAbierto(null); cargar(); }} onRefresh={cargar} />
      )}
    </div>
  );
}
