const fs = require("fs");
const path = require("path");

const {
  consultarPadron,
  procesarResultado,
} = require("./guaymallen");

const CACHE_DIR = path.join(__dirname, "..", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "resultados.json");

function cargarCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    console.log("⚠ No se pudo leer la caché. Se iniciará una nueva.");
    return {};
  }
}

function guardarCache(cache) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify(cache, null, 2),
    "utf8"
  );
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function consultarTodos(padrones) {
  const cache = cargarCache();

  const resultados = [];

  for (let i = 0; i < padrones.length; i++) {
    const padron = padrones[i];

    console.log(
      `[${i + 1}/${padrones.length}] Consultando padrón ${padron}...`
    );

    // Si ya existe en caché, no volvemos a consultar
    if (cache[padron]) {
      console.log("   ↳ Usando caché");

      resultados.push(cache[padron]);
      continue;
    }

    const respuesta = await consultarPadron(padron);

    const resultado = procesarResultado(respuesta, padron);

    cache[padron] = resultado;

    guardarCache(cache);

    resultados.push(resultado);

    if (resultado.estado === "CON DEUDA") {
      console.log(
        `   ✓ ${resultado.cantidadCuotas} cuotas | Total: $${resultado.total.toLocaleString(
          "es-AR"
        )}`
      );
    } else {
      console.log(`   ✓ ${resultado.estado}`);
    }

    // Pequeña pausa entre consultas
    await esperar(300);
  }

  return resultados;
}

module.exports = {
  consultarTodos,
};