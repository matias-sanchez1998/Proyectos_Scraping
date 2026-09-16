const cheerio = require("cheerio");

function convertirImporte(texto) {
  if (!texto) return 0;

  const limpio = texto
    .replace(/\$/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();

  const numero = Number(limpio);

  return Number.isFinite(numero) ? numero : 0;
}

function analizarEncabezadoFactura(encabezado) {
  const resultado = {
    numero: "",
    periodo: "",
    tipo: "",
  };

  if (!encabezado) {
    return resultado;
  }

  const normal = encabezado.match(
    /Factura N°\s*(.+?)\s*-\s*Periodo:\s*(\d{2}-\d{4})/i
  );

  if (normal) {
    resultado.numero = normal[1].trim();
    resultado.periodo = normal[2].replace("-", "/");
    resultado.tipo = "FACTURA";
    return resultado;
  }

 const especial = encabezado.match(
  /Factura N°\s*([A-Z]-\d{4}-\d+)\s*-\s*(.+)$/i
);

if (especial) {
  resultado.numero = especial[1].trim();
  resultado.tipo = especial[2].trim();
  return resultado;
}
  return resultado;
}

function extraerFactura(html) {
  const $ = cheerio.load(html);
  const facturas = [];

  /*
   * EDEMSA puede devolver varias facturas dentro
   * del mismo .border_celeste.
   *
   * La estructura es aproximadamente:
   *
   * .card                 -> encabezado factura
   * .row                   -> títulos de columnas
   * .row.pb-3.pt-3        -> cuota 1
   * .row.pb-3.pt-3        -> cuota 2
   * .card                 -> siguiente factura
   * .row                   -> títulos
   * .row.pb-3.pt-3        -> cuota 1
   *
   * Por eso no recorremos directamente todo el
   * .border_celeste como una única factura.
   */

  $(".border_celeste").each((_, contenedor) => {
    const $contenedor = $(contenedor);

    let facturaActual = null;

    $contenedor.children().each((_, elemento) => {
      const $elemento = $(elemento);

      // ------------------------------------------
      // NUEVA FACTURA
      // ------------------------------------------

      if ($elemento.hasClass("card")) {
        const encabezado = $elemento
          .find(".card-header h6")
          .first()
          .text()
          .replace(/\s+/g, " ")
          .trim();

        if (!encabezado) {
          facturaActual = null;
          return;
        }

        const info =
          analizarEncabezadoFactura(encabezado);

        if (!info.numero) {
          facturaActual = null;
          return;
        }

        facturaActual = info;
        return;
      }

      // ------------------------------------------
      // FILA DE CUOTA
      // ------------------------------------------

      if (
        !facturaActual ||
        !$elemento.hasClass("row") ||
        !$elemento.hasClass("pb-3") ||
        !$elemento.hasClass("pt-3")
      ) {
        return;
      }

      const columnas = $elemento
        .find(".col-12.col-md-6")
        .first()
        .find(".row")
        .first()
        .children("div");

      if (columnas.length < 4) {
        return;
      }

      const cuotaTexto = $(columnas[0])
        .text()
        .replace(/\s+/g, " ")
        .trim();

      const importeTexto = $(columnas[1])
        .text()
        .replace(/\s+/g, " ")
        .trim();

      const vencimiento = $(columnas[2])
        .text()
        .replace(/\s+/g, " ")
        .trim();

      const estado = $(columnas[3])
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();

      const cuota = Number(cuotaTexto);

      if (!Number.isFinite(cuota)) {
        return;
      }

      facturas.push({
        numero: facturaActual.numero,
        periodo: facturaActual.periodo,
        tipo: facturaActual.tipo,
        cuota,
        importe: convertirImporte(importeTexto),
        vencimiento,
        estado,
      });
    });
  });

  return facturas;
}

function extraerDatosGenerales(html) {
  const $ = cheerio.load(html);

  const texto = $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim();

  const titularMatch = texto.match(
    /Titular de la cuenta:\s*(.*?)\s+Dirección del Suministro:/i
  );

  const direccionMatch = texto.match(
    /Dirección del Suministro:\s*(.*?)\s+NIC:/i
  );

  const nicMatch = texto.match(
    /NIC:\s*(\d+)/i
  );

  const ultimaFacturaMatch = texto.match(
    /Ultima Factura N°:\s*([^:]+):\s*\$?\s*([\d.,]+)/i
  );

  const consumoActualMatch = texto.match(
    /ÚLTIMO CONSUMO EN kWh:\s*(\d+)\s*-\s*Periodo\s+(\d{2}\/\d{2})/i
  );

  const consumoAnteriorMatch = texto.match(
    /CONSUMO PERIODO ANTERIOR EN kWh:\s*(\d+)\s*-\s*Periodo\s+(\d{2}\/\d{2})/i
  );

  const totalMatch = texto.match(
    /Total\s+\$?\s*([\d.,]+)/i
  );

  return {
    titular: titularMatch
      ? titularMatch[1].trim()
      : "",

    direccion: direccionMatch
      ? direccionMatch[1].trim()
      : "",

    nic: nicMatch
      ? nicMatch[1]
      : "",

    ultimaFactura: ultimaFacturaMatch
      ? ultimaFacturaMatch[1].trim()
      : "",

    importeUltimaFactura:
      ultimaFacturaMatch
        ? convertirImporte(
            ultimaFacturaMatch[2]
          )
        : 0,

    consumoActual:
      consumoActualMatch
        ? Number(consumoActualMatch[1])
        : null,

    periodoConsumoActual:
      consumoActualMatch
        ? consumoActualMatch[2]
        : "",

    consumoAnterior:
      consumoAnteriorMatch
        ? Number(consumoAnteriorMatch[1])
        : null,

    periodoConsumoAnterior:
      consumoAnteriorMatch
        ? consumoAnteriorMatch[2]
        : "",

    totalMostrado:
      totalMatch
        ? convertirImporte(
            totalMatch[1]
          )
        : 0,
  };
}

function calcularDeuda(facturas) {
  const pendientes = facturas.filter(
    (factura) =>
      factura.estado === "PENDIENTE"
  );

  const deudaTotal = pendientes.reduce(
    (total, factura) =>
      total + factura.importe,
    0
  );

  return {
    pendientes,
    cantidadPendientes:
      pendientes.length,
    deudaTotal,
  };
}

module.exports = {
  extraerDatosGenerales,
  extraerFactura,
  calcularDeuda,
};