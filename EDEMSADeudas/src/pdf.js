const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

function pesos(valor) {
  return new Intl.NumberFormat(
    "es-AR",
    {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
    }
  ).format(Number(valor || 0));
}

function texto(valor) {
  return String(valor || "").trim();
}

function truncar(valor, max) {
  const t = texto(valor);

  if (t.length <= max) {
    return t;
  }

  return t.substring(0, max - 3) + "...";
}

function asegurarPagina(
  doc,
  alturaNecesaria
) {
  if (
    doc.y + alturaNecesaria >
    745
  ) {
    doc.addPage();
  }
}

function encabezadoPagina(doc, titulo) {
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(titulo);

  doc.moveDown(0.3);

  doc
    .moveTo(45, doc.y)
    .lineTo(550, doc.y)
    .stroke();

  doc.moveDown(0.5);
}

function crearPDF(
  resultados,
  observaciones,
  salida
) {
  const carpeta =
    path.dirname(salida);

  if (!fs.existsSync(carpeta)) {
    fs.mkdirSync(carpeta, {
      recursive: true,
    });
  }

  const doc =
    new PDFDocument({
      size: "A4",
      margin: 45,
      bufferPages: true,
      info: {
        Title:
          "EDEMSA - Reporte de Deudas",
        Author:
          "EDEMSA Deudas",
      },
    });

  doc.pipe(
    fs.createWriteStream(salida)
  );

  const conDeuda =
    resultados.filter(
      (r) =>
        Number(r.deudaTotal || 0) >
        0
    );

  const sinDeuda =
    resultados.filter(
      (r) =>
        Number(r.deudaTotal || 0) ===
        0
    );

  const totalDeuda =
    conDeuda.reduce(
      (sum, r) =>
        sum +
        Number(r.deudaTotal || 0),
      0
    );

  const cuotas =
    resultados.reduce(
      (sum, r) =>
        sum +
        Number(
          r.cantidadPendientes || 0
        ),
      0
    );

  // ==================================================
  // PORTADA / RESUMEN
  // ==================================================

  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(
      "EDEMSA",
      {
        align: "center",
      }
    );

  doc.moveDown(0.2);

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(
      "REPORTE DE DEUDAS",
      {
        align: "center",
      }
    );

  doc.moveDown(0.5);

  doc
    .font("Helvetica")
    .fontSize(9)
    .text(
      `Generado: ${new Date().toLocaleString(
        "es-AR"
      )}`,
      {
        align: "center",
      }
    );

  doc.moveDown(2);

  // Caja resumen

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(
      "RESUMEN GENERAL"
    );

  doc.moveDown(0.7);

  const resumen = [
    [
      "NIC procesados",
      resultados.length,
    ],
    [
      "NIC con deuda",
      conDeuda.length,
    ],
    [
      "NIC sin deuda",
      sinDeuda.length,
    ],
    [
      "Cuotas pendientes",
      cuotas,
    ],
    [
      "TOTAL ADEUDADO",
      pesos(totalDeuda),
    ],
  ];

  for (const [label, valor] of resumen) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`${label}: `, {
        continued: true,
      });

    doc
      .font("Helvetica")
      .text(String(valor));

    doc.moveDown(0.2);
  }

  doc.moveDown(1);

  // ==================================================
  // LISTADO GENERAL
  // ==================================================

  encabezadoPagina(
    doc,
    "LISTADO GENERAL"
  );

  doc
    .font("Helvetica-Bold")
    .fontSize(8);

  doc.text(
    "NIC",
    45,
    doc.y,
    {
      continued: true,
      width: 55,
    }
  );

  doc.text(
    "INQUILINO",
    100,
    doc.y,
    {
      continued: true,
      width: 180,
    }
  );

  doc.text(
    "PROPIETARIO",
    280,
    doc.y,
    {
      continued: true,
      width: 150,
    }
  );

  doc.text(
    "DEUDA",
    430,
    doc.y,
    {
      width: 115,
      align: "right",
    }
  );

  doc.moveDown(0.5);

  for (const r of resultados) {
    asegurarPagina(
      doc,
      18
    );

    const y = doc.y;

    doc
      .font("Helvetica")
      .fontSize(7.5);

    doc.text(
      texto(r.nic),
      45,
      y,
      {
        continued: true,
        width: 55,
      }
    );

    doc.text(
      truncar(
        (r.inquilinos || []).join(
          ", "
        ),
        32
      ),
      100,
      y,
      {
        continued: true,
        width: 180,
      }
    );

    doc.text(
      truncar(
        (r.propietarios || []).join(
          ", "
        ),
        28
      ),
      280,
      y,
      {
        continued: true,
        width: 150,
      }
    );

    doc.text(
      Number(r.deudaTotal || 0) >
        0
        ? pesos(r.deudaTotal)
        : "$ 0,00",
      430,
      y,
      {
        width: 115,
        align: "right",
      }
    );

    doc.moveDown(0.38);

    doc
      .moveTo(45, doc.y)
      .lineTo(545, doc.y)
      .stroke();
  }

  // ==================================================
  // DETALLE DE DEUDORES
  // ==================================================

  doc.addPage();

  encabezadoPagina(
    doc,
    "DETALLE DE DEUDAS"
  );

  for (const r of conDeuda) {
    const pendientes =
      r.pendientes || [];

    const altoEstimado =
      80 +
      pendientes.length * 34;

    asegurarPagina(
      doc,
      Math.min(
        altoEstimado,
        300
      )
    );

    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(
        `NIC ${r.nic}`
      );

    doc.moveDown(0.2);

    doc
      .font("Helvetica")
      .fontSize(8.5)
      .text(
        `Inquilino/s: ${truncar(
          (r.inquilinos || []).join(
            ", "
          ),
          90
        )}`
      )
      .text(
        `Propietario/s: ${truncar(
          (r.propietarios || []).join(
            ", "
          ),
          90
        )}`
      )
      .text(
        `Titular EDEMSA: ${truncar(
          r.titular,
          90
        )}`
      )
      .text(
        `Dirección: ${truncar(
          r.direccion,
          105
        )}`
      );

    doc.moveDown(0.4);

    // Encabezado tabla
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5);

    doc.text(
      "FACTURA",
      45,
      doc.y,
      {
        continued: true,
        width: 125,
      }
    );

    doc.text(
      "TIPO / PERIODO",
      170,
      doc.y,
      {
        continued: true,
        width: 130,
      }
    );

    doc.text(
      "CUOTA",
      300,
      doc.y,
      {
        continued: true,
        width: 45,
      }
    );

    doc.text(
      "VTO.",
      345,
      doc.y,
      {
        continued: true,
        width: 75,
      }
    );

    doc.text(
      "IMPORTE",
      420,
      doc.y,
      {
        width: 125,
        align: "right",
      }
    );

    doc.moveDown(0.4);

    for (const f of pendientes) {
      asegurarPagina(
        doc,
        18
      );

      const y = doc.y;

      doc
        .font("Helvetica")
        .fontSize(7.5);

      doc.text(
        truncar(f.numero, 20),
        45,
        y,
        {
          continued: true,
          width: 125,
        }
      );

      const tipoPeriodo =
        f.tipo === "FACTURA"
          ? `Factura ${f.periodo || ""}`
          : truncar(
              f.tipo || "",
              25
            );

      doc.text(
        tipoPeriodo,
        170,
        y,
        {
          continued: true,
          width: 130,
        }
      );

      doc.text(
        String(f.cuota || ""),
        300,
        y,
        {
          continued: true,
          width: 45,
        }
      );

      doc.text(
        texto(
          f.vencimiento
        ),
        345,
        y,
        {
          continued: true,
          width: 75,
        }
      );

      doc.text(
        pesos(f.importe),
        420,
        y,
        {
          width: 125,
          align: "right",
        }
      );

      doc.moveDown(0.4);
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(
        `DEUDA TOTAL: ${pesos(
          r.deudaTotal
        )}`,
        {
          align: "right",
        }
      );

    doc.moveDown(0.7);

    doc
      .moveTo(45, doc.y)
      .lineTo(550, doc.y)
      .stroke();

    doc.moveDown(0.7);
  }

  // ==================================================
  // OBSERVACIONES
  // ==================================================

  if (
    observaciones &&
    observaciones.registros &&
    observaciones.registros.length
  ) {
    doc.addPage();

    encabezadoPagina(
      doc,
      "OBSERVACIONES"
    );

    doc
      .font("Helvetica")
      .fontSize(9)
      .text(
        "Registros del Excel que no pudieron asociarse a un NIC EDEMSA válido."
      );

    doc.moveDown();

    for (const r of observaciones.registros) {
      asegurarPagina(
        doc,
        45
      );

      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text(
          `NIC: ${
            r.nic || "(vacío)"
          }`
        );

      doc
        .font("Helvetica")
        .fontSize(8)
        .text(
          `Inquilino: ${
            r.inquilino || "-"
          }`
        )
        .text(
          `Propietario: ${
            r.propietario || "-"
          }`
        )
        .text(
          `Observación: ${
            r.nic
              ? "NIC inválido"
              : "NIC vacío"
          }`
        );

      doc.moveDown(0.6);
    }
  }

  // ==================================================
  // NUMERO DE PAGINA
  // ==================================================

  const rango =
    doc.bufferedPageRange();

  for (
    let i = 0;
    i < rango.count;
    i++
  ) {
    doc.switchToPage(
      rango.start + i
    );

    doc
      .font("Helvetica")
      .fontSize(7)
      .text(
        `EDEMSA - Página ${
          i + 1
        } de ${rango.count}`,
        45,
        780,
        {
          width: 505,
          align: "center",
        }
      );
  }

  doc.end();

  console.log(
    `✓ PDF final generado: ${salida}`
  );
}

module.exports = {
  crearPDF,
};