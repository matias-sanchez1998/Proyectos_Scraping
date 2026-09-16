const fs = require("fs");
const path = require("path");

const carpeta = path.join(
  __dirname,
  "..",
  "cache"
);

const archivo = path.join(
  carpeta,
  "observaciones.json"
);

function guardarObservaciones(
  registros
) {
  if (!fs.existsSync(carpeta)) {
    fs.mkdirSync(carpeta, {
      recursive: true,
    });
  }

  const observaciones = {
    fecha:
      new Date().toISOString(),

    resumen: {
      totalRegistros:
        registros.length,

      nicValidos:
        registros.filter(
          (r) => r.nicValido
        ).length,

      nicVacios:
        registros.filter(
          (r) => !r.nic
        ).length,

      nicInvalidos:
        registros.filter(
          (r) =>
            r.nic &&
            !r.nicValido
        ).length,
    },

    registros: registros
      .filter((r) => !r.nicValido)
      .map((r) => ({
        inquilino: r.inquilino,
        propietario: r.propietario,
        nic: r.nic,
      })),
  };

  fs.writeFileSync(
    archivo,
    JSON.stringify(
      observaciones,
      null,
      2
    ),
    "utf8"
  );

  return observaciones;
}

module.exports = {
  guardarObservaciones,
};