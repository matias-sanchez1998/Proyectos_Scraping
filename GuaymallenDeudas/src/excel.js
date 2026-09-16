const XLSX = require("xlsx");

function leerExcel(ruta) {
  const workbook = XLSX.readFile(ruta);

  const nombreHoja = workbook.SheetNames[0];

  const hoja = workbook.Sheets[nombreHoja];

  const filas = XLSX.utils.sheet_to_json(hoja, {
    defval: "",
  });

  return filas;
}

function limpiarPadron(valor) {
  if (valor === null || valor === undefined) {
    return null;
  }

  const texto = String(valor).trim();

  if (!texto) {
    return null;
  }

  const soloNumeros = texto.replace(/\D/g, "");

  if (!soloNumeros) {
    return null;
  }

  return soloNumeros.replace(/^0+/, "") || "0";
}

function prepararPadrones(filas) {
  const registros = [];

  for (const fila of filas) {
    const padron = limpiarPadron(fila.MUNICIPALIDAD);

    if (!padron) {
      continue;
    }

    registros.push({
      padron,
      inquilino: String(fila.Inquilinos || "").trim(),
      propietario: String(fila.Propietarios || "").trim(),
    });
  }

  return registros;
}

function obtenerPadronesUnicos(registros) {
  return [...new Set(registros.map((r) => r.padron))];
}

function agruparPorPadron(registros) {
  const grupos = {};

  for (const registro of registros) {
    if (!grupos[registro.padron]) {
      grupos[registro.padron] = {
        padron: registro.padron,
        inquilinos: new Set(),
        propietarios: new Set(),
      };
    }

    if (registro.inquilino) {
      grupos[registro.padron].inquilinos.add(registro.inquilino);
    }

    if (registro.propietario) {
      grupos[registro.padron].propietarios.add(registro.propietario);
    }
  }

  return Object.values(grupos).map((grupo) => ({
    padron: grupo.padron,
    inquilinos: [...grupo.inquilinos],
    propietarios: [...grupo.propietarios],
  }));
}

module.exports = {
  leerExcel,
  limpiarPadron,
  prepararPadrones,
  obtenerPadronesUnicos,
  agruparPorPadron,
};