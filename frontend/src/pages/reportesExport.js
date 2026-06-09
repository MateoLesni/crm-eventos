import * as XLSX from 'xlsx';

const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const formatearFecha = (fechaStr) => {
  if (!fechaStr) return '-';
  const fecha = new Date(fechaStr + 'T00:00:00');
  return `${fecha.getDate()} ${meses[fecha.getMonth()]}`;
};

const calcularTasa = (aprobado, rechazado) => {
  const decididos = aprobado + rechazado;
  return decididos > 0 ? Number(((aprobado / decididos) * 100).toFixed(1)) : null;
};

export function exportarReportesAExcel(data, filtros) {
  const { kpis, volumen_periodo, comerciales, locales } = data;
  const wb = XLSX.utils.book_new();

  const periodo = `${filtros.fecha_desde} a ${filtros.fecha_hasta}`;
  const tipoFecha = filtros.tipo_fecha === 'creacion' ? 'Fecha de creación' : 'Fecha del evento';
  const agrupacion = filtros.agrupacion === 'semanal' ? 'Semanal' : 'Diario';

  // ---- Hoja 1: KPIs ----
  const kpisRows = [
    ['Reporte Operativo'],
    ['Período', periodo],
    ['Filtro', tipoFecha],
    ['Agrupación', agrupacion],
    [],
    ['ESTADO ACTUAL (foto instantánea, no depende del filtro)'],
    ['Sin asignar', kpis.estado_actual.sin_asignar],
    ['Cotizados abiertos', kpis.estado_actual.cotizados_abiertos],
    ['Monto en negociación', kpis.estado_actual.monto_en_negociacion],
    [],
    ['EN EL PERÍODO'],
    ['Solicitudes', kpis.en_periodo.solicitudes],
    ['Cerrados', kpis.en_periodo.cerrados],
    ['Perdidos', kpis.en_periodo.perdidos],
    ['Tasa de cierre (%)', kpis.en_periodo.tasa_cierre],
    ['Facturación cerrada', kpis.en_periodo.monto_cerrado],
  ];
  const wsKpis = XLSX.utils.aoa_to_sheet(kpisRows);
  wsKpis['!cols'] = [{ wch: 36 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsKpis, 'KPIs');

  // ---- Hoja 2: Volumen de Solicitudes ----
  const volHeader = ['Fecha', 'Total', 'Entrante', 'Asignado', 'Contactado', 'Cotizado', 'Aprobado', 'Rechazado'];
  const volRows = volumen_periodo.filas.map(f => [
    formatearFecha(f.fecha),
    f.total,
    f.consulta_entrante,
    f.asignado,
    f.contactado,
    f.cotizado,
    f.aprobado,
    f.rechazado,
  ]);
  const volTotales = [
    'TOTAL',
    volumen_periodo.totales.total,
    volumen_periodo.totales.consulta_entrante,
    volumen_periodo.totales.asignado,
    volumen_periodo.totales.contactado,
    volumen_periodo.totales.cotizado,
    volumen_periodo.totales.aprobado,
    volumen_periodo.totales.rechazado,
  ];
  const wsVol = XLSX.utils.aoa_to_sheet([volHeader, ...volRows, volTotales]);
  wsVol['!cols'] = volHeader.map(() => ({ wch: 14 }));
  XLSX.utils.book_append_sheet(wb, wsVol, 'Volumen');

  // ---- Hoja 3: Comerciales ----
  const comHeader = ['Comercial', 'Total', 'Entrante', 'Asignado', 'Contactado', 'Cotizado', 'Aprobado', 'Rechazado', '% Cierre', 'Participación (%)'];
  const comRows = comerciales.filas.map(f => [
    f.nombre,
    f.total,
    f.consulta_entrante,
    f.asignado,
    f.contactado,
    f.cotizado,
    f.aprobado,
    f.rechazado,
    calcularTasa(f.aprobado, f.rechazado),
    f.participacion,
  ]);
  const comTotales = [
    'TOTAL',
    comerciales.totales.total,
    comerciales.totales.consulta_entrante,
    comerciales.totales.asignado,
    comerciales.totales.contactado,
    comerciales.totales.cotizado,
    comerciales.totales.aprobado,
    comerciales.totales.rechazado,
    calcularTasa(comerciales.totales.aprobado, comerciales.totales.rechazado),
    100,
  ];
  const wsCom = XLSX.utils.aoa_to_sheet([comHeader, ...comRows, comTotales]);
  wsCom['!cols'] = [{ wch: 24 }, ...comHeader.slice(1).map(() => ({ wch: 14 }))];
  XLSX.utils.book_append_sheet(wb, wsCom, 'Comerciales');

  // ---- Hoja 4: Distribución por Local ----
  if (locales?.filas?.length > 0) {
    const keyId = (col) => (col.id == null ? 'sin_local' : String(col.id));
    const locHeader = ['Fecha carga', ...locales.columnas.map(c => c.nombre), 'Total'];
    const locRows = locales.filas.map(f => [
      formatearFecha(f.fecha),
      ...locales.columnas.map(c => f.locales[keyId(c)] || 0),
      f.total,
    ]);
    const locTotales = [
      'TOTAL',
      ...locales.columnas.map(c => locales.totales_por_local[keyId(c)] || 0),
      locales.total_general,
    ];
    const wsLoc = XLSX.utils.aoa_to_sheet([locHeader, ...locRows, locTotales]);
    wsLoc['!cols'] = locHeader.map((_, i) => ({ wch: i === 0 ? 14 : 12 }));
    XLSX.utils.book_append_sheet(wb, wsLoc, 'Distribución por Local');
  }

  const nombreArchivo = `reportes_operativos_${filtros.fecha_desde}_a_${filtros.fecha_hasta}.xlsx`;
  XLSX.writeFile(wb, nombreArchivo);
}
