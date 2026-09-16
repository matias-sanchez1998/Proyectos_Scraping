const {
  extraerDatosGenerales,
  extraerFactura,
  calcularDeuda,
} = require("./parser");

function procesarRespuestaNIC(
  nic,
  generalHTML,
  deudaHTML,
  grupo = {}
) {
  const generales = generalHTML
    ? extraerDatosGenerales(generalHTML)
    : {};

  const facturas = deudaHTML
    ? extraerFactura(deudaHTML)
    : [];

  const deuda = calcularDeuda(facturas);

  return {
    nic: String(nic),

    inquilinos: grupo.inquilinos || [],
    propietarios: grupo.propietarios || [],

    titular: generales.titular || "",
    direccion: generales.direccion || "",

    consumoActual:
      generales.consumoActual ?? null,

    periodoConsumoActual:
      generales.periodoConsumoActual || "",

    consumoAnterior:
      generales.consumoAnterior ?? null,

    periodoConsumoAnterior:
      generales.periodoConsumoAnterior || "",

    ultimaFactura:
      generales.ultimaFactura || "",

    importeUltimaFactura:
      generales.importeUltimaFactura || 0,

    facturas,
    pendientes: deuda.pendientes,
    cantidadPendientes:
      deuda.cantidadPendientes,

    deudaTotal: deuda.deudaTotal,

    estado: "OK",
  };
}

module.exports = {
  procesarRespuestaNIC,
};