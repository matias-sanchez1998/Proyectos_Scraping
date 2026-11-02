import express from "express";
import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";
import { load } from "cheerio";
import puppeteer from "puppeteer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const router = express.Router();

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const carpetaPlantillas = path.join(raiz, "plantillas");
const carpetaResultados = path.join(raiz, "contratos_generados");

router.use(express.json({ limit: "3mb" }));

// Manejo de errores para las rutas.
const manejar = (funcion) => async (req, res, next) => {
  try {
    await funcion(req, res);
  } catch (error) {
    next(error);
  }
};

const error400 = (mensaje) =>
  Object.assign(new Error(mensaje), { status: 400 });

// ============================================================
// LISTAR LOS MODELOS WORD DISPONIBLES
// ============================================================

async function listarModelos() {
  await fs.mkdir(carpetaPlantillas, { recursive: true });

  const archivos = await fs.readdir(carpetaPlantillas, {
    withFileTypes: true,
  });

  return archivos
    .filter(
      (archivo) =>
        archivo.isFile() &&
        /\.docx$/i.test(archivo.name) &&
        !archivo.name.startsWith("~$"),
    )
    .map((archivo) => ({
      archivo: archivo.name,
      nombre: archivo.name.replace(/\.docx$/i, ""),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// ============================================================
// PREPARAR EL HTML DEL CONTRATO
// ============================================================

function limpiarHtml(html) {
  if (typeof html !== "string" || Buffer.byteLength(html) > 2500000) {
    throw error400(
      "El contenido del contrato no es válido o supera el tamaño permitido.",
    );
  }

  const limpio = sanitizeHtml(html, {
    allowedTags: [
      "p",
      "div",
      "span",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "h1",
      "h2",
      "h3",
      "h4",
      "ol",
      "ul",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "blockquote",
      "hr",
      "sub",
      "sup",
    ],

    allowedAttributes: {
      "*": ["style"],
      td: ["colspan", "rowspan", "style"],
      th: ["colspan", "rowspan", "style"],
      ol: ["start", "style"],
    },

    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
        "font-size": [/^\d{1,3}(\.\d+)?(px|pt)$/],
        "font-family": [/^[a-zA-Z0-9 ,"'-]{1,100}$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
        "font-style": [/^(normal|italic)$/],
        "text-decoration": [/^(none|underline|line-through)$/],
        "line-height": [/^\d{1,2}(\.\d+)?(px|pt|%)?$/],
        "page-break-before": [/^(always|auto)$/],
        "break-before": [/^(page|auto)$/],
      },
    },
  });

  if (load(limpio).root().text().trim().length < 20) {
    throw error400("El contrato está vacío.");
  }

  return limpio;
}

// ============================================================
// REEMPLAZAR DATOS SIN RESUMIR LAS CLÁUSULAS
// ============================================================

// Los reemplazos se aplican sobre el texto original.
// También funcionan cuando un nombre está repartido entre
// varios fragmentos con negrita, cursiva u otro formato.

function aplicarReemplazos(html, reemplazos) {
  if (!Array.isArray(reemplazos) || reemplazos.length > 300) {
    throw error400("Reemplazos no válidos.");
  }

  const reglas = reemplazos
    .map((reemplazo) => {
      if (
        typeof reemplazo.buscar !== "string" ||
        !reemplazo.buscar.trim() ||
        typeof reemplazo.reemplazar !== "string" ||
        reemplazo.buscar.length > 20000 ||
        reemplazo.reemplazar.length > 20000
      ) {
        throw error400(
          "Cada reemplazo necesita un texto a buscar y un nuevo valor.",
        );
      }

      return reemplazo;
    })
    .filter((reemplazo) => reemplazo.buscar !== reemplazo.reemplazar)
    .sort((a, b) => b.buscar.length - a.buscar.length);

  const $ = load(html, null, false);
  const bloques = "p,li,td,th,h1,h2,h3,h4";

  $(bloques)
    .filter((_indice, elemento) => $(elemento).find(bloques).length === 0)
    .each((_indice, elemento) => {
      const nodos = [];

      function recorrer(nodo) {
        if (nodo.type === "text") {
          nodos.push(nodo);
        } else {
          for (const hijo of nodo.children || []) {
            recorrer(hijo);
          }
        }
      }

      recorrer(elemento);

      const original = nodos.map((nodo) => nodo.data).join("");

      const cambios = [];

      for (const regla of reglas) {
        const patron = regla.buscar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const expresion = new RegExp(patron, "giu");

        for (const coincidencia of original.matchAll(expresion)) {
          const inicio = coincidencia.index;
          const fin = inicio + coincidencia[0].length;

          const superpuesto = cambios.some(
            (cambio) => inicio < cambio.fin && fin > cambio.inicio,
          );

          if (!superpuesto) {
            cambios.push({
              inicio,
              fin,
              valor: regla.reemplazar,
            });
          }
        }
      }

      cambios.sort((a, b) => a.inicio - b.inicio);

      let offset = 0;

      for (const nodo of nodos) {
        const inicioNodo = offset;
        const finNodo = offset + nodo.data.length;

        let resultado = "";
        let cursor = inicioNodo;

        const cambiosDelNodo = cambios.filter(
          (cambio) => cambio.fin > inicioNodo && cambio.inicio < finNodo,
        );

        for (const cambio of cambiosDelNodo) {
          resultado += original.slice(cursor, Math.max(cursor, cambio.inicio));

          if (cambio.inicio >= inicioNodo) {
            resultado += cambio.valor;
          }

          cursor = Math.min(finNodo, cambio.fin);
        }

        nodo.data = resultado + original.slice(cursor, finNodo);

        offset = finNodo;
      }
    });

  return $.html();
}

// ============================================================
// API: MODELOS DISPONIBLES
// ============================================================

router.get(
  "/modelos",
  manejar(async (_req, res) => {
    res.json(await listarModelos());
  }),
);

// ============================================================
// API: GENERAR BORRADOR DESDE EL WORD COMPLETO
// ============================================================

router.post(
  "/generar-vista-previa",
  manejar(async (req, res) => {
    const { modelo, reemplazos = [] } = req.body;

    const modelos = await listarModelos();

    const elegido = modelos.find((item) => item.archivo === modelo);

    if (!elegido) {
      throw error400("Elegí uno de los modelos Word disponibles.");
    }

    const resultado = await mammoth.convertToHtml(
      {
        path: path.join(carpetaPlantillas, elegido.archivo),
      },
      {
        styleMap: ["u => u", "strike => s"],
        ignoreEmptyParagraphs: false,
      },
    );

    const htmlConDatos = aplicarReemplazos(resultado.value, reemplazos);

    res.type("html").send(limpiarHtml(htmlConDatos));
  }),
);

// ============================================================
// CREAR PDF CON EL TEXTO ACTUAL DEL EDITOR
// ============================================================

async function crearPdf(htmlEditado) {
  const contenido = limpiarHtml(htmlEditado);
  let browser;

  try {
    browser = await puppeteer.launch({
      ...(process.env.CONTRATOS_CHROME_PATH
        ? {
            executablePath: process.env.CONTRATOS_CHROME_PATH,
          }
        : {}),

      ...(typeof process.getuid === "function" && process.getuid() === 0
        ? { args: ["--no-sandbox"] }
        : {}),
    });

    const pagina = await browser.newPage();

    await pagina.setJavaScriptEnabled(false);
    await pagina.setRequestInterception(true);

    pagina.on("request", (solicitud) => solicitud.abort());

    await pagina.setContent(
      `<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <style>
            body {
              margin: 0;
              font-family: Arial, sans-serif;
              font-size: 11pt;
              line-height: 1.4;
              text-align: justify;
            }

            p {
              margin: 0 0 8pt;
              white-space: pre-wrap;
              orphans: 3;
              widows: 3;
            }

            h1, h2, h3, h4 {
              color: #000;
              break-after: avoid;
            }

            table {
              width: 100%;
              border-collapse: collapse;
            }

            td, th {
              border: 1px solid #aaa;
              padding: 6pt;
            }
          </style>
        </head>
        <body>${contenido}</body>
      </html>`,
      {
        waitUntil: "load",
        timeout: 30000,
      },
    );

    await pagina.evaluate(() => document.fonts.ready);

    return Buffer.from(
      await pagina.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "2.5cm",
          right: "2cm",
          bottom: "2.5cm",
          left: "2cm",
        },
      }),
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ============================================================
// API: VISTA PREVIA DEL PDF, SIN GUARDARLO
// ============================================================

router.post(
  "/vista-pdf",
  manejar(async (req, res) => {
    const pdf = await crearPdf(req.body.htmlEditado);

    res.type("pdf").set("Cache-Control", "no-store").send(pdf);
  }),
);

// ============================================================
// API: GUARDAR EL PDF FINAL
// ============================================================

// Mantiene la respuesta JSON que espera tu editor actual.
// La descarga automática se conecta al modificar editor.html.

router.post(
  "/generar-pdf",
  manejar(async (req, res) => {
    const bytes = await crearPdf(req.body.htmlEditado);

    const nombre =
      String(req.body.nombreArchivo || "Contrato")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 90) || "Contrato";

    const archivo = `${randomUUID()}_${nombre}.pdf`;

    await fs.mkdir(carpetaResultados, {
      recursive: true,
    });

    await fs.writeFile(path.join(carpetaResultados, archivo), bytes);

    res.json({
      success: true,
      mensaje: "PDF generado con el texto editado.",
      url: `/api/contratos/descargar-pdf/${archivo}`,
    });
  }),
);

// ============================================================
// API: DESCARGAR UN PDF GENERADO
// ============================================================

router.get(
  "/descargar-pdf/:archivo",
  manejar(async (req, res) => {
    const archivo = req.params.archivo;

    const nombreValido =
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}_[a-zA-Z0-9_-]{1,90}\.pdf$/;

    if (!nombreValido.test(archivo)) {
      throw error400("Archivo no válido.");
    }

    const ruta = path.join(carpetaResultados, archivo);

    try {
      await fs.access(ruta);
    } catch {
      throw Object.assign(new Error("No se encontró el PDF."), { status: 404 });
    }

    res.download(ruta, archivo.slice(37));
  }),
);

// ============================================================
// MANEJO DE ERRORES
// ============================================================

router.use((error, _req, res, _next) => {
  console.error("Contratos:", error.message);

  res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : "No se pudo completar la operación. Revisá el error en la terminal.",
  });
});

export default router;
