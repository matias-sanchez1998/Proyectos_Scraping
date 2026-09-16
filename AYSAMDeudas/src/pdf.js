const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const RESULTADOS_DIR = path.join(
  __dirname,
  "..",
  "resultados"
);

const ARCHIVO_PDF = path.join(
  RESULTADOS_DIR,
  "Deudas_AYSAM_Cuentas.pdf"
);

const MARGEN = 30;
const ANCHO_PAGINA = 841.89;
const ALTO_PAGINA = 595.28;

function moneda(valor) {
  return Number(valor || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function crearPDF(filasCuentas) {
  fs.mkdirSync(RESULTADOS_DIR, {
    recursive: true,
  });

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: {
      top: MARGEN,
      bottom: MARGEN,
      left: MARGEN,
      right: MARGEN,
    },
  });

  const stream = fs.createWriteStream(ARCHIVO_PDF);

  doc.pipe(stream);

  const azul = "#1F4E78";
  const azulMedio = "#4472C4";
  const gris = "#666666";
  const rojo = "#C00000";
  const verde = "#548235";
  const fondoGris = "#F2F2F2";
  const blanco = "#FFFFFF";

  // ==========================================================
  // RESUMEN
  // ==========================================================

  const totalCuentas = filasCuentas.length;

  const conDeuda = filasCuentas.filter(
    (r) => r.estado === "CON DEUDA"
  ).length;

  const sinDeuda = filasCuentas.filter(
    (r) => r.estado === "SIN DEUDA"
  ).length;

  const deudaVencida = filasCuentas.reduce(
    (sum, r) => sum + Number(r.deudaVencida || 0),
    0
  );

  const deudaNoVencida = filasCuentas.reduce(
    (sum, r) => sum + Number(r.deudaNoVencida || 0),
    0
  );

  const deudaTotal = filasCuentas.reduce(
    (sum, r) => sum + Number(r.deudaTotal || 0),
    0
  );

  // ==========================================================
  // FUNCIÓN PARA ENCABEZADO DE CADA PÁGINA
  // ==========================================================

  function encabezado(inicial = false) {
    if (inicial) {
      doc.rect(
        MARGEN,
        MARGEN,
        ANCHO_PAGINA - MARGEN * 2,
        50
      ).fill(azul);

      doc
        .fillColor(blanco)
        .font("Helvetica-Bold")
        .fontSize(20)
        .text(
          "DEUDAS AYSAM – DETALLE DE CUENTAS",
          MARGEN,
          MARGEN + 13,
          {
            width: ANCHO_PAGINA - MARGEN * 2,
            align: "center",
          }
        );

      doc
        .fillColor(gris)
        .font("Helvetica")
        .fontSize(8)
        .text(
          `Generado: ${new Date().toLocaleString("es-AR")}`,
          MARGEN,
          88,
          {
            width: ANCHO_PAGINA - MARGEN * 2,
            align: "center",
          }
        );

      // Tarjetas
      const yTarjetas = 110;
      const anchoTarjeta = 120;
      const altoTarjeta = 45;
      const espacio = 12;

      crearTarjeta(
        MARGEN,
        yTarjetas,
        anchoTarjeta,
        altoTarjeta,
        "CUENTAS",
        totalCuentas,
        azulMedio
      );

      crearTarjeta(
        MARGEN + (anchoTarjeta + espacio),
        yTarjetas,
        anchoTarjeta,
        altoTarjeta,
        "CON DEUDA",
        conDeuda,
        rojo
      );

      crearTarjeta(
        MARGEN + 2 * (anchoTarjeta + espacio),
        yTarjetas,
        anchoTarjeta,
        altoTarjeta,
        "SIN DEUDA",
        sinDeuda,
        verde
      );

      crearTarjeta(
        MARGEN + 3 * (anchoTarjeta + espacio),
        yTarjetas,
        anchoTarjeta,
        altoTarjeta,
        "DEUDA VENCIDA",
        `$ ${moneda(deudaVencida)}`,
        rojo
      );

      crearTarjeta(
        MARGEN + 4 * (anchoTarjeta + espacio),
        yTarjetas,
        anchoTarjeta,
        altoTarjeta,
        "DEUDA NO VENCIDA",
        `$ ${moneda(deudaNoVencida)}`,
        azulMedio
      );

      crearTarjeta(
        MARGEN + 5 * (anchoTarjeta + espacio),
        yTarjetas,
        anchoTarjeta,
        altoTarjeta,
        "DEUDA TOTAL",
        `$ ${moneda(deudaTotal)}`,
        rojo
      );

      return 185;
    }

    // Encabezado simple para páginas siguientes
    doc
      .fillColor(azul)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(
        "DEUDAS AYSAM – DETALLE DE CUENTAS",
        MARGEN,
        MARGEN
      );

    return 55;
  }

  function dibujarTablaEncabezado(y) {
    const columnas = [
      ["Cuenta", 82],
      ["Inquilinos", 105],
      ["Titular AYSAM", 105],
      ["Estado", 58],
      ["Facturas", 45],
      ["Vencida", 70],
      ["No vencida", 70],
      ["Total", 72],
    ];

    const anchoTabla = columnas.reduce(
      (sum, [, ancho]) => sum + ancho,
      0
    );

    doc
      .rect(MARGEN, y, anchoTabla, 24)
      .fill(azulMedio);

    let x = MARGEN;

    for (const [nombre, ancho] of columnas) {
      doc
        .fillColor(blanco)
        .font("Helvetica-Bold")
        .fontSize(7)
        .text(
          nombre,
          x + 3,
          y + 7,
          {
            width: ancho - 6,
            align: "center",
          }
        );

      x += ancho;
    }

    return {
      columnas,
      anchoTabla,
      siguienteY: y + 24,
    };
  }

  function crearTarjeta(
    x,
    y,
    ancho,
    alto,
    titulo,
    valor,
    color
  ) {
    doc
      .roundedRect(x, y, ancho, alto, 4)
      .fill(color);

    doc
      .fillColor(blanco)
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(
        titulo,
        x + 5,
        y + 7,
        {
          width: ancho - 10,
          align: "center",
        }
      );

    doc
      .fontSize(10)
      .text(
        String(valor),
        x + 5,
        y + 25,
        {
          width: ancho - 10,
          align: "center",
        }
      );
  }

  // ==========================================================
  // PRIMERA PÁGINA
  // ==========================================================

  let y = encabezado(true);

  let tabla = dibujarTablaEncabezado(y);

  const columnas = tabla.columnas;
  const anchoTabla = tabla.anchoTabla;

  y = tabla.siguienteY;

  // ==========================================================
  // FILAS
  // ==========================================================

  for (let indice = 0; indice < filasCuentas.length; indice++) {
    const fila = filasCuentas[indice];

    const valores = {
      cuenta: fila.cuenta || "",
      inquilinos: Array.isArray(fila.inquilinos)
        ? fila.inquilinos.join(" | ")
        : "",
      titular: fila.titular || "",
      estado: fila.estado || "",
      cantidadFacturas: fila.cantidadFacturas || 0,
      deudaVencida: fila.deudaVencida || 0,
      deudaNoVencida: fila.deudaNoVencida || 0,
      deudaTotal: fila.deudaTotal || 0,
    };

    let altura = 24;

    for (const [nombre, ancho] of columnas) {
      let texto = "";

      switch (nombre) {
        case "Cuenta":
          texto = valores.cuenta;
          break;

        case "Inquilinos":
          texto = valores.inquilinos;
          break;

        case "Titular AYSAM":
          texto = valores.titular;
          break;

        case "Estado":
          texto = valores.estado;
          break;

        case "Facturas":
          texto = String(valores.cantidadFacturas);
          break;

        case "Vencida":
          texto = `$ ${moneda(valores.deudaVencida)}`;
          break;

        case "No vencida":
          texto = `$ ${moneda(valores.deudaNoVencida)}`;
          break;

        case "Total":
          texto = `$ ${moneda(valores.deudaTotal)}`;
          break;
      }

      const alturaTexto = doc.heightOfString(
        String(texto),
        {
          width: ancho - 6,
          font: "Helvetica",
          fontSize: 7,
        }
      );

      if (alturaTexto + 8 > altura) {
        altura = alturaTexto + 8;
      }
    }

    // --------------------------------------------------------
    // SALTO DE PÁGINA
    // --------------------------------------------------------

    if (
      y + altura >
      ALTO_PAGINA - 45
    ) {
      agregarPie();

      doc.addPage();

      y = encabezado(false);

      tabla = dibujarTablaEncabezado(y);

      y = tabla.siguienteY;
    }

    // --------------------------------------------------------
    // FONDO ALTERNADO
    // --------------------------------------------------------

    if (indice % 2 === 0) {
      doc
        .rect(
          MARGEN,
          y,
          anchoTabla,
          altura
        )
        .fill(fondoGris);
    }

    // --------------------------------------------------------
    // CELDAS
    // --------------------------------------------------------

    let x = MARGEN;

    for (const [nombre, ancho] of columnas) {
      let texto = "";
      let alineacion = "left";

      switch (nombre) {
        case "Cuenta":
          texto = valores.cuenta;
          break;

        case "Inquilinos":
          texto = valores.inquilinos;
          break;

        case "Titular AYSAM":
          texto = valores.titular;
          break;

        case "Estado":
          texto = valores.estado;
          break;

        case "Facturas":
          texto = String(valores.cantidadFacturas);
          alineacion = "right";
          break;

        case "Vencida":
          texto = `$ ${moneda(valores.deudaVencida)}`;
          alineacion = "right";
          break;

        case "No vencida":
          texto = `$ ${moneda(valores.deudaNoVencida)}`;
          alineacion = "right";
          break;

        case "Total":
          texto = `$ ${moneda(valores.deudaTotal)}`;
          alineacion = "right";
          break;
      }

      let colorTexto = "#000000";
      let fuente = "Helvetica";

      if (
        nombre === "Estado" &&
        valores.estado === "CON DEUDA"
      ) {
        colorTexto = rojo;
        fuente = "Helvetica-Bold";
      }

      if (
        nombre === "Estado" &&
        valores.estado === "SIN DEUDA"
      ) {
        colorTexto = verde;
        fuente = "Helvetica-Bold";
      }

      doc
        .fillColor(colorTexto)
        .font(fuente)
        .fontSize(7)
        .text(
          String(texto),
          x + 3,
          y + 7,
          {
            width: ancho - 6,
            height: altura - 8,
            align: alineacion,
            ellipsis: true,
            lineBreak: false,
          }
        );

      x += ancho;
    }

    // Línea inferior
    doc
      .strokeColor("#D9D9D9")
      .lineWidth(0.5)
      .moveTo(MARGEN, y + altura)
      .lineTo(
        MARGEN + anchoTabla,
        y + altura
      )
      .stroke();

    y += altura;
  }

  // ==========================================================
  // PIE FINAL
  // ==========================================================

  agregarPie();

  // ==========================================================
  // IMPORTANTE:
  // NO USAMOS bufferPages NI switchToPage.
  //
  // La numeración se agrega mientras se genera cada página.
  // ==========================================================

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => {
      resolve(ARCHIVO_PDF);
    });

    stream.on("error", reject);
  });

  // ----------------------------------------------------------
  // Pie de página
  // ----------------------------------------------------------

  function agregarPie() {
    doc
      .fillColor("#777777")
      .font("Helvetica")
      .fontSize(6)
      .text(
        "AYSAM – Informe generado automáticamente",
        MARGEN,
        ALTO_PAGINA - 38,
        {
          width: 300,
          height: 8,
          lineBreak: false,
        }
      );
  }
}

module.exports = {
  crearPDF,
  ARCHIVO_PDF,
};