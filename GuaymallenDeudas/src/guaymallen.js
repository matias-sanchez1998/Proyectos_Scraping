const axios = require("axios");

const URL =
  "https://ventanillaunica.guaymallen.gob.ar/api/pagos/payment-intent";

async function consultarPadron(codigo) {
  try {
    const response = await axios.get(URL, {
      params: {
        action: "buscar",
        tipo: "Inm",
        codigo: codigo,
      },
      headers: {
        Accept: "*/*",
        Referer: "https://ventanillaunica.guaymallen.gob.ar/pagos",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 15000,
    });

    return response.data;
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

function procesarResultado(resultado, padron) {
  if (!resultado || !resultado.success) {
    return {
      padron,
      estado: "ERROR",
      titular: null,
      cuotas: [],
      total: 0,
      mensaje: resultado?.error || "Error desconocido",
    };
  }

  if (!resultado.data || resultado.data.length === 0) {
    return {
      padron,
      estado: "SIN DEUDA",
      titular: null,
      cuotas: [],
      total: 0,
      mensaje: "No se encontraron deudas para el código ingresado.",
    };
  }

  const servicio = resultado.data[0];

  const cuotas = servicio.installments || [];

  const cuotasProcesadas = cuotas.map((cuota) => ({
    anio: cuota.year,
    numero: cuota.number,
    referencia: cuota.reference,
    capital: Number(cuota.capital || 0),
    interes: Number(cuota.interest || 0),
    total: Number(cuota.capital || 0) + Number(cuota.interest || 0),
    vencimiento: cuota.dueDate,
    descripcion: cuota.description,
  }));

  const total = cuotasProcesadas.reduce(
    (acumulado, cuota) => acumulado + cuota.total,
    0
  );

  return {
    padron,
    estado: cuotas.length > 0 ? "CON DEUDA" : "SIN DEUDA",
    titular: servicio.holderName || null,
    cuil: servicio.holderCuil || null,
    nomenclatura: servicio.observation || null,
    cuotas: cuotasProcesadas,
    cantidadCuotas: cuotasProcesadas.length,
    total,
  };
}

module.exports = {
  consultarPadron,
  procesarResultado,
};