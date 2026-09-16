const fs = require("fs");
const path = require("path");

const carpeta = path.join(
  __dirname,
  "..",
  "cache"
);

const archivo = path.join(
  carpeta,
  "resultados.json"
);

function asegurarCarpeta() {
  if (!fs.existsSync(carpeta)) {
    fs.mkdirSync(carpeta, {
      recursive: true,
    });
  }
}

function cargarCache() {
  asegurarCarpeta();

  if (!fs.existsSync(archivo)) {
    return {};
  }

  try {
    return JSON.parse(
      fs.readFileSync(archivo, "utf8")
    );
  } catch {
    return {};
  }
}

function guardarResultado(resultado) {
  asegurarCarpeta();

  const cache = cargarCache();

  cache[String(resultado.nic)] = {
    ...resultado,
    actualizado:
      new Date().toISOString(),
  };

  fs.writeFileSync(
    archivo,
    JSON.stringify(cache, null, 2),
    "utf8"
  );
}

function tieneResultado(nic) {
  const cache = cargarCache();

  return Boolean(
    cache[String(nic)]
  );
}

function obtenerResultado(nic) {
  const cache = cargarCache();

  return (
    cache[String(nic)] || null
  );
}

function obtenerTodos() {
  return cargarCache();
}

module.exports = {
  cargarCache,
  guardarResultado,
  tieneResultado,
  obtenerResultado,
  obtenerTodos,
};