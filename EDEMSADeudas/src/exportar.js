const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

function dinero(valor) {
  return Number(valor || 0);
}

function nombre(r) {
  return (r.inquilinos || []).join(", ");
}

function propietarios(r) {
  return (r.propietarios || []).join(", ");
}

function aplicarHeader(worksheet) {
  const row = worksheet.getRow(1);

  row.height = 28;

  row.eachCell((cell) => {
    cell.font = {
      bold: true,
      size: 10,
    };

    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  });

  worksheet.views = [
    {
      state: "frozen",
      ySplit: 1,
    },
  ];

  worksheet.autoFilter = {
    from: {
      row: 1,
      column: 1,
    },
    to: {
      row: 1,
      column: worksheet.columnCount,
    },
  };
}

function aplicarCuerpo(worksheet) {
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    row.height = 24;

    row.eachCell((cell) => {
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
      };

      cell.font = {
        size: 10,
      };
    });
  });
}

async function generarExcel(
  resultados,
  observaciones,
  salida
) {
  const workbook =
    new ExcelJS.Workbook();

  workbook.creator =
    "EDEMSA Deudas";

  workbook.created =
    new Date();

  // ==================================================
  // CLASIFICACION
  // ==================================================

  const conDeuda =
    resultados.filter(
      (r) =>
        dinero(r.deudaTotal) > 0
    );

  const sinDeuda =
    resultados.filter(
      (r) =>
        dinero(r.deudaTotal) === 0
    );

  const totalDeuda =
    conDeuda.reduce(
      (sum, r) =>
        sum + dinero(r.deudaTotal),
      0
    );

  const totalPendientes =
    resultados.reduce(
      (sum, r) =>
        sum +
        Number(
          r.cantidadPendientes || 0
        ),
      0
    );

  // ==================================================
  // RESUMEN
  // ==================================================

  const resumen =
    workbook.addWorksheet(
      "Resumen"
    );

  resumen.mergeCells(
    "A1:H1"
  );

  resumen.getCell("A1").value =
    "EDEMSA - REPORTE DE DEUDAS";

  resumen.getCell("A1").font = {
    bold: true,
    size: 20,
  };

  resumen.getCell("A1").alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  resumen.getRow(1).height = 34;

  resumen.mergeCells(
    "A2:H2"
  );

  resumen.getCell("A2").value =
    `Generado: ${new Date().toLocaleString(
      "es-AR"
    )}`;

  resumen.getCell("A2").alignment = {
    horizontal: "center",
  };

  // KPI

  const kpis = [
    [
      "NIC procesados",
      resultados.length,
    ],
    [
      "Con deuda",
      conDeuda.length,
    ],
    [
      "Sin deuda",
      sinDeuda.length,
    ],
    [
      "Cuotas pendientes",
      totalPendientes,
    ],
    [
      "Total adeudado",
      totalDeuda,
    ],
    [
      "Observaciones",
      observaciones?.registros?.length || 0,
    ],
  ];

  let fila = 4;

  for (const [etiqueta, valor] of kpis) {
    resumen.getCell(
      `A${fila}`
    ).value = etiqueta;

    resumen.getCell(
      `B${fila}`
    ).value = valor;

    resumen.getCell(
      `A${fila}`
    ).font = {
      bold: true,
    };

    resumen.getCell(
      `A${fila}`
    ).alignment = {
      vertical: "middle",
    };

    if (
      etiqueta ===
      "Total adeudado"
    ) {
      resumen.getCell(
        `B${fila}`
      ).numFmt =
        '$ #,##0.00';
    }

    fila++;
  }

  resumen.getColumn("A").width =
    25;

  resumen.getColumn("B").width =
    20;

  // ==================================================
  // HOJA DEUDAS
  // ==================================================

  const hojaDeudas =
    workbook.addWorksheet(
      "Deudas"
    );

  hojaDeudas.columns = [
    {
      header: "NIC",
      key: "nic",
      width: 14,
    },
    {
      header: "Inquilino/s",
      key: "inquilino",
      width: 34,
    },
    {
      header: "Propietario/s",
      key: "propietario",
      width: 34,
    },
    {
      header: "Titular EDEMSA",
      key: "titular",
      width: 32,
    },
    {
      header: "Dirección",
      key: "direccion",
      width: 42,
    },
    {
      header: "Pendientes",
      key: "pendientes",
      width: 12,
    },
    {
      header: "Deuda total",
      key: "deuda",
      width: 18,
    },
  ];

  for (const r of conDeuda) {
    hojaDeudas.addRow({
      nic: r.nic,
      inquilino: nombre(r),
      propietario: propietarios(r),
      titular: r.titular || "",
      direccion: r.direccion || "",
      pendientes:
        r.cantidadPendientes || 0,
      deuda:
        dinero(r.deudaTotal),
    });
  }

  aplicarHeader(
    hojaDeudas
  );
  aplicarCuerpo(
    hojaDeudas
  );

  hojaDeudas
    .getColumn("G")
    .numFmt =
    '$ #,##0.00';

  // ==================================================
  // TODAS LAS FACTURAS PENDIENTES
  // ==================================================

  const facturas =
    workbook.addWorksheet(
      "Facturas"
    );

  facturas.columns = [
    {
      header: "NIC",
      key: "nic",
      width: 14,
    },
    {
      header: "Inquilino/s",
      key: "inquilino",
      width: 30,
    },
    {
      header: "Factura",
      key: "factura",
      width: 23,
    },
    {
      header: "Tipo",
      key: "tipo",
      width: 35,
    },
    {
      header: "Período",
      key: "periodo",
      width: 14,
    },
    {
      header: "Cuota",
      key: "cuota",
      width: 10,
    },
    {
      header: "Vencimiento",
      key: "vencimiento",
      width: 16,
    },
    {
      header: "Estado",
      key: "estado",
      width: 15,
    },
    {
      header: "Importe",
      key: "importe",
      width: 18,
    },
  ];

  for (const r of resultados) {
    for (const f of r.pendientes || []) {
      facturas.addRow({
        nic: r.nic,
        inquilino: nombre(r),
        factura: f.numero,
        tipo: f.tipo || "",
        periodo: f.periodo || "",
        cuota: f.cuota,
        vencimiento:
          f.vencimiento || "",
        estado: f.estado,
        importe:
          dinero(f.importe),
      });
    }
  }

  aplicarHeader(
    facturas
  );

  aplicarCuerpo(
    facturas
  );

  facturas
    .getColumn("I")
    .numFmt =
    '$ #,##0.00';

  // ==================================================
  // SIN DEUDA
  // ==================================================

  const hojaSinDeuda =
    workbook.addWorksheet(
      "Sin deuda"
    );

  hojaSinDeuda.columns = [
    {
      header: "NIC",
      key: "nic",
      width: 14,
    },
    {
      header: "Inquilino/s",
      key: "inquilino",
      width: 34,
    },
    {
      header: "Propietario/s",
      key: "propietario",
      width: 34,
    },
    {
      header: "Titular EDEMSA",
      key: "titular",
      width: 32,
    },
    {
      header: "Dirección",
      key: "direccion",
      width: 42,
    },
    {
      header: "Estado",
      key: "estado",
      width: 15,
    },
  ];

  for (const r of sinDeuda) {
    hojaSinDeuda.addRow({
      nic: r.nic,
      inquilino: nombre(r),
      propietario: propietarios(r),
      titular: r.titular || "",
      direccion: r.direccion || "",
      estado: "SIN DEUDA",
    });
  }

  aplicarHeader(
    hojaSinDeuda
  );

  aplicarCuerpo(
    hojaSinDeuda
  );

  // ==================================================
  // OBSERVACIONES
  // ==================================================

  const hojaObs =
    workbook.addWorksheet(
      "Observaciones"
    );

  hojaObs.columns = [
    {
      header: "Inquilino",
      key: "inquilino",
      width: 34,
    },
    {
      header: "Propietario",
      key: "propietario",
      width: 34,
    },
    {
      header: "NIC",
      key: "nic",
      width: 20,
    },
    {
      header: "Observación",
      key: "observacion",
      width: 30,
    },
  ];

  for (
    const r of
      observaciones?.registros || []
  ) {
    hojaObs.addRow({
      inquilino:
        r.inquilino || "",
      propietario:
        r.propietario || "",
      nic:
        r.nic || "",
      observacion:
        r.nic
          ? "NIC inválido"
          : "NIC vacío",
    });
  }

  aplicarHeader(
    hojaObs
  );

  aplicarCuerpo(
    hojaObs
  );

  // ==================================================
  // TABLA GENERAL DE RESUMEN
  // ==================================================

  resumen.getCell("D4").value =
    "Top deudores";

  resumen.getCell("D4").font = {
    bold: true,
    size: 12,
  };

  resumen.getCell("D5").value =
    "NIC";

  resumen.getCell("E5").value =
    "Inquilino";

  resumen.getCell("F5").value =
    "Deuda";

  ["D5", "E5", "F5"].forEach(
    (celda) => {
      resumen.getCell(
        celda
      ).font = {
        bold: true,
      };
    }
  );

  const ranking =
    [...conDeuda]
      .sort(
        (a, b) =>
          dinero(b.deudaTotal) -
          dinero(a.deudaTotal)
      )
      .slice(0, 10);

  ranking.forEach(
    (r, i) => {
      const row =
        6 + i;

      resumen.getCell(
        `D${row}`
      ).value = r.nic;

      resumen.getCell(
        `E${row}`
      ).value = nombre(r);

      resumen.getCell(
        `F${row}`
      ).value =
        dinero(r.deudaTotal);

      resumen.getCell(
        `F${row}`
      ).numFmt =
        '$ #,##0.00';
    }
  );

  resumen.getColumn("D").width =
    14;
  resumen.getColumn("E").width =
    34;
  resumen.getColumn("F").width =
    18;

  // ==================================================
  // FORMATO GENERAL
  // ==================================================

  for (
    const hoja
    of workbook.worksheets
  ) {
    hoja.eachRow(
      (row) => {
        row.eachCell(
          (cell) => {
            cell.alignment = {
              vertical: "middle",
              wrapText: true,
            };
          }
        );
      }
    );
  }

  const carpeta =
    path.dirname(salida);

  if (!fs.existsSync(carpeta)) {
    fs.mkdirSync(carpeta, {
      recursive: true,
    });
  }

  await workbook.xlsx.writeFile(
    salida
  );

  console.log(
    `✓ Excel final generado: ${salida}`
  );
}

module.exports = {
  generarExcel,
};