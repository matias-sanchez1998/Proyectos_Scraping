const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const RESULTADOS_DIR = path.join(__dirname, "..", "resultados");
const ARCHIVO_SALIDA = path.join(
  RESULTADOS_DIR,
  "Deudas_Guaymallen.xlsx"
);

// ============================================================
// COLORES
// ============================================================

const COLORS = {
  azul: "1F4E78",
  azulClaro: "D9EAF7",
  azulMedio: "4472C4",

  verde: "70AD47",
  verdeClaro: "E2F0D9",

  rojo: "C00000",
  rojoClaro: "FCE4D6",

  amarillo: "FFC000",
  amarilloClaro: "FFF2CC",

  gris: "7F7F7F",
  grisClaro: "F2F2F2",

  blanco: "FFFFFF",
  negro: "000000",
};

// ============================================================
// UTILIDADES
// ============================================================

function moneda(valor) {
  return Number(valor || 0);
}

function formatearFecha(fecha) {
  if (!fecha) return "";

  const partes = String(fecha).split("-");

  if (partes.length !== 3) {
    return fecha;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function crearFilasPadrones(registrosExcel, cache) {
  const mapa = new Map();

  for (const registro of registrosExcel) {
    const padron = registro.padron;

    if (!mapa.has(padron)) {
      mapa.set(padron, {
        padron,
        inquilinos: new Set(),
        propietarios: new Set(),
      });
    }

    const grupo = mapa.get(padron);

    if (registro.inquilino) {
      grupo.inquilinos.add(registro.inquilino);
    }

    if (registro.propietario) {
      grupo.propietarios.add(registro.propietario);
    }
  }

  const filas = [];

  for (const [padron, grupo] of mapa) {
    const resultado = cache[padron];

    if (!resultado) continue;

    filas.push({
      padron,
      inquilinos: [...grupo.inquilinos],
      propietarios: [...grupo.propietarios],
      estado: resultado.estado,
      cuotas: resultado.cantidadCuotas || 0,
      total: moneda(resultado.total),
      titular: resultado.titular || "",
      nomenclatura: resultado.nomenclatura || "",
    });
  }

  return filas.sort((a, b) => b.total - a.total);
}

function crearResumenInquilinos(registrosExcel, cache) {
  const grupos = new Map();

  for (const registro of registrosExcel) {
    const inquilino = registro.inquilino || "SIN INQUILINO";

    if (!grupos.has(inquilino)) {
      grupos.set(inquilino, {
        inquilino,
        padrones: new Set(),
      });
    }

    grupos.get(inquilino).padrones.add(registro.padron);
  }

  const filas = [];

  for (const grupo of grupos.values()) {
    let total = 0;
    let tieneDeuda = false;

    for (const padron of grupo.padrones) {
      const resultado = cache[padron];

      if (!resultado) continue;

      total += moneda(resultado.total);

      if (resultado.estado === "CON DEUDA") {
        tieneDeuda = true;
      }
    }

    filas.push({
      inquilino: grupo.inquilino,
      cantidadPadrones: grupo.padrones.size,
      padrones: [...grupo.padrones].join(" | "),
      total,
      estado: tieneDeuda ? "CON DEUDA" : "SIN DEUDA",
    });
  }

  return filas.sort((a, b) => b.total - a.total);
}

function crearDetalle(registrosExcel, cache) {
  const filas = [];

  for (const registro of registrosExcel) {
    const resultado = cache[registro.padron];

    if (!resultado || !resultado.cuotas) {
      continue;
    }

    for (const cuota of resultado.cuotas) {
      filas.push({
        inquilino: registro.inquilino || "",
        propietario: registro.propietario || "",
        padron: registro.padron,
        periodo: `${cuota.anio}/${cuota.numero}`,
        referencia: cuota.referencia || "",
        vencimiento: cuota.vencimiento || "",
        capital: moneda(cuota.capital),
        interes: moneda(cuota.interes),
        total: moneda(cuota.total),
      });
    }
  }

  return filas;
}

// ============================================================
// ESTILOS GENERALES
// ============================================================

function aplicarTitulo(ws, rango, titulo, subtitulo) {
  ws.mergeCells(rango);

  const celda = ws.getCell(rango.split(":")[0]);

  celda.value = titulo;
  celda.font = {
    name: "Aptos Display",
    size: 20,
    bold: true,
    color: { argb: COLORS.blanco },
  };

  celda.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.azul },
  };

  celda.alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  const inicio = rango.split(":")[0];
  const filaTitulo = Number(inicio.match(/\d+/)[0]);

  ws.getRow(filaTitulo).height = 34;

  const siguienteFila = filaTitulo + 1;

  ws.mergeCells(
    `A${siguienteFila}:${rango.split(":")[1].replace(/\d+/g, "")}${siguienteFila}`
  );

  const sub = ws.getCell(`A${siguienteFila}`);

  sub.value = subtitulo;
  sub.font = {
    name: "Aptos",
    size: 10,
    italic: true,
    color: { argb: COLORS.gris },
  };

  sub.alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  ws.getRow(siguienteFila).height = 20;
}

function estilizarEncabezado(row) {
  row.eachCell((cell) => {
    cell.font = {
      name: "Aptos",
      size: 11,
      bold: true,
      color: { argb: COLORS.blanco },
    };

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.azulMedio },
    };

    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    cell.border = {
      top: { style: "thin", color: { argb: "D9E1F2" } },
      bottom: { style: "thin", color: { argb: "D9E1F2" } },
      left: { style: "thin", color: { argb: "D9E1F2" } },
      right: { style: "thin", color: { argb: "D9E1F2" } },
    };
  });

  row.height = 30;
}

function estilizarCuerpo(ws, desde, hasta, cantidadColumnas) {
  for (let fila = desde; fila <= hasta; fila++) {
    const row = ws.getRow(fila);

    for (let col = 1; col <= cantidadColumnas; col++) {
      const cell = row.getCell(col);

      cell.font = {
        name: "Aptos",
        size: 10,
        color: { argb: COLORS.negro },
      };

      cell.border = {
        bottom: {
          style: "hair",
          color: { argb: "D9D9D9" },
        },
      };

      cell.alignment = {
        vertical: "center",
        wrapText: true,
      };
    }
  }
}

function aplicarFilasEstado(ws, columnaEstado, filaInicio, filaFin) {
  for (let fila = filaInicio; fila <= filaFin; fila++) {
    const cell = ws.getCell(`${columnaEstado}${fila}`);

    if (cell.value === "CON DEUDA") {
      cell.font = {
        bold: true,
        color: { argb: COLORS.rojo },
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.rojoClaro },
      };
    }

    if (cell.value === "SIN DEUDA") {
      cell.font = {
        bold: true,
        color: { argb: "548235" },
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.verdeClaro },
      };
    }
  }
}

function configurarVista(ws, filaEncabezado) {
  ws.views = [
    {
      state: "frozen",
      ySplit: filaEncabezado,
      activeCell: `A${filaEncabezado + 1}`,
    },
  ];

  ws.autoFilter = {
    from: {
      row: filaEncabezado,
      column: 1,
    },
    to: {
      row: ws.lastRow.number,
      column: ws.lastColumn.number,
    },
  };
}

// ============================================================
// DASHBOARD
// ============================================================

function crearDashboard(workbook, resumenInquilinos, filasPadrones) {
  const ws = workbook.addWorksheet("Dashboard");

  ws.views = [
    {
      showGridLines: false,
    },
  ];

  ws.columns = [
    { width: 4 },
    { width: 25 },
    { width: 25 },
    { width: 4 },
    { width: 25 },
    { width: 25 },
  ];

  ws.mergeCells("B2:F3");

  const titulo = ws.getCell("B2");

  titulo.value = "DEUDAS MUNICIPALES – GUAYMALLÉN";

  titulo.font = {
    name: "Aptos Display",
    size: 22,
    bold: true,
    color: { argb: COLORS.blanco },
  };

  titulo.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.azul },
  };

  titulo.alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  ws.getRow(2).height = 24;
  ws.getRow(3).height = 24;

  ws.mergeCells("B4:F4");

  const fecha = ws.getCell("B4");

  fecha.value = `Informe generado: ${new Date().toLocaleString(
    "es-AR"
  )}`;

  fecha.font = {
    name: "Aptos",
    size: 10,
    italic: true,
    color: { argb: COLORS.gris },
  };

  fecha.alignment = {
    horizontal: "center",
  };

  const totalPadrones = filasPadrones.length;

  const conDeuda = filasPadrones.filter(
    (p) => p.estado === "CON DEUDA"
  ).length;

  const sinDeuda = filasPadrones.filter(
    (p) => p.estado === "SIN DEUDA"
  ).length;

  const deudaTotal = filasPadrones.reduce(
    (sum, p) => sum + p.total,
    0
  );

  const inquilinosConDeuda = resumenInquilinos.filter(
    (i) => i.estado === "CON DEUDA"
  ).length;

  // ----------------------------------------------------------
  // TARJETA 1
  // ----------------------------------------------------------

  crearTarjeta(
    ws,
    "B6",
    "C8",
    "PADRONES ANALIZADOS",
    totalPadrones,
    COLORS.azulMedio
  );

  // ----------------------------------------------------------
  // TARJETA 2
  // ----------------------------------------------------------

  crearTarjeta(
    ws,
    "E6",
    "F8",
    "PADRONES CON DEUDA",
    conDeuda,
    COLORS.rojo
  );

  // ----------------------------------------------------------
  // TARJETA 3
  // ----------------------------------------------------------

  crearTarjeta(
    ws,
    "B10",
    "C12",
    "PADRONES SIN DEUDA",
    sinDeuda,
    COLORS.verde
  );

  // ----------------------------------------------------------
  // TARJETA 4
  // ----------------------------------------------------------

  crearTarjeta(
    ws,
    "E10",
    "F12",
    "INQUILINOS CON DEUDA",
    inquilinosConDeuda,
    COLORS.amarillo
  );

  // ----------------------------------------------------------
  // TOTAL GENERAL
  // ----------------------------------------------------------

  ws.mergeCells("B14:F17");

  const totalCell = ws.getCell("B14");

  totalCell.value = deudaTotal;

  totalCell.numFmt = '$ #,##0.00';

  totalCell.font = {
    name: "Aptos Display",
    size: 26,
    bold: true,
    color: { argb: COLORS.blanco },
  };

  totalCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.rojo },
  };

  totalCell.alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  ws.mergeCells("B18:F18");

  const etiqueta = ws.getCell("B18");

  etiqueta.value = "TOTAL GENERAL DE DEUDA MUNICIPAL";

  etiqueta.font = {
    name: "Aptos",
    size: 11,
    bold: true,
    color: { argb: COLORS.gris },
  };

  etiqueta.alignment = {
    horizontal: "center",
  };

  // ----------------------------------------------------------
  // RESUMEN
  // ----------------------------------------------------------

  ws.mergeCells("B21:F21");

  const resumen = ws.getCell("B21");

  resumen.value = "RESUMEN DEL PROCESO";

  resumen.font = {
    bold: true,
    size: 14,
    color: { argb: COLORS.azul },
  };

  ws.getCell("B23").value = "Indicador";
  ws.getCell("C23").value = "Cantidad";

  estilizarEncabezado(ws.getRow(23));

  ws.getCell("B24").value = "Padrones analizados";
  ws.getCell("C24").value = totalPadrones;

  ws.getCell("B25").value = "Padrones con deuda";
  ws.getCell("C25").value = conDeuda;

  ws.getCell("B26").value = "Padrones sin deuda";
  ws.getCell("C26").value = sinDeuda;

  ws.getCell("B27").value = "Inquilinos con deuda";
  ws.getCell("C27").value = inquilinosConDeuda;

  ws.getCell("B28").value = "Total deuda municipal";
  ws.getCell("C28").value = deudaTotal;
  ws.getCell("C28").numFmt = '$ #,##0.00';

  estilizarCuerpo(ws, 24, 28, 2);

  ws.getCell("C25").font = {
    bold: true,
    color: { argb: COLORS.rojo },
  };

  ws.getCell("C26").font = {
    bold: true,
    color: { argb: COLORS.verde },
  };

  ws.getCell("C28").font = {
    bold: true,
    color: { argb: COLORS.rojo },
  };

  return ws;
}

function crearTarjeta(
  ws,
  inicio,
  fin,
  etiqueta,
  valor,
  color
) {
  ws.mergeCells(`${inicio}:${fin}`);

  const cell = ws.getCell(inicio);

  cell.value = `${etiqueta}\n\n${valor}`;

  cell.font = {
    name: "Aptos",
    size: 15,
    bold: true,
    color: { argb: COLORS.blanco },
  };

  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: color },
  };

  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  const filaInicio = Number(inicio.match(/\d+/)[0]);
  const filaFin = Number(fin.match(/\d+/)[0]);

  for (let i = filaInicio; i <= filaFin; i++) {
    ws.getRow(i).height = 28;
  }
}

// ============================================================
// HOJA RESUMEN INQUILINOS
// ============================================================

function crearHojaInquilinos(workbook, filas) {
  const ws = workbook.addWorksheet("Resumen Inquilinos");

  ws.mergeCells("A1:E1");
  ws.getCell("A1").value =
    "RESUMEN DE DEUDAS POR INQUILINO";

  ws.getCell("A1").font = {
    size: 18,
    bold: true,
    color: { argb: COLORS.blanco },
  };

  ws.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.azul },
  };

  ws.getCell("A1").alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  ws.getRow(1).height = 32;

  ws.mergeCells("A2:E2");
  ws.getCell("A2").value =
    `Generado: ${new Date().toLocaleString("es-AR")}`;

  ws.getCell("A2").alignment = {
    horizontal: "center",
  };

  ws.getCell("A2").font = {
    italic: true,
    color: { argb: COLORS.gris },
  };

  const header = ws.getRow(4);

  header.values = [
    "Inquilino",
    "Cantidad de padrones",
    "Padrones",
    "Deuda asociada",
    "Estado",
  ];

  estilizarEncabezado(header);

  filas.forEach((fila, index) => {
    const row = ws.getRow(index + 5);

    row.values = [
      fila.inquilino,
      fila.cantidadPadrones,
      fila.padrones,
      fila.total,
      fila.estado,
    ];

    row.getCell(4).numFmt = '$ #,##0.00';
  });

  if (filas.length > 0) {
    estilizarCuerpo(
      ws,
      5,
      filas.length + 4,
      5
    );

    aplicarFilasEstado(
      ws,
      "E",
      5,
      filas.length + 4
    );
  }

  ws.getColumn(1).width = 38;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 40;
  ws.getColumn(4).width = 20;
  ws.getColumn(5).width = 18;

  configurarVista(ws, 4);

  return ws;
}

// ============================================================
// HOJA PADRONES
// ============================================================

function crearHojaPadrones(workbook, filas) {
  const ws = workbook.addWorksheet("Padrones");

  ws.mergeCells("A1:H1");

  ws.getCell("A1").value =
    "DETALLE POR PADRÓN";

  ws.getCell("A1").font = {
    size: 18,
    bold: true,
    color: { argb: COLORS.blanco },
  };

  ws.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.azul },
  };

  ws.getCell("A1").alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  ws.getRow(1).height = 32;

  ws.mergeCells("A2:H2");
  ws.getCell("A2").value =
    `Generado: ${new Date().toLocaleString("es-AR")}`;

  ws.getCell("A2").alignment = {
    horizontal: "center",
  };

  ws.getCell("A2").font = {
    italic: true,
    color: { argb: COLORS.gris },
  };

  const header = ws.getRow(4);

  header.values = [
    "Padrón",
    "Inquilinos",
    "Propietarios",
    "Estado",
    "Cuotas",
    "Total deuda",
    "Titular municipal",
    "Nomenclatura",
  ];

  estilizarEncabezado(header);

  filas.forEach((fila, index) => {
    const row = ws.getRow(index + 5);

    row.values = [
      fila.padron,
      fila.inquilinos.join(" | "),
      fila.propietarios.join(" | "),
      fila.estado,
      fila.cuotas,
      fila.total,
      fila.titular,
      fila.nomenclatura,
    ];

    row.getCell(6).numFmt = '$ #,##0.00';
  });

  if (filas.length > 0) {
    estilizarCuerpo(
      ws,
      5,
      filas.length + 4,
      8
    );

    aplicarFilasEstado(
      ws,
      "D",
      5,
      filas.length + 4
    );
  }

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 40;
  ws.getColumn(3).width = 40;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 18;
  ws.getColumn(7).width = 32;
  ws.getColumn(8).width = 36;

  configurarVista(ws, 4);

  return ws;
}

// ============================================================
// HOJA DETALLE
// ============================================================

function crearHojaDetalle(workbook, filas) {
  const ws = workbook.addWorksheet("Detalle");

  ws.mergeCells("A1:I1");

  ws.getCell("A1").value =
    "DETALLE DE CUOTAS PENDIENTES";

  ws.getCell("A1").font = {
    size: 18,
    bold: true,
    color: { argb: COLORS.blanco },
  };

  ws.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.azul },
  };

  ws.getCell("A1").alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  ws.getRow(1).height = 32;

  ws.mergeCells("A2:I2");
  ws.getCell("A2").value =
    `Generado: ${new Date().toLocaleString("es-AR")}`;

  ws.getCell("A2").alignment = {
    horizontal: "center",
  };

  ws.getCell("A2").font = {
    italic: true,
    color: { argb: COLORS.gris },
  };

  const header = ws.getRow(4);

  header.values = [
    "Inquilino",
    "Propietario",
    "Padrón",
    "Período",
    "Referencia",
    "Vencimiento",
    "Capital",
    "Interés",
    "Total",
  ];

  estilizarEncabezado(header);

  filas.forEach((fila, index) => {
    const row = ws.getRow(index + 5);

    row.values = [
      fila.inquilino,
      fila.propietario,
      fila.padron,
      fila.periodo,
      fila.referencia,
      formatearFecha(fila.vencimiento),
      fila.capital,
      fila.interes,
      fila.total,
    ];

    row.getCell(7).numFmt = '$ #,##0.00';
    row.getCell(8).numFmt = '$ #,##0.00';
    row.getCell(9).numFmt = '$ #,##0.00';
  });

  if (filas.length > 0) {
    estilizarCuerpo(
      ws,
      5,
      filas.length + 4,
      9
    );
  }

  ws.getColumn(1).width = 38;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 16;
  ws.getColumn(7).width = 18;
  ws.getColumn(8).width = 16;
  ws.getColumn(9).width = 18;

  configurarVista(ws, 4);

  return ws;
}

// ============================================================
// EXPORTACIÓN
// ============================================================

async function generarExcel(registrosExcel, cache) {
  fs.mkdirSync(RESULTADOS_DIR, {
    recursive: true,
  });

  const filasPadrones = crearFilasPadrones(
    registrosExcel,
    cache
  );

  const resumenInquilinos =
    crearResumenInquilinos(
      registrosExcel,
      cache
    );

  const detalle = crearDetalle(
    registrosExcel,
    cache
  );

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Guaymallén - Consulta de Deudas";
  workbook.created = new Date();
  workbook.modified = new Date();

  crearDashboard(
    workbook,
    resumenInquilinos,
    filasPadrones
  );

  crearHojaInquilinos(
    workbook,
    resumenInquilinos
  );

  crearHojaPadrones(
    workbook,
    filasPadrones
  );

  crearHojaDetalle(
    workbook,
    detalle
  );

  await workbook.xlsx.writeFile(
    ARCHIVO_SALIDA
  );

  return ARCHIVO_SALIDA;
}

module.exports = {
  generarExcel,
};