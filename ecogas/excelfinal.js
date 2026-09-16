const fs = require("fs");
const XLSX = require("xlsx");

// cargar JSON
const data = JSON.parse(fs.readFileSync("resultados-ecogas.json", "utf8"));

const hoy = new Date();

function parseFecha(fechaStr) {
  const [dia, mes, anio] = fechaStr.split("/");
  return new Date(`${anio}-${mes}-${dia}`);
}

function limpiarImporte(str) {
  return parseFloat(
    str.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "")
  );
}

let filas = [];
let resumenPorCliente = {};
let totalGeneral = 0;

// recorrer data
Object.values(data).forEach(cliente => {
  if (cliente.sinDeuda) return;

  let totalCliente = 0;

  cliente.deudas.forEach(deuda => {
    const fechaVenc = parseFecha(deuda.vencimiento);
    const diasVencidos = Math.floor((hoy - fechaVenc) / (1000 * 60 * 60 * 24));
    const importe = limpiarImporte(deuda.importe);
    const intereses = limpiarImporte(deuda.intereses);

    totalCliente += importe + intereses;
    totalGeneral += importe + intereses;

    filas.push({
      Cliente: cliente.cliente,
      Nombre: cliente.nombres.join(" / "),
      Comprobante: deuda.comprobante,
      Importe: importe,
      Intereses: intereses,
      Vencimiento: deuda.vencimiento,
      "Días vencidos": diasVencidos,
      Estado: diasVencidos > 30 ? "MAS DE 30" : "OK"
    });
  });

  resumenPorCliente[cliente.cliente] = {
    Cliente: cliente.cliente,
    Nombre: cliente.nombres.join(" / "),
    "Total Deuda": totalCliente
  };
});

// -------- HOJA DETALLE --------
const ws = XLSX.utils.json_to_sheet(filas);

// aplicar estilos (rojo para +30)
const range = XLSX.utils.decode_range(ws["!ref"]);

for (let R = 1; R <= range.e.r; ++R) {
  const estadoCell = ws[XLSX.utils.encode_cell({ r: R, c: 7 })];

  if (estadoCell && estadoCell.v === "MAS DE 30") {
    for (let C = 0; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellRef]) continue;

      ws[cellRef].s = {
        fill: {
          fgColor: { rgb: "FFCCCC" }
        }
      };
    }
  }
}

// -------- HOJA RESUMEN --------
const resumenArray = Object.values(resumenPorCliente);

const wsResumen = XLSX.utils.json_to_sheet(resumenArray);

// agregar total general abajo
const totalRowIndex = resumenArray.length + 2;

wsResumen[`A${totalRowIndex}`] = { v: "TOTAL GENERAL" };
wsResumen[`C${totalRowIndex}`] = { v: totalGeneral };

// -------- WORKBOOK --------
const wb = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(wb, ws, "Detalle");
XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

// guardar
XLSX.writeFile(wb, "deudas_pro.xlsx");

console.log("Excel PRO generado: deudas_pro.xlsx");