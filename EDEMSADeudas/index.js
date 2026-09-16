const fs = require("fs");
const path = require("path");

const {
  obtenerTodos,
} = require("./src/cache");

const {
  generarExcel,
} = require("./src/exportar");

const {
  crearPDF,
} = require("./src/pdf");

async function main() {
  console.log(`
======================================
      EDEMSA - REPORTES FINALES
======================================
`);

  const cache =
    obtenerTodos();

  const resultados =
    Object.values(cache);

  console.log(
    `Resultados en cache: ${resultados.length}`
  );

  if (!resultados.length) {
    throw new Error(
      "No hay resultados en cache."
    );
  }

  const archivoObs =
    path.join(
      __dirname,
      "cache",
      "observaciones.json"
    );

  let observaciones = {
    registros: [],
  };

  if (
    fs.existsSync(
      archivoObs
    )
  ) {
    observaciones =
      JSON.parse(
        fs.readFileSync(
          archivoObs,
          "utf8"
        )
      );
  }

  const carpeta =
    path.join(
      __dirname,
      "resultados"
    );

  if (!fs.existsSync(carpeta)) {
    fs.mkdirSync(carpeta, {
      recursive: true,
    });
  }

  const archivoExcel =
    path.join(
      carpeta,
      "Deudas_EDEMSA.xlsx"
    );

  const archivoPDF =
    path.join(
      carpeta,
      "Deudas_EDEMSA.pdf"
    );

  console.log("\nGenerando Excel...");

  await generarExcel(
    resultados,
    observaciones,
    archivoExcel
  );

  console.log("\nGenerando PDF...");

  crearPDF(
    resultados,
    observaciones,
    archivoPDF
  );

  console.log(`
======================================
        TODO TERMINADO
======================================

Excel:
${archivoExcel}

PDF:
${archivoPDF}
`);
}

main().catch((error) => {
  console.error(
    "\n❌ ERROR:"
  );

  console.error(error);
});