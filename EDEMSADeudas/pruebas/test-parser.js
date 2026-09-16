const fs = require("fs");

const {
  extraerFactura,
  calcularDeuda,
} = require("../src/parser");

function probar(nombre, archivo) {
  console.log("\n");
  console.log("======================================");
  console.log(`        ${nombre}`);
  console.log("======================================");

  if (!fs.existsSync(archivo)) {
    console.log(`❌ No existe: ${archivo}`);
    return;
  }

  const html = fs.readFileSync(
    archivo,
    "utf8"
  );

  const facturas = extraerFactura(html);
  const deuda = calcularDeuda(facturas);

  console.log("\nFACTURAS");
  console.log("--------------------------------------");

  console.dir(facturas, {
    depth: null,
  });

  console.log("\nDEUDA");
  console.log("--------------------------------------");

  console.log(
    `Facturas pendientes: ${deuda.cantidadPendientes}`
  );

  console.log(
    `Deuda total: $${deuda.deudaTotal.toLocaleString(
      "es-AR",
      {
        minimumFractionDigits: 2,
      }
    )}`
  );
}

probar(
  "PRUEBA FACTURA NORMAL",
  "pruebas/respuesta_deuda.html"
);

probar(
  "PRUEBA CAR + FACTURA",
  "pruebas/respuesta_deuda_car.html"
);