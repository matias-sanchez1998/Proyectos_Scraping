const fs = require("fs");
const path = require("path");

const {
  consultarCuenta,
  procesarCuenta,
} = require("./aysam");

const CACHE_DIR = path.join(__dirname, "..", "cache");
const CACHE_FILE = path.join(
  CACHE_DIR,
  "resultados.json"
);

function cargarCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    return {};
  }

  try {
    return JSON.parse(
      fs.readFileSync(CACHE_FILE, "utf8")
    );
  } catch (error) {
    console.log(
      "⚠ La caché no pudo leerse. Se creará una nueva."
    );

    return {};
  }
}

function guardarCache(cache) {
  fs.mkdirSync(CACHE_DIR, {
    recursive: true,
  });

  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify(cache, null, 2),
    "utf8"
  );
}

function esperar(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

async function consultarTodas(cuentas) {
  const cache = cargarCache();

  const resultados = [];

  for (let i = 0; i < cuentas.length; i++) {
    const cuenta = cuentas[i];

    console.log(
      `[${i + 1}/${cuentas.length}] Consultando ${cuenta}...`
    );

    // Ya consultada anteriormente
    if (cache[cuenta]) {
      console.log("   ↳ Usando caché");

      resultados.push(cache[cuenta]);

      continue;
    }

    const respuesta =
      await consultarCuenta(cuenta);

    const resultado =
      procesarCuenta(respuesta);

    // Guardamos el número de cuenta aunque AYSAM
    // no lo haya devuelto correctamente.
    if (!resultado.cuenta) {
      resultado.cuenta = cuenta;
    }

    cache[cuenta] = resultado;

    guardarCache(cache);

    resultados.push(resultado);

    switch (resultado.estado) {
      case "CON DEUDA":
        console.log(
          `   ✓ ${resultado.cantidadFacturas} facturas`
        );

        console.log(
          `   ✓ Deuda total: $${resultado.deudaTotal.toLocaleString(
            "es-AR",
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }
          )}`
        );

        break;

      case "SIN DEUDA":
        console.log("   ✓ SIN DEUDA");
        break;

      case "ERROR":
        console.log(
          `   ⚠ ERROR: ${resultado.mensaje}`
        );

        break;
    }

    /*
      Pausa pequeña para no hacer todas las solicitudes
      inmediatamente.
    */
    await esperar(400);
  }

  return resultados;
}

module.exports = {
  consultarTodas,
};