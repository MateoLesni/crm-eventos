import ExcelJS from 'exceljs';

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

// Estilos reutilizables
const FILL_GRIS = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
const FONT_BOLD = { bold: true };
const BORDER_BOTTOM = { bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } } };

function aplicarHeaderTabla(row) {
  row.eachCell((cell) => {
    cell.font = FONT_BOLD;
    cell.fill = FILL_GRIS;
    cell.border = BORDER_BOTTOM;
  });
}

function aplicarHeaderGlobal(cell) {
  cell.font = FONT_BOLD;
  cell.border = BORDER_BOTTOM;
}

function aplicarTotales(row) {
  row.eachCell((cell) => {
    cell.font = FONT_BOLD;
  });
}

export async function exportarReportesAExcel(data, filtros) {
  const { kpis, volumen_periodo, comerciales, locales } = data;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CRM Eventos';
  wb.created = new Date();

  const periodo = `${filtros.fecha_desde} a ${filtros.fecha_hasta}`;
  const tipoFecha = filtros.tipo_fecha === 'creacion' ? 'Fecha de creación' : 'Fecha del evento';
  const agrupacion = filtros.agrupacion === 'semanal' ? 'Semanal' : 'Diario';

  // ---- Hoja 1: KPIs ----
  const wsKpis = wb.addWorksheet('KPIs');
  wsKpis.columns = [{ width: 38 }, { width: 24 }];

  const titulo = wsKpis.addRow(['Reporte Operativo']);
  titulo.getCell(1).font = { bold: true, size: 14 };

  wsKpis.addRow(['Período', periodo]);
  wsKpis.addRow(['Filtro', tipoFecha]);
  wsKpis.addRow(['Agrupación', agrupacion]);
  wsKpis.addRow([]);

  const hEstado = wsKpis.addRow(['ESTADO ACTUAL (foto instantánea, no depende del filtro)']);
  aplicarHeaderGlobal(hEstado.getCell(1));

  wsKpis.addRow(['Sin asignar', kpis.estado_actual.sin_asignar]);
  wsKpis.addRow(['Cotizados abiertos', kpis.estado_actual.cotizados_abiertos]);
  wsKpis.addRow(['Monto en negociación', kpis.estado_actual.monto_en_negociacion]);
  wsKpis.addRow([]);

  const hPeriodo = wsKpis.addRow(['EN EL PERÍODO']);
  aplicarHeaderGlobal(hPeriodo.getCell(1));

  wsKpis.addRow(['Solicitudes', kpis.en_periodo.solicitudes]);
  wsKpis.addRow(['Cerrados', kpis.en_periodo.cerrados]);
  wsKpis.addRow(['Perdidos', kpis.en_periodo.perdidos]);
  wsKpis.addRow(['Tasa de cierre (%)', kpis.en_periodo.tasa_cierre]);
  wsKpis.addRow(['Facturación cerrada', kpis.en_periodo.monto_cerrado]);

  // ---- Hoja 2: Volumen ----
  const wsVol = wb.addWorksheet('Volumen');
  const volHeader = ['Fecha', 'Total', 'Entrante', 'Asignado', 'Contactado', 'Cotizado', 'Aprobado', 'Rechazado'];
  wsVol.columns = volHeader.map(() => ({ width: 14 }));
  aplicarHeaderTabla(wsVol.addRow(volHeader));
  volumen_periodo.filas.forEach(f => {
    wsVol.addRow([
      formatearFecha(f.fecha),
      f.total,
      f.consulta_entrante,
      f.asignado,
      f.contactado,
      f.cotizado,
      f.aprobado,
      f.rechazado,
    ]);
  });
  aplicarTotales(wsVol.addRow([
    'TOTAL',
    volumen_periodo.totales.total,
    volumen_periodo.totales.consulta_entrante,
    volumen_periodo.totales.asignado,
    volumen_periodo.totales.contactado,
    volumen_periodo.totales.cotizado,
    volumen_periodo.totales.aprobado,
    volumen_periodo.totales.rechazado,
  ]));

  // ---- Hoja 3: Comerciales ----
  const wsCom = wb.addWorksheet('Comerciales');
  const comHeader = ['Comercial', 'Total', 'Entrante', 'Asignado', 'Contactado', 'Cotizado', 'Aprobado', 'Rechazado', '% Cierre', 'Participación (%)'];
  wsCom.columns = [{ width: 26 }, ...comHeader.slice(1).map(() => ({ width: 14 }))];
  aplicarHeaderTabla(wsCom.addRow(comHeader));
  comerciales.filas.forEach(f => {
    wsCom.addRow([
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
  });
  aplicarTotales(wsCom.addRow([
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
  ]));

  // ---- Hoja 4: Distribución por Local ----
  if (locales?.filas?.length > 0) {
    const keyId = (col) => (col.id == null ? 'sin_local' : String(col.id));
    const wsLoc = wb.addWorksheet('Distribución por Local');
    const locHeader = ['Fecha carga', ...locales.columnas.map(c => c.nombre), 'Total'];
    wsLoc.columns = locHeader.map((_, i) => ({ width: i === 0 ? 14 : 14 }));
    aplicarHeaderTabla(wsLoc.addRow(locHeader));
    locales.filas.forEach(f => {
      wsLoc.addRow([
        formatearFecha(f.fecha),
        ...locales.columnas.map(c => f.locales[keyId(c)] || 0),
        f.total,
      ]);
    });
    aplicarTotales(wsLoc.addRow([
      'TOTAL',
      ...locales.columnas.map(c => locales.totales_por_local[keyId(c)] || 0),
      locales.total_general,
    ]));
  }

  // Descargar
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reportes_operativos_${filtros.fecha_desde}_a_${filtros.fecha_hasta}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
