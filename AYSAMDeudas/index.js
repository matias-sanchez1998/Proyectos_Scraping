const path = require("path");
const fs = require("fs");

const {
  leerExcel,
  prepararRegistros,
} = require("./src/excel");

const {
  generarExcel,
  crearFilasCuentas,
} = require("./src/exportar");

const {
  crearPDF,
} = require("./src/pdf");

async function main() {
  const rutaExcel = path.join(
    __dirname,
    "data",
    "clientesAysam.xlsx"
  );

  const rutaCache = path.join(
    __dirname,
    "cache",
    "resultados.json"
  );

  console.log(
    "=========================================="
  );

  console.log(
    "       AYSAM - GENERADOR DE INFORMES"
  );

  console.log(
    "==========================================\n"
  );

  // ----------------------------------------------------------
  // VERIFICAR ARCHIVOS
  // ----------------------------------------------------------

  if (!fs.existsSync(rutaExcel)) {
    throw new Error(
      `No se encontró el Excel:\n${rutaExcel}`
    );
  }

  if (!fs.existsSync(rutaCache)) {
    throw new Error(
      `No se encontró la caché:\n${rutaCache}`
    );
  }

  // ----------------------------------------------------------
  // LEER EXCEL
  // ----------------------------------------------------------

  console.log("Leyendo Excel...");

  const filas = leerExcel(rutaExcel);

  const registros =
    prepararRegistros(filas);

  console.log(
    `Registros originales: ${registros.length}`
  );

  // ----------------------------------------------------------
  // LEER CACHE
  // ----------------------------------------------------------

  console.log(
    "\nLeyendo resultados de AYSAM desde la caché..."
  );

  const cache = JSON.parse(
    fs.readFileSync(
      rutaCache,
      "utf8"
    )
  );

  console.log(
    `Resultados en caché: ${Object.keys(cache).length}`
  );

  // ----------------------------------------------------------
  // GENERAR EXCEL
  // ----------------------------------------------------------

  console.log(
    "\nGenerando Excel..."
  );

  const archivoExcel =
    await generarExcel(
      registros,
      cache
    );

  console.log(
    "✅ Excel generado:"
  );

  console.log(archivoExcel);

  // ----------------------------------------------------------
  // PREPARAR DATOS PARA PDF
  // ----------------------------------------------------------

  console.log(
    "\nPreparando PDF..."
  );

  const filasCuentas =
    crearFilasCuentas(
      registros,
      cache
    );

  // ----------------------------------------------------------
  // GENERAR PDF
  // ----------------------------------------------------------

  console.log(
    "Generando PDF..."
  );

  const archivoPDF =
    await crearPDF(
      filasCuentas
    );

  console.log(
    "✅ PDF generado:"
  );

  console.log(archivoPDF);

  // ----------------------------------------------------------
  // FINAL
  // ----------------------------------------------------------

  console.log(
    "\n=========================================="
  );

  console.log(
    "          PROCESO FINALIZADO"
  );

  console.log(
    "=========================================="
  );

  console.log(
    "\nArchivos generados:"
  );

  console.log(
    `📊 Excel: ${archivoExcel}`
  );

  console.log(
    `📄 PDF:   ${archivoPDF}`
  );

  console.log(
    "\nNo se realizaron nuevas consultas a AYSAM."
  );
}

main().catch((error) => {
  console.error(
    "\n❌ ERROR:"
  );

  console.error(error);

  process.exit(1);
});