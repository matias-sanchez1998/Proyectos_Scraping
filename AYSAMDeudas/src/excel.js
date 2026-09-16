const XLSX = require("xlsx");

/**
 * Lee el primer sheet del Excel.
 */
function leerExcel(ruta) {
  const workbook = XLSX.readFile(ruta);

  const nombreHoja = workbook.SheetNames[0];

  const hoja = workbook.Sheets[nombreHoja];

  return XLSX.utils.sheet_to_json(hoja, {
    defval: "",
    raw: false,
  });
}

/**
 * Normaliza una cuenta AYSAM.
 *
 * Acepta:
 * 059-0012239-000-8
 *
 * No acepta:
 * 1955 Corralcoop
 * 05900122390008
 *
 * Por ahora queremos detectar solamente las cuentas
 * que ya tienen el formato oficial.
 */
function normalizarCuenta(valor) {
  if (
    valor === null ||
    valor === undefined
  ) {
    return null;
  }

  const cuenta = String(valor).trim();

  if (!cuenta) {
    return null;
  }

  const patron =
    /^\d{3}-\d{7}-\d{3}-\d{1}$/;

  if (!patron.test(cuenta)) {
    return null;
  }

  return cuenta;
}

/**
 * Prepara los registros del Excel.
 *
 * Conserva:
 * - inquilino
 * - propietario
 * - cuenta AYSAM
 */
function prepararRegistros(filas) {
  const registros = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];

    const valorOriginal =
      String(fila.AYSAM || "").trim();

    const cuenta =
      normalizarCuenta(valorOriginal);

    registros.push({
      filaExcel: i + 2,

      inquilino:
        String(fila.Inquilinos || "").trim(),

      propietario:
        String(fila.Propietarios || "").trim(),

      cuenta,

      valorOriginal,

      valida: Boolean(cuenta),

      motivo: cuenta
        ? "OK"
        : valorOriginal
        ? "FORMATO INVALIDO"
        : "SIN CUENTA",
    });
  }

  return registros;
}

/**
 * Obtiene cuentas válidas únicas.
 */
function obtenerCuentasUnicas(registros) {
  const cuentas = new Set();

  for (const registro of registros) {
    if (registro.cuenta) {
      cuentas.add(registro.cuenta);
    }
  }

  return [...cuentas];
}

/**
 * Calcula estadísticas.
 */
function obtenerEstadisticas(registros, cuentasUnicas) {
  const total = registros.length;

  const validos = registros.filter(
    (r) => r.valida
  ).length;

  const sinCuenta = registros.filter(
    (r) => !r.valida && !r.valorOriginal
  ).length;

  const formatoInvalido = registros.filter(
    (r) =>
      !r.valida &&
      Boolean(r.valorOriginal)
  ).length;

  const duplicados =
    validos - cuentasUnicas.length;

  return {
    total,
    validos,
    cuentasUnicas: cuentasUnicas.length,
    sinCuenta,
    formatoInvalido,
    duplicados,
  };
}

module.exports = {
  leerExcel,
  normalizarCuenta,
  prepararRegistros,
  obtenerCuentasUnicas,
  obtenerEstadisticas,
};