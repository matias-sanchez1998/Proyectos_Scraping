/**
 * Oficina virtual nueva de EDEMSA: consulta por NIC sin CAPTCHA.
 * Conserva procesarEdemsa(rutaExcel), las columnas y la caché.
 * El saldo se lee del campo Total de la consulta actual.
 */

import { chromium } from "playwright";
import { leerExcel, guardarExcel } from "../core/excel.js";
import { cargarCache, guardarEnCache } from "../core/cache.js";
import { mostrarProgreso } from "../core/logger.js";
import pLimit from "p-limit";
import path from "node:path";
import fs from "node:fs/promises";

const URL_CONSULTA = "https://oficinavirtual.edemsa.com/iniciar-sesion/nic";

const VERSION_CACHE = "edemsa-nic-cuotas-v3";

const CONCURRENCIA = Math.max(
  1,
  Math.min(3, Number(process.env.EDEMSA_CONCURRENCIA) || 2),
);

const CACHE_HORAS = Math.max(
  0,
  Number(process.env.EDEMSA_CACHE_HORAS ?? 6) || 0,
);

const HEADLESS = process.env.EDEMSA_HEADLESS !== "0";

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const limpio = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

export function convertirImporteEdemsa(valor) {
  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor >= 0 ? valor : null;
  }

  let s = String(valor ?? "")
    .replace(/\u00a0/g, " ")
    .trim();

  s = s.replace(/^\$\s*/, "").replace(/\s/g, "");

  if (!/^\d[\d.,]*$/.test(s)) return null;

  if (s.includes(",")) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(s)) {
      return null;
    }

    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  } else if (!/^\d+(?:\.\d{1,2})?$/.test(s)) {
    return null;
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Compatibilidad adicional para el detalle de facturas.
// El saldo total siempre se obtiene de la pantalla.
function detalleDesdeJson(respuestas) {
  const facturas = [];
  const vistas = new Set();
  let visitados = 0;

  const valor = (objeto, claves) =>
    Object.entries(objeto).find(([k]) => claves.includes(normalizar(k)))?.[1];

  function visitar(objeto, profundidad = 0) {
    if (
      !objeto ||
      typeof objeto !== "object" ||
      profundidad > 10 ||
      ++visitados > 10000
    ) {
      return;
    }

    if (Array.isArray(objeto)) {
      objeto.slice(0, 300).forEach((v) => {
        visitar(v, profundidad + 1);
      });
      return;
    }

    const estado = normalizar(
      valor(objeto, ["estadofactura", "estadopago", "estado", "situacion"]),
    );

    const numero = limpio(
      valor(objeto, ["numerofactura", "nrofactura", "factura", "comprobante"]),
    );

    const fecha = limpio(
      valor(objeto, ["fechavencimiento", "vencimiento", "fecha1vencimiento"]),
    );

    const cuota = limpio(valor(objeto, ["cuota", "numerocuota", "nrocuota"]));

    const monto = convertirImporteEdemsa(
      valor(objeto, [
        "importependiente",
        "saldo",
        "importeadeudado",
        "importe",
        "monto",
        "total",
      ]),
    );

    const pendiente =
      /^(pendiente|impaga|impago|adeudada|vencida|vencido|nopagada|unpaid|overdue)$/.test(
        estado,
      );

    if (pendiente && numero && fecha && monto !== null) {
      const clave = [numero, fecha, cuota].join("|");

      if (!vistas.has(clave)) {
        vistas.add(clave);
        facturas.push({ numero, fecha, cuota, monto });
      }
    }

    Object.values(objeto).forEach((v) => {
      if (v && typeof v === "object") {
        visitar(v, profundidad + 1);
      }
    });
  }

  respuestas.forEach((r) => visitar(r));
  return facturas;
}

export function interpretarResumenEdemsa(resumen, respuestas = []) {
  if (!resumen?.esConsulta || !resumen.titular || !resumen.direccion) {
    throw new Error("La página no mostró los datos de la consulta.");
  }

  const deudaTotal = convertirImporteEdemsa(resumen.total);

  if (deudaTotal === null) {
    throw new Error("No se pudo leer el campo Total.");
  }

  const sinFacturas = /no\s+existen\s+facturas\s+adeudadas/i.test(
    resumen.texto || "",
  );

  if ((deudaTotal > 0 && sinFacturas) || (deudaTotal === 0 && !sinFacturas)) {
    throw new Error("El saldo y el listado de facturas todavía no coinciden.");
  }

  const unicas = new Map();

  for (const fila of resumen.facturas || []) {
    const pendiente =
      /^(pendiente|impaga|impago|adeudada|vencida|vencido)$/.test(
        normalizar(fila.estado),
      );

    if (!pendiente) continue;

    const monto = convertirImporteEdemsa(fila.importe);

    if (!fila.numero || !fila.fecha || !fila.cuota || monto === null) {
      continue;
    }

    const clave = [fila.numero, fila.cuota, fila.fecha].join("|");

    const anterior = unicas.get(clave);

    if (anterior && anterior.monto !== monto) {
      throw new Error(
        "El importe de una cuota cambió durante la consulta. " +
          "Volvé a consultar.",
      );
    }

    unicas.set(clave, {
      numero: limpio(fila.numero),
      periodo: limpio(fila.periodo),
      cuota: limpio(fila.cuota),
      fecha: limpio(fila.fecha),
      monto,
    });
  }

  let facturas =
    deudaTotal > 0
      ? resumen.facturas?.length
        ? [...unicas.values()]
        : detalleDesdeJson(respuestas)
      : [];

  const suma = facturas.reduce(
    (total, factura) => total + Math.round(factura.monto * 100),
    0,
  );

  const detalleVerificado =
    !resumen.paginacionIncompleta &&
    (deudaTotal === 0 ||
      (facturas.length > 0 && suma === Math.round(deudaTotal * 100)));

  if (!detalleVerificado) facturas = [];

  return {
    estado: deudaTotal > 0 ? "CON DEUDA" : "AL DÍA",
    titular: limpio(resumen.titular),
    direccion: limpio(resumen.direccion),
    deudaTotal,

    // Conserva el conteo de cuotas usado por el Excel anterior.
    cantidadFacturas: detalleVerificado ? facturas.length : "",

    cantidadComprobantes: detalleVerificado
      ? new Set(facturas.map((f) => f.numero)).size
      : "",

    vencimientos: facturas.map((f) => ({
      fecha: f.fecha,
      monto: f.monto,
    })),

    detalleFacturas: facturas,
    detalleVerificado,

    mensaje: detalleVerificado
      ? ""
      : "Saldo leído del sitio. No se pudo verificar el detalle " +
        "completo de cuotas; revisar la oficina virtual.",
  };
}

async function leerResumen(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");

    if (!main) return { esConsulta: false };

    const parrafos = [...main.querySelectorAll("p")];

    const siguiente = (etiqueta) => {
      const parrafo = parrafos.find(
        (p) => p.textContent.trim().toLowerCase() === etiqueta.toLowerCase(),
      );

      return parrafo?.nextElementSibling?.textContent.trim() || "";
    };

    const facturas = [];

    for (const tabla of main.querySelectorAll("table")) {
      let contenedor = tabla.parentElement;

      while (
        contenedor &&
        contenedor !== main &&
        !contenedor.querySelector("strong")
      ) {
        contenedor = contenedor.parentElement;
      }

      const encabezado = contenedor?.querySelector("strong")?.textContent || "";

      const datos = encabezado.match(
        /Factura\s*N[°ºo]?\s*(\S+)\s*-\s*Per[ií]odo:\s*(\d{4}-\d{2})/i,
      );

      if (!datos) continue;

      for (const fila of tabla.querySelectorAll("tbody tr")) {
        const celda = (etiqueta) =>
          fila
            .querySelector('td[data-label="' + etiqueta + '"]')
            ?.textContent.trim() || "";

        facturas.push({
          numero: datos[1],
          periodo: datos[2],
          cuota: celda("VENCIMIENTO"),
          importe: celda("IMPORTE"),
          fecha: celda("FECHA DE VTO"),
          estado: celda("ESTADO DE PAGO"),
        });
      }
    }

    const huella = [...main.querySelectorAll("strong, table")]
      .map((elemento) => elemento.textContent)
      .join("|");

    return {
      esConsulta: !!parrafos.find(
        (p) => p.textContent.trim() === "Titular de la cuenta:",
      ),
      titular: siguiente("Titular de la cuenta:"),
      direccion: siguiente("Dirección del suministro:"),
      total: siguiente("Total:"),
      texto: main.innerText.slice(0, 100000),
      facturas,
      huella,
    };
  });
}

async function leerTodasLasFacturas(page) {
  // El total puede aparecer antes que las tablas.
  await page
    .waitForFunction(
      () => {
        const main = document.querySelector("main");

        return (
          main &&
          (main.querySelector("table tbody tr") ||
            /no\s+existen\s+facturas\s+adeudadas/i.test(main.innerText))
        );
      },
      null,
      { timeout: 10000 },
    )
    .catch(() => {});

  const acumuladas = [];
  const vistas = new Set();
  let resumen;

  for (let pagina = 0; pagina < 100; pagina++) {
    resumen = await leerResumen(page);

    if (vistas.has(resumen.huella)) {
      return {
        ...resumen,
        facturas: acumuladas,
        paginacionIncompleta: true,
      };
    }

    vistas.add(resumen.huella);
    acumuladas.push(...(resumen.facturas || []));

    const siguiente = page.locator(
      'main button:has(svg[data-testid="NavigateNextIcon"])',
    );

    if ((await siguiente.count()) === 0 || (await siguiente.isDisabled())) {
      return {
        ...resumen,
        facturas: acumuladas,
      };
    }

    const huella = resumen.huella;

    await siguiente.click();

    try {
      await page.waitForFunction(
        (anterior) => {
          const main = document.querySelector("main");

          const actual =
            main &&
            [...main.querySelectorAll("strong, table")]
              .map((elemento) => elemento.textContent)
              .join("|");

          return !!main?.querySelector("table tbody tr") && actual !== anterior;
        },
        huella,
        { timeout: 15000 },
      );

      await page
        .waitForLoadState("networkidle", {
          timeout: 5000,
        })
        .catch(() => {});
    } catch {
      return {
        ...resumen,
        facturas: acumuladas,
        paginacionIncompleta: true,
      };
    }
  }

  return {
    ...resumen,
    facturas: acumuladas,
    paginacionIncompleta: true,
  };
}

export async function consultarNIC(page, nic) {
  const cuenta = String(nic ?? "").trim();

  if (!/^\d+$/.test(cuenta)) {
    throw new Error("El NIC debe contener únicamente números.");
  }

  await page.goto(URL_CONSULTA, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  const input = page.getByPlaceholder("Ingresa tu NIC", { exact: true });

  await input.waitFor({
    state: "visible",
    timeout: 25000,
  });

  await input.fill(cuenta);

  const respuestas = [];
  const pendientes = new Set();

  const recibir = (response) => {
    const tipo = response.request().resourceType();

    if (
      !["xhr", "fetch"].includes(tipo) ||
      !response.ok() ||
      respuestas.length >= 30
    ) {
      return;
    }

    const host = new URL(response.url()).hostname;
    const contentType = response.headers()["content-type"] || "";

    if (
      !/(^|\.)edemsa\.com(?:\.ar)?$/.test(host) ||
      !/json/i.test(contentType)
    ) {
      return;
    }

    const promesa = response
      .json()
      .then((datos) => respuestas.push(datos))
      .catch(() => {})
      .finally(() => pendientes.delete(promesa));

    pendientes.add(promesa);
  };

  page.on("response", recibir);

  try {
    await page
      .getByRole("button", {
        name: "Consultar",
        exact: true,
      })
      .click({ timeout: 15000 });

    let ultimoError = "La consulta no mostró un resultado.";

    let primerResumen = 0;
    const limite = Date.now() + 30000;

    while (Date.now() < limite) {
      const resumen = await leerResumen(page).catch(() => ({
        esConsulta: false,
      }));

      if (resumen.esConsulta && resumen.total) {
        await Promise.allSettled([...pendientes]);

        try {
          if (!primerResumen) {
            primerResumen = Date.now();
          }

          const resumenCompleto =
            convertirImporteEdemsa(resumen.total) > 0
              ? await leerTodasLasFacturas(page)
              : resumen;

          const dato = interpretarResumenEdemsa(resumenCompleto, respuestas);
          if (dato.detalleVerificado || Date.now() - primerResumen >= 4000) {
            return dato;
          }
        } catch (error) {
          ultimoError = error.message;
        }
      } else {
        const alertas = await page
          .locator('[role="alert"]')
          .allTextContents()
          .catch(() => []);

        const error = alertas
          .map(limpio)
          .find((texto) =>
            /no\s+(?:se\s+)?encontr|inv[aá]lid|no\s+existe|error|intente\s+nuevamente/i.test(
              texto,
            ),
          );

        if (error) throw new Error(error);
      }

      await page.waitForTimeout(500);
    }

    throw new Error(ultimoError);
  } catch (error) {
    if (process.env.EDEMSA_DEBUG === "1") {
      const carpeta = path.join(
        process.cwd(),
        "resultados",
        "diagnosticos_edemsa",
      );

      await fs.mkdir(carpeta, { recursive: true });

      const resumen = await leerResumen(page).catch(() => ({}));

      await fs
        .writeFile(
          path.join(carpeta, `NIC_${cuenta}.json`),
          JSON.stringify({ error: error.message, resumen }, null, 2),
        )
        .catch(() => {});
    }

    throw error;
  } finally {
    page.off("response", recibir);
    await Promise.allSettled([...pendientes]);
  }
}

function extraerNIC(cliente) {
  const claves = [
    "nicedemsa",
    "nic",
    "edemsa",
    "nis",
    "cuenta",
    "nnic",
    "nronic",
    "suministro",
  ];

  for (const clave of claves) {
    for (const [nombre, valor] of Object.entries(cliente)) {
      if (normalizar(nombre) !== clave || valor == null) {
        continue;
      }

      const nic = String(valor).trim();

      if (nic && !/^-+$/.test(nic)) {
        return nic;
      }
    }
  }

  return "";
}

function cacheVigente(cache) {
  const edad = Date.now() - new Date(cache?.fecha).getTime();

  return (
    cache?.version === VERSION_CACHE &&
    CACHE_HORAS > 0 &&
    ["CON DEUDA", "AL DÍA"].includes(cache.estado) &&
    Number.isFinite(cache.deudaTotal) &&
    cache.deudaTotal >= 0 &&
    Number.isFinite(edad) &&
    edad >= 0 &&
    edad < CACHE_HORAS * 3600000
  );
}

export async function procesarEdemsa(rutaArchivoEntrada) {
  const clientes = await leerExcel(rutaArchivoEntrada);
  const cache = cargarCache("edemsa") || {};

  const limit = pLimit(CONCURRENCIA);
  const consultas = new Map();

  let browser;
  let terminados = 0;

  global.progresoScraping = {
    porcentaje: clientes.length ? 0 : 100,
    actual: 0,
    total: clientes.length,
  };

  console.log(
    `[*] EDEMSA: consulta por NIC sin CAPTCHA, ` +
      `${CONCURRENCIA} consultas simultáneas.`,
  );

  try {
    if (clientes.some((cliente) => extraerNIC(cliente))) {
      browser = await chromium.launch({
        headless: HEADLESS,
      });
    }

    async function obtener(nic) {
      if (cacheVigente(cache[nic])) {
        return {
          ...cache[nic],
          cantidadFacturas: cache[nic].facturas,
          origen: "CACHE",
        };
      }

      const page = await browser.newPage();

      try {
        await page.route("**/*", (route) => {
          const tipo = route.request().resourceType();

          return ["image", "font", "media"].includes(tipo)
            ? route.abort()
            : route.continue();
        });

        const dato = await consultarNIC(page, nic);

        cache[nic] = {
          ...dato,
          facturas: dato.cantidadFacturas,
          version: VERSION_CACHE,
          fecha: new Date().toISOString(),
        };

        guardarEnCache("edemsa", cache);

        return {
          ...dato,
          origen: "EN VIVO",
        };
      } finally {
        await page.close().catch(() => {});
      }
    }

    const resultados = await Promise.all(
      clientes.map(async (cliente) => {
        const nic = extraerNIC(cliente);

        try {
          if (!nic) return null;

          if (!consultas.has(nic)) {
            consultas.set(
              nic,
              limit(() => obtener(nic)),
            );
          }

          mostrarProgreso(
            terminados + 1,
            clientes.length,
            `NIC EDEMSA: ${nic}`,
          );

          const dato = await consultas.get(nic);

          return {
            ...cliente,
            ESTADO_EDEMSA: dato.estado,
            TITULAR_EDEMSA: dato.titular,
            DIRECCION_EDEMSA: dato.direccion,
            DEUDA_TOTAL_EDEMSA: dato.deudaTotal,
            FACTURAS_PENDIENTES_EDEMSA: dato.cantidadFacturas,
            ORIGEN: dato.origen,
            MENSAJE: dato.mensaje || "",
          };
        } catch (error) {
          console.error(`EDEMSA NIC ${nic}: ${error.message}`);

          return {
            ...cliente,
            ESTADO_EDEMSA: "ERROR CONSULTA",
            TITULAR_EDEMSA: "N/D",
            DIRECCION_EDEMSA: "N/D",
            DEUDA_TOTAL_EDEMSA: "",
            FACTURAS_PENDIENTES_EDEMSA: "",
            ORIGEN: "ERROR",
            MENSAJE: error.message,
          };
        } finally {
          terminados++;

          global.progresoScraping = {
            porcentaje: Math.round((terminados / clientes.length) * 100),
            actual: terminados,
            total: clientes.length,
          };
        }
      }),
    );

    const salida = path.join(
      process.cwd(),
      "resultados",
      "Deudas_EDEMSA_Actualizado.xlsx",
    );

    await fs.mkdir(path.dirname(salida), {
      recursive: true,
    });

    await guardarExcel(resultados.filter(Boolean), salida);

    console.log(`[+] EDEMSA finalizado: ${salida}`);

    return salida;
  } finally {
    await browser?.close().catch(() => {});
  }
}
