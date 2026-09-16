const axios = require("axios");

const URL =
  "https://oficinavirtual.aysam.com.ar/recursos/includeActions/inc_getDetailCuenta.php";

/**
 * Consulta una cuenta de AYSAM.
 *
 * La cuenta se recibe como:
 * 056-0125841-003-5
 *
 * y se separa automáticamente en:
 * 056
 * 0125841
 * 003
 * 5
 */
async function consultarCuenta(numeroCuenta, recaptchaResponse = "") {
  try {
    const partes = String(numeroCuenta)
      .trim()
      .split("-");

    if (partes.length !== 4) {
      throw new Error(
        `Formato de cuenta inválido: ${numeroCuenta}`
      );
    }

    const [
      inputNcSec1,
      inputNcSec2,
      inputNcSec3,
      inputNcSec4,
    ] = partes;

    const params = new URLSearchParams();

    params.append("inputNcSec1", inputNcSec1);
    params.append("inputNcSec2", inputNcSec2);
    params.append("inputNcSec3", inputNcSec3);
    params.append("inputNcSec4", inputNcSec4);

    params.append("isbb", "");
    params.append("o", "1");
    params.append("actions", "get-cta-home");

    // Por ahora lo dejamos parametrizado.
    // Luego vamos a resolver cómo obtener este token.
    params.append(
      "recaptcha_response",
      recaptchaResponse
    );

    const response = await axios.post(
      URL,
      params.toString(),
      {
        headers: {
          Accept: "application/json",
          "Content-Type":
            "application/x-www-form-urlencoded",
          Origin:
            "https://oficinavirtual.aysam.com.ar",
          Referer:
            "https://oficinavirtual.aysam.com.ar/section/home-public/detail-cuenta/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 20000,
      }
    );

    return response.data;
  } catch (error) {
    return {
      code: -1,
      error_message: error.message,
      data: null,
    };
  }
}

/**
 * Convierte la respuesta de AYSAM
 * a una estructura sencilla.
 */
function procesarCuenta(respuesta) {
  if (
    !respuesta ||
    respuesta.code !== 0 ||
    !respuesta.data
  ) {
    return {
      estado: "ERROR",
      mensaje:
        respuesta?.error_message ||
        "No se pudo obtener la información.",
    };
  }

  const data = respuesta.data;
  const cuenta = data.deuda || {};
  const datos = data.datosCuenta || {};

  const facturas = (cuenta.facturas || []).map(
    (factura) => ({
      periodo: factura.periodo,
      cuota: factura.numberCuota,

      numeroFactura: factura.numero,

      importeHistorico: Number(
        factura.importeHistorico || 0
      ),

      recargo: Number(
        factura.recargo || 0
      ),

      importe: Number(
        factura.importe || 0
      ),

      vencimiento:
        factura.fechaVencimiento || "",

      vencida:
        Number(factura.vencida || 0) === 1,

      estado:
        factura.estado || "",

      descripcion:
        factura.descripcion || "",
    })
  );

  const deudaTotal = facturas.reduce(
    (total, factura) =>
      total + factura.importe,
    0
  );

  const deudaVencida = facturas
    .filter((factura) => factura.vencida)
    .reduce(
      (total, factura) =>
        total + factura.importe,
      0
    );

  const deudaNoVencida = facturas
    .filter((factura) => !factura.vencida)
    .reduce(
      (total, factura) =>
        total + factura.importe,
      0
    );

  return {
    estado:
      facturas.length > 0
        ? "CON DEUDA"
        : "SIN DEUDA",

    cuenta:
      data.numCuenta || "",

    titular:
      datos.titular || "",

    domicilio:
      datos.dirServicio || "",

    facturas,

    cantidadFacturas: facturas.length,

    deudaTotal,

    deudaVencida,

    deudaNoVencida,

    proximaFactura:
      datos.montoProxFactura || "",

    proximoVencimiento:
      datos.fVencProxFactura || "",

    tienePlanPago:
      datos.tienePlanPago || false,
  };
}

module.exports = {
  consultarCuenta,
  procesarCuenta,
};