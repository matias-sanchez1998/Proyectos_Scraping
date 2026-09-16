const path = require("path");
const fs = require("fs");

const {
  leerExcel,
  prepararPadrones,
  obtenerPadronesUnicos,
} = require("./src/excel");

const {
  consultarTodos,
} = require("./src/consulta");

const {
  generarExcel,
} = require("./src/exportar");

async function main() {
  const rutaExcel = path.join(
    __dirname,
    "data",
    "MuniPadron.xlsx"
  );

  console.log("======================================");
  console.log("   GUAYMALLÉN - CONSULTA DE DEUDAS");
  console.log("======================================\n");

  console.log("Leyendo Excel...");

  const filas = leerExcel(rutaExcel);

  console.log(`Filas encontradas: ${filas.length}`);

  const registros = prepararPadrones(filas);

  console.log(`Registros con padrón: ${registros.length}`);

  const padrones = obtenerPadronesUnicos(registros);

  console.log(`Padrones únicos: ${padrones.length}`);

  console.log("\nComenzando consultas...\n");

  const resultados = await consultarTodos(padrones);

  // Convertimos resultados en una caché indexada por padrón
  const cache = {};

  for (const resultado of resultados) {
    cache[resultado.padron] = resultado;
  }

  console.log("\n======================================");
  console.log("CONSULTA FINALIZADA");
  console.log("======================================");

  const conDeuda = resultados.filter(
    (r) => r.estado === "CON DEUDA"
  );

  const sinDeuda = resultados.filter(
    (r) => r.estado === "SIN DEUDA"
  );

  const errores = resultados.filter(
    (r) => r.estado === "ERROR"
  );

  const totalDeuda = conDeuda.reduce(
    (sum, r) => sum + Number(r.total || 0),
    0
  );

  console.log(`Padrones procesados: ${resultados.length}`);
  console.log(`Con deuda: ${conDeuda.length}`);
  console.log(`Sin deuda: ${sinDeuda.length}`);
  console.log(`Errores: ${errores.length}`);

  console.log(
    `TOTAL ADEUDADO: $${totalDeuda.toLocaleString("es-AR")}`
  );

  console.log("\nGenerando Excel...");

const archivo = await generarExcel(registros, cache);
  console.log("\n✅ Excel generado correctamente:");
  console.log(archivo);
}

main().catch((error) => {
  console.error("\n❌ Error inesperado:");
  console.error(error);
});