// Cálculos de la página de Métricas.
// Regla: todo número sale de una lista de eventos, y esa lista es lo que se abre al hacer clic.

export const VENDIDOS = ['APROBADO', 'CONCLUIDO'];
export const ABIERTOS = ['CONSULTA_ENTRANTE', 'ASIGNADO', 'CONTACTADO', 'COTIZADO'];
export const NO_VALIDOS = ['MULTIRESERVA', 'ELIMINADO'];

export const ESTADO_NOMBRE = {
  CONSULTA_ENTRANTE: 'Consulta entrante',
  ASIGNADO: 'Asignado',
  CONTACTADO: 'Contactado',
  COTIZADO: 'Cotizado',
  APROBADO: 'Aprobado',
  CONCLUIDO: 'Concluido',
  RECHAZADO: 'Rechazado',
  MULTIRESERVA: 'Multireserva',
  ELIMINADO: 'Eliminado',
};

// Orden fijo de colores por local (paleta validada); "Sin local" va siempre en gris
export const LOCALES = ['Costa7070', 'CoChinChina', 'Kona', 'MilVidas', 'Cruza Polo', 'Cruza Recoleta', 'La Mala'];
export const SIN_LOCAL = 'Sin local';

export const PAX_PRESETS = [
  { id: 'todos', label: 'Todos', min: null, max: null },
  { id: 'lt20', label: 'Menos de 20', min: null, max: 19 },
  { id: '20-40', label: '20 a 40', min: 20, max: 40 },
  { id: '41-80', label: '41 a 80', min: 41, max: 80 },
  { id: '81-100', label: '81 a 100', min: 81, max: 100 },
  { id: '101-250', label: '101 a 250', min: 101, max: 250 },
  { id: 'gt250', label: 'Más de 250', min: 251, max: null },
];

export const FILTROS_INICIALES = {
  creadoDesde: '', creadoHasta: '', eventoDesde: '', eventoHasta: '',
  local: '', comercial: '', pax: 'todos', origen: 'todos',
};

export const esValido = (e) => !NO_VALIDOS.includes(e.estado);
export const esVendido = (e) => VENDIDOS.includes(e.estado);
export const esAbierto = (e) => ABIERTOS.includes(e.estado);
export const localDe = (e) => e.local || SIN_LOCAL;
export const sumaMonto = (lista) => lista.reduce((s, e) => s + (e.monto || 0), 0);
export const dia = (iso) => (iso ? iso.slice(0, 10) : '');

export function aplicarFiltros(eventos, f) {
  const preset = PAX_PRESETS.find((p) => p.id === f.pax) || PAX_PRESETS[0];
  return eventos.filter((e) => {
    const creado = dia(e.creado);
    if (f.creadoDesde && creado < f.creadoDesde) return false;
    if (f.creadoHasta && creado > f.creadoHasta) return false;
    if (f.eventoDesde && (!e.fecha_evento || e.fecha_evento < f.eventoDesde)) return false;
    if (f.eventoHasta && (!e.fecha_evento || e.fecha_evento > f.eventoHasta)) return false;
    if (f.local === SIN_LOCAL ? e.local : f.local && e.local !== f.local) return false;
    if (f.comercial === 'sin' ? e.comercial_id : f.comercial && String(e.comercial_id) !== String(f.comercial)) return false;
    if (preset.min !== null || preset.max !== null) {
      if (e.pax == null) return false;
      if (preset.min !== null && e.pax < preset.min) return false;
      if (preset.max !== null && e.pax > preset.max) return false;
    }
    if (f.origen === 'crm' && e.migrado) return false;
    if (f.origen === 'migrados' && !e.migrado) return false;
    return true;
  });
}

const porcentaje = (a, b) => (b > 0 ? (a / b) * 100 : null);

export function resumen(eventos) {
  const validos = eventos.filter(esValido);
  const vendidos = eventos.filter(esVendido);
  const aprobados = eventos.filter((e) => e.estado === 'APROBADO');
  const concluidos = eventos.filter((e) => e.estado === 'CONCLUIDO');
  const rechazados = eventos.filter((e) => e.estado === 'RECHAZADO');
  const abiertos = eventos.filter(esAbierto);
  const vendidosConMonto = vendidos.filter((e) => e.monto > 0);
  return {
    leads: eventos,
    validos,
    multireserva: eventos.filter((e) => e.estado === 'MULTIRESERVA'),
    eliminados: eventos.filter((e) => e.estado === 'ELIMINADO'),
    vendidos, aprobados, concluidos, rechazados, abiertos,
    vendidosConMonto,
    decididos: [...vendidos, ...rechazados],
    conversion: porcentaje(vendidos.length, validos.length),
    tasaCierre: porcentaje(vendidos.length, vendidos.length + rechazados.length),
    montoVendido: sumaMonto(vendidos),
    montoAprobados: sumaMonto(aprobados),
    montoConcluidos: sumaMonto(concluidos),
    montoAbierto: sumaMonto(abiertos),
    ticket: vendidosConMonto.length ? sumaMonto(vendidosConMonto) / vendidosConMonto.length : null,
  };
}

// --- Leads por local en el tiempo (por fecha de creación) ---
function inicioSemana(fechaIso) {
  const d = new Date(`${fechaIso}T12:00:00`);
  const dow = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function claveDePeriodo(e, agrupacion) {
  const d = dia(e.creado);
  if (!d) return null;
  if (agrupacion === 'mes') return d.slice(0, 7);
  if (agrupacion === 'semana') return inicioSemana(d);
  return d;
}

export function etiquetaPeriodo(clave, agrupacion) {
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  if (agrupacion === 'mes') {
    const [a, m] = clave.split('-');
    return `${meses[Number(m) - 1]} ${a.slice(2)}`;
  }
  const [, m, d] = clave.split('-');
  return agrupacion === 'semana' ? `sem ${Number(d)}/${Number(m)}` : `${Number(d)}/${Number(m)}`;
}

export function leadsPorLocal(eventos, agrupacion) {
  const periodos = new Map();
  const localesPresentes = new Set();
  for (const e of eventos) {
    const clave = claveDePeriodo(e, agrupacion);
    if (!clave) continue;
    const local = localDe(e);
    localesPresentes.add(local);
    if (!periodos.has(clave)) periodos.set(clave, {});
    const fila = periodos.get(clave);
    (fila[local] ||= []).push(e);
  }
  const locales = [...LOCALES.filter((l) => localesPresentes.has(l)),
    ...[...localesPresentes].filter((l) => !LOCALES.includes(l) && l !== SIN_LOCAL).sort(),
    ...(localesPresentes.has(SIN_LOCAL) ? [SIN_LOCAL] : [])];
  const filas = [...periodos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([clave, celdas]) => ({
    clave,
    celdas,
    total: Object.values(celdas).flat(),
  }));
  return { locales, filas };
}

// --- Rendimiento por local o por comercial ---
const mediana = (valores) => {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

const horasEntre = (desde, hasta) => (new Date(hasta) - new Date(desde)) / 36e5;

const minutosDesdeCreacion = (e, cuando) => (new Date(cuando) - new Date(e.creado)) / 6e4;

// Primera respuesta = primer paso a Contactado, Cotizado o Aprobado (el estado puede saltear etapas)
export function primeraRespuesta(e) {
  const t = [e.t_contactado, e.t_cotizado, e.t_vendido].filter(Boolean).sort()[0];
  return t || null;
}

export function rendimientoPor(eventos, claveFn, nombreFn) {
  const grupos = new Map();
  for (const e of eventos) {
    const k = claveFn(e);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(e);
  }
  return [...grupos.entries()].map(([clave, lista]) => {
    const r = resumen(lista);
    // Solo leads que esperaron respuesta: los cargados a mano ya contactados o ya aprobados darían 0
    const medibles = lista.filter((e) => !e.migrado && primeraRespuesta(e) && minutosDesdeCreacion(e, primeraRespuesta(e)) > 1);
    const ventasMedibles = lista.filter((e) => !e.migrado && e.t_vendido && minutosDesdeCreacion(e, e.t_vendido) > 1);
    return {
      clave,
      nombre: nombreFn(clave, lista),
      ...r,
      respuestaMedibles: medibles,
      horasRespuesta: mediana(medibles.map((e) => horasEntre(e.creado, primeraRespuesta(e)))),
      ventasMedibles,
      diasVenta: mediana(ventasMedibles.map((e) => horasEntre(e.creado, e.t_vendido) / 24)),
    };
  }).sort((a, b) => b.validos.length - a.validos.length);
}

// --- Cohortes: de lo que entró cada mes, qué pasó ---
export function cohortes(eventos) {
  const grupos = new Map();
  for (const e of eventos.filter(esValido)) {
    const mes = dia(e.creado).slice(0, 7);
    if (!mes) continue;
    if (!grupos.has(mes)) grupos.set(mes, []);
    grupos.get(mes).push(e);
  }
  return [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([mes, lista]) => ({
    mes,
    lista,
    vendidos: lista.filter(esVendido),
    rechazados: lista.filter((e) => e.estado === 'RECHAZADO'),
    abiertos: lista.filter(esAbierto),
    migrados: lista.filter((e) => e.migrado).length,
  }));
}

// --- Motivos de pérdida ---
export function motivos(eventos) {
  const rechazados = eventos.filter((e) => e.estado === 'RECHAZADO');
  const grupos = new Map();
  for (const e of rechazados) {
    const k = e.motivo_categoria || 'Sin motivo cargado';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(e);
  }
  return {
    total: rechazados.length,
    filas: [...grupos.entries()].map(([nombre, lista]) => ({ nombre, lista }))
      .sort((a, b) => (a.nombre === 'Otro') - (b.nombre === 'Otro') || b.lista.length - a.lista.length),
  };
}

// --- Pipeline abierto por antigüedad sin movimiento ---
export const TRAMOS = [
  { id: '0-7', label: 'Hasta 7 días', min: 0, max: 7 },
  { id: '8-14', label: '8 a 14 días', min: 8, max: 14 },
  { id: '15-30', label: '15 a 30 días', min: 15, max: 30 },
  { id: '30+', label: 'Más de 30 días', min: 31, max: Infinity },
];

export const diasSinMovimiento = (e, ahora) => Math.floor((ahora - new Date(e.ultimo_cambio)) / 864e5);

export function pipelinePorAntiguedad(eventos, ahora) {
  const etapas = ABIERTOS.map((estado) => {
    const lista = eventos.filter((e) => e.estado === estado);
    return {
      estado,
      lista,
      tramos: TRAMOS.map((t) => ({
        ...t,
        lista: lista.filter((e) => {
          const d = diasSinMovimiento(e, ahora);
          return d >= t.min && d <= t.max;
        }),
      })),
    };
  });
  return etapas;
}

// --- Calidad de datos: lo que hace que un número no sea confiable ---
export function calidadDatos(eventos, hoy) {
  const validos = eventos.filter(esValido);
  return [
    { id: 'sin-local', titulo: 'Leads válidos sin local', ayuda: 'No suman en ningún local de los gráficos por local.', lista: validos.filter((e) => !e.local) },
    { id: 'sin-fecha', titulo: 'Leads válidos sin fecha de evento', ayuda: 'No se pueden ubicar en el calendario ni filtrar por fecha de evento.', lista: validos.filter((e) => !e.fecha_evento) },
    { id: 'vendidos-sin-monto', titulo: 'Vendidos sin monto', ayuda: 'Cuentan como venta pero no suman facturación.', lista: eventos.filter((e) => esVendido(e) && !(e.monto > 0)) },
    { id: 'cotizados-sin-monto', titulo: 'Cotizados sin monto', ayuda: 'Están en etapa de cotización pero sin presupuesto cargado.', lista: eventos.filter((e) => e.estado === 'COTIZADO' && !(e.monto > 0)) },
    { id: 'aprobados-vencidos', titulo: 'Aprobados con fecha pasada', ayuda: 'Ya ocurrieron pero no pasaron a Concluido.', lista: eventos.filter((e) => e.estado === 'APROBADO' && e.fecha_evento && e.fecha_evento < hoy) },
    { id: 'fechas-raras', titulo: 'Fechas de evento imposibles', ayuda: 'Año anterior a 2020 o posterior a 2030: casi siempre un error de tipeo.', lista: eventos.filter((e) => e.fecha_evento && (e.fecha_evento < '2020-01-01' || e.fecha_evento > '2030-12-31')) },
    { id: 'migrados', titulo: 'Migrados del CRM anterior (18/02/2026)', ayuda: 'Su fecha de creación es la de la migración, no la de la consulta real.', lista: eventos.filter((e) => e.migrado) },
  ];
}

// --- Formatos ---
export const fmtNum = (n) => (n == null ? '—' : new Intl.NumberFormat('es-AR').format(Math.round(n)));
export const fmtPesos = (n) => (n == null ? '—' : `$ ${new Intl.NumberFormat('es-AR').format(Math.round(n))}`);
export const fmtPesosCorto = (n) => {
  if (n == null) return '—';
  if (Math.abs(n) >= 1e9) return `$ ${(n / 1e9).toLocaleString('es-AR', { maximumFractionDigits: 2 })} mil M`;
  if (Math.abs(n) >= 1e6) return `$ ${(n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  return fmtPesos(n);
};
export const fmtPct = (n) => (n == null ? '—' : `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`);
export const fmtHoras = (h) => {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`;
  return `${(h / 24).toLocaleString('es-AR', { maximumFractionDigits: 1 })} días`;
};
export const fmtDias = (d) => (d == null ? '—' : `${d.toLocaleString('es-AR', { maximumFractionDigits: 1 })} días`);
export const fmtFecha = (iso) => {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};
