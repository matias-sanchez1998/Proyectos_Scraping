const XLSX = require("xlsx");

function normalizarNIC(valor) {
  if (
    valor === null ||
    valor === undefined
  ) {
    return "";
  }

  return String(valor)
    .trim();
}

function esNICValido(nic) {
  const valor = String(nic).trim();

  return /^\d+$/.test(valor);
}

function leerExcel(ruta) {
  const workbook =
    XLSX.readFile(ruta);

  const nombreHoja =
    workbook.SheetNames[0];

  const hoja =
    workbook.Sheets[nombreHoja];

  const filas =
    XLSX.utils.sheet_to_json(
      hoja,
      {
        defval: "",
      }
    );

  const registros = [];

  for (const fila of filas) {
    const inquilino =
      String(
        fila["Inquilinos"] || ""
      ).trim();

    const propietario =
      String(
        fila["Propietarios"] || ""
      ).trim();

    const nic =
      normalizarNIC(
        fila["NIC EDEMSA"]
      );

    registros.push({
      inquilino,
      propietario,
      nic,
      nicValido:
        esNICValido(nic),
    });
  }

  return registros;
}

function agruparPorNIC(registros) {
  const mapa = new Map();

  for (const registro of registros) {
    if (!registro.nicValido) {
      continue;
    }

    if (!mapa.has(registro.nic)) {
      mapa.set(
        registro.nic,
        {
          nic: registro.nic,
          inquilinos: [],
          propietarios: [],
        }
      );
    }

    const grupo =
      mapa.get(registro.nic);

    if (
      registro.inquilino &&
      !grupo.inquilinos.includes(
        registro.inquilino
      )
    ) {
      grupo.inquilinos.push(
        registro.inquilino
      );
    }

    if (
      registro.propietario &&
      !grupo.propietarios.includes(
        registro.propietario
      )
    ) {
      grupo.propietarios.push(
        registro.propietario
      );
    }
  }

  return Array.from(
    mapa.values()
  );
}

module.exports = {
  leerExcel,
  agruparPorNIC,
  esNICValido,
};