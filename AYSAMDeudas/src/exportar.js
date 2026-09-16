const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const RESULTADOS_DIR = path.join(__dirname, "..", "resultados");
const ARCHIVO_SALIDA = path.join(
  RESULTADOS_DIR,
  "Deudas_AYSAM.xlsx"
);

const COLORS = {
  azul: "1F4E78",
  azulMedio: "4472C4",
  azulClaro: "D9EAF7",

  rojo: "C00000",
  rojoClaro: "FCE4D6",

  verde: "548235",
  verdeClaro: "E2F0D9",

  amarillo: "BF9000",
  amarilloClaro: "FFF2CC",

  gris: "7F7F7F",
  grisClaro: "F2F2F2",

  blanco: "FFFFFF",
  negro: "000000",
};

function moneda(valor) {
  return Number(valor || 0);
}

// ------------------------------------------------------------
// RESUMEN POR CUENTA
// ------------------------------------------------------------

function crearFilasCuentas(registros, cache) {
  const cuentas = new Map();

  for (const registro of registros) {
    if (!registro.cuenta) continue;

    if (!cuentas.has(registro.cuenta)) {
      cuentas.set(registro.cuenta, {
        cuenta: registro.cuenta,
        inquilinos: new Set(),
        propietarios: new Set(),
      });
    }

    const grupo = cuentas.get(registro.cuenta);

    if (registro.inquilino) {
      grupo.inquilinos.add(registro.inquilino);
    }

    if (registro.propietario) {
      grupo.propietarios.add(registro.propietario);
    }
  }

  const filas = [];

  for (const [cuenta, grupo] of cuentas) {
    const resultado = cache[cuenta];

    if (!resultado) continue;

    filas.push({
      cuenta,
      inquilinos: [...grupo.inquilinos],
      propietarios: [...grupo.propietarios],
      titular: resultado.titular || "",
      domicilio: resultado.domicilio || "",
      estado: resultado.estado || "ERROR",
      cantidadFacturas: resultado.cantidadFacturas || 0,
      deudaVencida: moneda(resultado.deudaVencida),
      deudaNoVencida: moneda(resultado.deudaNoVencida),
      deudaTotal: moneda(resultado.deudaTotal),
      proximaFactura: resultado.proximaFactura || "",
      proximoVencimiento:
        resultado.proximoVencimiento || "",
      tienePlanPago: resultado.tienePlanPago ? "SÍ" : "NO",
      mensaje: resultado.mensaje || "",
    });
  }

  return filas.sort(
    (a, b) => b.deudaTotal - a.deudaTotal
  );
}

// ------------------------------------------------------------
// RESUMEN POR INQUILINO
// ------------------------------------------------------------

function crearResumenInquilinos(registros, cache) {
  const grupos = new Map();

  for (const registro of registros) {
    if (!registro.cuenta) continue;

    const inquilino =
      registro.inquilino || "SIN INQUILINO";

    if (!grupos.has(inquilino)) {
      grupos.set(inquilino, {
        inquilino,
        cuentas: new Set(),
      });
    }

    grupos.get(inquilino).cuentas.add(
      registro.cuenta
    );
  }

  const filas = [];

  for (const grupo of grupos.values()) {
    let deudaTotal = 0;
    let deudaVencida = 0;
    let deudaNoVencida = 0;
    let tieneDeuda = false;

    for (const cuenta of grupo.cuentas) {
      const resultado = cache[cuenta];

      if (!resultado) continue;

      deudaTotal += moneda(resultado.deudaTotal);
      deudaVencida += moneda(resultado.deudaVencida);
      deudaNoVencida += moneda(
        resultado.deudaNoVencida
      );

      if (resultado.estado === "CON DEUDA") {
        tieneDeuda = true;
      }
    }

    filas.push({
      inquilino: grupo.inquilino,
      cantidadCuentas: grupo.cuentas.size,
      cuentas: [...grupo.cuentas].join(" | "),
      deudaVencida,
      deudaNoVencida,
      deudaTotal,
      estado: tieneDeuda
        ? "CON DEUDA"
        : "SIN DEUDA",
    });
  }

  return filas.sort(
    (a, b) => b.deudaTotal - a.deudaTotal
  );
}

// ------------------------------------------------------------
// DETALLE DE FACTURAS
// ------------------------------------------------------------

function crearDetalle(registros, cache) {
  const filas = [];

  /*
    Usamos Set para no repetir exactamente la misma
    combinación inquilino + cuenta + factura.
  */
  const existentes = new Set();

  for (const registro of registros) {
    if (!registro.cuenta) continue;

    const resultado = cache[registro.cuenta];

    if (!resultado || !resultado.facturas) {
      continue;
    }

    for (const factura of resultado.facturas) {
      const clave = [
        registro.inquilino,
        registro.cuenta,
        factura.numeroFactura,
        factura.cuota,
      ].join("|");

      if (existentes.has(clave)) {
        continue;
      }

      existentes.add(clave);

      filas.push({
        inquilino: registro.inquilino || "",
        propietario: registro.propietario || "",
        cuenta: registro.cuenta,
        periodo: factura.periodo || "",
        cuota: factura.cuota || "",
        numeroFactura:
          factura.numeroFactura || "",
        vencimiento:
          factura.vencimiento || "",
        estado: factura.estado || "",
        importeHistorico:
          moneda(factura.importeHistorico),
        recargo: moneda(factura.recargo),
        importe: moneda(factura.importe),
      });
    }
  }

  return filas;
}

// ------------------------------------------------------------
// OBSERVACIONES
// ------------------------------------------------------------

function crearObservaciones(registros) {
  return registros
    .filter((r) => !r.valida)
    .map((r) => ({
      filaExcel: r.filaExcel,
      inquilino: r.inquilino,
      propietario: r.propietario,
      valorAYSAM: r.valorOriginal,
      motivo: r.motivo,
    }));
}

// ------------------------------------------------------------
// ESTILOS
// ------------------------------------------------------------

function tituloHoja(
  ws,
  rango,
  titulo,
  subtitulo
) {
  ws.mergeCells(rango);

  const celda = ws.getCell(
    rango.split(":")[0]
  );

  celda.value = titulo;

  celda.font = {
    name: "Aptos Display",
    size: 18,
    bold: true,
    color: {
      argb: COLORS.blanco,
    },
  };

  celda.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: COLORS.azul,
    },
  };

  celda.alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  ws.getRow(1).height = 34;

  const ultimaColumna = rango
    .split(":")[1]
    .replace(/\d/g, "");

  ws.mergeCells(
    `A2:${ultimaColumna}2`
  );

  const sub = ws.getCell("A2");

  sub.value = subtitulo;

  sub.font = {
    name: "Aptos",
    size: 10,
    italic: true,
    color: {
      argb: COLORS.gris,
    },
  };

  sub.alignment = {
    horizontal: "center",
  };
}

function estiloEncabezado(row) {
  row.eachCell((cell) => {
    cell.font = {
      name: "Aptos",
      size: 10,
      bold: true,
      color: {
        argb: COLORS.blanco,
      },
    };

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: COLORS.azulMedio,
      },
    };

    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };

    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });

  row.height = 30;
}

function estiloCuerpo(
  ws,
  filaInicial,
  filaFinal,
  columnas
) {
  for (
    let fila = filaInicial;
    fila <= filaFinal;
    fila++
  ) {
    const row = ws.getRow(fila);

    for (
      let col = 1;
      col <= columnas;
      col++
    ) {
      const cell = row.getCell(col);

      cell.font = {
        name: "Aptos",
        size: 10,
      };

      cell.alignment = {
        vertical: "center",
        wrapText: true,
      };

      cell.border = {
        bottom: {
          style: "hair",
          color: {
            argb: "D9D9D9",
          },
        },
      };
    }
  }
}

function estados(ws, columna, inicio, fin) {
  for (
    let fila = inicio;
    fila <= fin;
    fila++
  ) {
    const cell = ws.getCell(
      `${columna}${fila}`
    );

    if (cell.value === "CON DEUDA") {
      cell.font = {
        bold: true,
        color: {
          argb: COLORS.rojo,
        },
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: COLORS.rojoClaro,
        },
      };
    }

    if (cell.value === "SIN DEUDA") {
      cell.font = {
        bold: true,
        color: {
          argb: COLORS.verde,
        },
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: COLORS.verdeClaro,
        },
      };
    }

    if (cell.value === "ERROR") {
      cell.font = {
        bold: true,
        color: {
          argb: COLORS.rojo,
        },
      };
    }
  }
}

function configurarFiltro(
  ws,
  filaEncabezado
) {
  ws.views = [
    {
      state: "frozen",
      ySplit: filaEncabezado,
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

// ------------------------------------------------------------
// DASHBOARD
// ------------------------------------------------------------

function crearDashboard(
  workbook,
  filasCuentas,
  filasInquilinos,
  filasObservaciones
) {
  const ws =
    workbook.addWorksheet("Dashboard");

  ws.views = [
    {
      showGridLines: false,
    },
  ];

  ws.columns = [
    { width: 4 },
    { width: 24 },
    { width: 24 },
    { width: 4 },
    { width: 24 },
    { width: 24 },
  ];

  ws.mergeCells("B2:F3");

  const titulo = ws.getCell("B2");

  titulo.value = "DEUDAS AYSAM";

  titulo.font = {
    name: "Aptos Display",
    size: 24,
    bold: true,
    color: {
      argb: COLORS.blanco,
    },
  };

  titulo.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: COLORS.azul,
    },
  };

  titulo.alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  ws.getRow(2).height = 25;
  ws.getRow(3).height = 25;

  ws.mergeCells("B4:F4");

  ws.getCell("B4").value =
    `Informe generado: ${new Date().toLocaleString(
      "es-AR"
    )}`;

  ws.getCell("B4").font = {
    italic: true,
    size: 10,
    color: {
      argb: COLORS.gris,
    },
  };

  ws.getCell("B4").alignment = {
    horizontal: "center",
  };

  const totalCuentas = filasCuentas.length;

  const cuentasConDeuda =
    filasCuentas.filter(
      (r) => r.estado === "CON DEUDA"
    ).length;

  const cuentasSinDeuda =
    filasCuentas.filter(
      (r) => r.estado === "SIN DEUDA"
    ).length;

  const cuentasError =
    filasCuentas.filter(
      (r) => r.estado === "ERROR"
    ).length;

  const inquilinosConDeuda =
    filasInquilinos.filter(
      (r) => r.estado === "CON DEUDA"
    ).length;

  const deudaVencida =
    filasCuentas.reduce(
      (sum, r) =>
        sum + moneda(r.deudaVencida),
      0
    );

  const deudaNoVencida =
    filasCuentas.reduce(
      (sum, r) =>
        sum + moneda(r.deudaNoVencida),
      0
    );

  const deudaTotal =
    filasCuentas.reduce(
      (sum, r) =>
        sum + moneda(r.deudaTotal),
      0
    );

  tarjeta(
    ws,
    "B6",
    "C8",
    "CUENTAS ANALIZADAS",
    totalCuentas,
    COLORS.azulMedio
  );

  tarjeta(
    ws,
    "E6",
    "F8",
    "CUENTAS CON DEUDA",
    cuentasConDeuda,
    COLORS.rojo
  );

  tarjeta(
    ws,
    "B10",
    "C12",
    "CUENTAS SIN DEUDA",
    cuentasSinDeuda,
    COLORS.verde
  );

  tarjeta(
    ws,
    "E10",
    "F12",
    "INQUILINOS CON DEUDA",
    inquilinosConDeuda,
    COLORS.amarillo
  );

  ws.mergeCells("B14:F16");

  const total = ws.getCell("B14");

  total.value = deudaTotal;
  total.numFmt = '$ #,##0.00';

  total.font = {
    name: "Aptos Display",
    size: 26,
    bold: true,
    color: {
      argb: COLORS.blanco,
    },
  };

  total.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: COLORS.rojo,
    },
  };

  total.alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  ws.mergeCells("B17:F17");

  ws.getCell("B17").value =
    "DEUDA TOTAL PENDIENTE";

  ws.getCell("B17").font = {
    bold: true,
    color: {
      argb: COLORS.gris,
    },
  };

  ws.getCell("B17").alignment = {
    horizontal: "center",
  };

  // Resumen financiero
  ws.mergeCells("B20:F20");

  ws.getCell("B20").value =
    "RESUMEN FINANCIERO";

  ws.getCell("B20").font = {
    size: 14,
    bold: true,
    color: {
      argb: COLORS.azul,
    },
  };

  const datos = [
    ["Concepto", "Importe"],
    ["Deuda vencida", deudaVencida],
    ["Deuda no vencida", deudaNoVencida],
    ["Deuda total", deudaTotal],
  ];

  datos.forEach((fila, index) => {
    const row = ws.getRow(22 + index);

    row.values = fila;

    if (index === 0) {
      estiloEncabezado(row);
    } else {
      row.getCell(2).numFmt =
        '$ #,##0.00';
    }
  });

  estiloCuerpo(ws, 23, 25, 2);

  ws.getCell("B25").font = {
    bold: true,
  };

  ws.getCell("C25").font = {
    bold: true,
    color: {
      argb: COLORS.rojo,
    },
  };

  ws.getCell("B27").value =
    "Observaciones:";

  ws.getCell("C27").value =
    filasObservaciones.length;

  ws.getCell("B27").font = {
    bold: true,
  };

  return ws;
}

function tarjeta(
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
    color: {
      argb: COLORS.blanco,
    },
  };

  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: color,
    },
  };

  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
}

// ------------------------------------------------------------
// HOJA CUENTAS
// ------------------------------------------------------------

function crearHojaCuentas(
  workbook,
  filas
) {
  const ws =
    workbook.addWorksheet("Cuentas");

  tituloHoja(
    ws,
    "A1:M1",
    "DETALLE DE CUENTAS AYSAM",
    `Generado: ${new Date().toLocaleString(
      "es-AR"
    )}`
  );

  const header = ws.getRow(4);

  header.values = [
    "Cuenta",
    "Inquilinos",
    "Propietarios",
    "Titular AYSAM",
    "Domicilio",
    "Estado",
    "Facturas",
    "Deuda vencida",
    "Deuda no vencida",
    "Deuda total",
    "Próxima factura",
    "Próximo vencimiento",
    "Plan de pago",
  ];

  estiloEncabezado(header);

  filas.forEach((fila, index) => {
    const row = ws.getRow(index + 5);

    row.values = [
      fila.cuenta,
      fila.inquilinos.join(" | "),
      fila.propietarios.join(" | "),
      fila.titular,
      fila.domicilio,
      fila.estado,
      fila.cantidadFacturas,
      fila.deudaVencida,
      fila.deudaNoVencida,
      fila.deudaTotal,
      fila.proximaFactura,
      fila.proximoVencimiento,
      fila.tienePlanPago,
    ];

    row.getCell(8).numFmt =
      '$ #,##0.00';

    row.getCell(9).numFmt =
      '$ #,##0.00';

    row.getCell(10).numFmt =
      '$ #,##0.00';
  });

  if (filas.length) {
    estiloCuerpo(
      ws,
      5,
      filas.length + 4,
      13
    );

    estados(
      ws,
      "F",
      5,
      filas.length + 4
    );
  }

  const anchos = [
    20, 38, 38, 34, 50, 18, 12,
    18, 18, 18, 18, 20, 14,
  ];

  anchos.forEach((ancho, i) => {
    ws.getColumn(i + 1).width = ancho;
  });

  configurarFiltro(ws, 4);

  return ws;
}

// ------------------------------------------------------------
// HOJA INQUILINOS
// ------------------------------------------------------------

function crearHojaInquilinos(
  workbook,
  filas
) {
  const ws =
    workbook.addWorksheet(
      "Resumen Inquilinos"
    );

  tituloHoja(
    ws,
    "A1:F1",
    "RESUMEN DE DEUDAS POR INQUILINO",
    `Generado: ${new Date().toLocaleString(
      "es-AR"
    )}`
  );

  const header = ws.getRow(4);

  header.values = [
    "Inquilino",
    "Cantidad de cuentas",
    "Cuentas",
    "Deuda vencida",
    "Deuda no vencida",
    "Deuda total / asociada",
  ];

  estiloEncabezado(header);

  filas.forEach((fila, index) => {
    const row = ws.getRow(index + 5);

    row.values = [
      fila.inquilino,
      fila.cantidadCuentas,
      fila.cuentas,
      fila.deudaVencida,
      fila.deudaNoVencida,
      fila.deudaTotal,
    ];

    row.getCell(4).numFmt =
      '$ #,##0.00';

    row.getCell(5).numFmt =
      '$ #,##0.00';

    row.getCell(6).numFmt =
      '$ #,##0.00';
  });

  if (filas.length) {
    estiloCuerpo(
      ws,
      5,
      filas.length + 4,
      6
    );
  }

  ws.getColumn(1).width = 40;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 42;
  ws.getColumn(4).width = 20;
  ws.getColumn(5).width = 20;
  ws.getColumn(6).width = 22;

  configurarFiltro(ws, 4);

  return ws;
}

// ------------------------------------------------------------
// HOJA DETALLE
// ------------------------------------------------------------

function crearHojaDetalle(
  workbook,
  filas
) {
  const ws =
    workbook.addWorksheet("Detalle");

  tituloHoja(
    ws,
    "A1:K1",
    "DETALLE DE FACTURAS PENDIENTES",
    `Generado: ${new Date().toLocaleString(
      "es-AR"
    )}`
  );

  const header = ws.getRow(4);

  header.values = [
    "Inquilino",
    "Propietario",
    "Cuenta",
    "Período",
    "Cuota",
    "Factura",
    "Vencimiento",
    "Estado",
    "Importe histórico",
    "Recargo",
    "Importe total",
  ];

  estiloEncabezado(header);

  filas.forEach((fila, index) => {
    const row = ws.getRow(index + 5);

    row.values = [
      fila.inquilino,
      fila.propietario,
      fila.cuenta,
      fila.periodo,
      fila.cuota,
      fila.numeroFactura,
      fila.vencimiento,
      fila.estado,
      fila.importeHistorico,
      fila.recargo,
      fila.importe,
    ];

    row.getCell(9).numFmt =
      '$ #,##0.00';

    row.getCell(10).numFmt =
      '$ #,##0.00';

    row.getCell(11).numFmt =
      '$ #,##0.00';
  });

  if (filas.length) {
    estiloCuerpo(
      ws,
      5,
      filas.length + 4,
      11
    );
  }

  ws.getColumn(1).width = 38;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 16;
  ws.getColumn(7).width = 18;
  ws.getColumn(8).width = 16;
  ws.getColumn(9).width = 20;
  ws.getColumn(10).width = 16;
  ws.getColumn(11).width = 18;

  configurarFiltro(ws, 4);

  return ws;
}

// ------------------------------------------------------------
// HOJA OBSERVACIONES
// ------------------------------------------------------------

function crearHojaObservaciones(
  workbook,
  filas
) {
  const ws =
    workbook.addWorksheet("Observaciones");

  tituloHoja(
    ws,
    "A1:E1",
    "OBSERVACIONES DEL ARCHIVO ORIGINAL",
    "Registros que no fueron enviados a AYSAM"
  );

  const header = ws.getRow(4);

  header.values = [
    "Fila Excel",
    "Inquilino",
    "Propietario",
    "Valor AYSAM",
    "Motivo",
  ];

  estiloEncabezado(header);

  filas.forEach((fila, index) => {
    const row = ws.getRow(index + 5);

    row.values = [
      fila.filaExcel,
      fila.inquilino,
      fila.propietario,
      fila.valorAYSAM,
      fila.motivo,
    ];
  });

  if (filas.length) {
    estiloCuerpo(
      ws,
      5,
      filas.length + 4,
      5
    );
  }

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 38;
  ws.getColumn(4).width = 25;
  ws.getColumn(5).width = 22;

  configurarFiltro(ws, 4);

  return ws;
}

// ------------------------------------------------------------
// EXPORTACIÓN
// ------------------------------------------------------------

async function generarExcel(
  registros,
  cache
) {
  fs.mkdirSync(
    RESULTADOS_DIR,
    { recursive: true }
  );

  const cuentas =
    crearFilasCuentas(
      registros,
      cache
    );

  const inquilinos =
    crearResumenInquilinos(
      registros,
      cache
    );

  const detalle =
    crearDetalle(
      registros,
      cache
    );

  const observaciones =
    crearObservaciones(
      registros
    );

  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    "AYSAM - Consulta de Deudas";

  workbook.created =
    new Date();

  crearDashboard(
    workbook,
    cuentas,
    inquilinos,
    observaciones
  );

  crearHojaInquilinos(
    workbook,
    inquilinos
  );

  crearHojaCuentas(
    workbook,
    cuentas
  );

  crearHojaDetalle(
    workbook,
    detalle
  );

  crearHojaObservaciones(
    workbook,
    observaciones
  );

  await workbook.xlsx.writeFile(
    ARCHIVO_SALIDA
  );

  return ARCHIVO_SALIDA;
}
module.exports = {
  generarExcel,
  crearFilasCuentas,
};