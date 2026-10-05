import "dotenv/config"; // <-- Agrega esto en la línea 1
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";
import { procesarAysam } from "./src/scrapers/aysam.js";
import { procesarGuaymallen } from "./src/scrapers/guaymallen.js";
import { procesarEdemsa } from "./src/scrapers/edemsa.js";
import { procesarEcogas } from "./src/scrapers/ecogas.js";
import { leerExcel, guardarExcel } from "./src/core/excel.js";
import ExcelJS from "exceljs";
import htmlToDocx from "html-to-docx";
import rutasContratos from "./src/contratos.js"; //import Docxtemplater from "docxtemplater";

function mostrarConsumoRAM() {
  const memoria = process.memoryUsage();
  const formatoMB = (bytes) => (bytes / 1024 / 1024).toFixed(2) + " MB";

  console.log("\n--- CONSUMO DE MEMORIA ACTUAL ---");
  console.log(`RAM en uso (Heap Used): ${formatoMB(memoria.heapUsed)}`);
  console.log(`RAM total reservada (RSS): ${formatoMB(memoria.rss)}`);
  console.log("---------------------------------\n");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Asegurarnos de que existan las carpetas necesarias
const dirs = [
  "data",
  "resultados",
  "public",
  "plantillas",
  "contratos_generados",
];
dirs.forEach((dir) => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
});

// Configurar Multer para guardar los Excels subidos en la carpeta "data"
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "data/");
  },
  filename: (req, file, cb) => {
    // Guardamos el archivo con su nombre original
    cb(null, file.originalname);
  },
});
const upload = multer({ storage: storage });
// ============================================================================
// API: PROGRESO Y CONTROL DE CACHÉ
// ============================================================================

// Variable global para que los scrapers actualicen su estado
global.progresoScraping = { porcentaje: 0, actual: 0, total: 0 };

app.get("/api/progreso", (req, res) => {
  res.json(global.progresoScraping);
});

app.post("/api/borrar-cache", express.json(), (req, res) => {
  try {
    const { servicio } = req.body;
    const servicios =
      servicio === "todos"
        ? ["aysam", "guaymallen", "edemsa", "ecogas"]
        : [servicio];
    let borrados = 0;

    servicios.forEach((srv) => {
      const ruta = path.join(process.cwd(), "cache", `cache-${srv}.json`);
      if (fs.existsSync(ruta)) {
        fs.unlinkSync(ruta); // Borra el archivo físicamente
        borrados++;
      }
    });

    res.json({
      exito: true,
      mensaje: `Caché limpiada exitosamente (${borrados} archivo/s borrados).`,
    });
  } catch (error) {
    console.error("Error al borrar caché:", error);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error al intentar borrar la caché." });
  }
});
// Servir los archivos estáticos de la web
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use("/api/contratos", rutasContratos);
app.use(express.static("public"));

// Ruta principal que recibe el formulario de la web
// ============================================================================
// API: EJECUCIÓN DE SCRAPERS
// ============================================================================

// ============================================================================
// API: EJECUCIÓN DE SCRAPERS CON DATA/MAESTRO.XLSX LOCAL
// ============================================================================

app.post("/api/consultar", upload.single("archivo"), async (req, res) => {
  try {
    const { servicio } = req.body;
    const archivo = req.file;

    // Archivo maestro local por defecto
    const rutaMaestro = path.join(__dirname, "data", "maestro.xlsx");
    const rutaExcel = archivo ? archivo.path : rutaMaestro;

    if (!archivo && !fs.existsSync(rutaMaestro)) {
      return res.status(400).json({
        exito: false,
        mensaje:
          'No se encontró el archivo base en "data/maestro.xlsx" ni se subió ningún archivo.',
      });
    }

    let rutaSalida = "";

    if (servicio === "aysam") {
      rutaSalida = await procesarAysam(rutaExcel);
    } else if (servicio === "guaymallen") {
      rutaSalida = await procesarGuaymallen(rutaExcel);
    } else if (servicio === "edemsa") {
      rutaSalida = await procesarEdemsa(rutaExcel);
    } else if (servicio === "ecogas") {
      rutaSalida = await procesarEcogas(rutaExcel);
    } else if (servicio === "todos") {
      console.log(
        "\n[!!!] INICIANDO CONSULTA GLOBAL (TODOS LOS SERVICIOS) [!!!]\n",
      );
      await procesarAysam(rutaExcel);
      await procesarGuaymallen(rutaExcel);
      await procesarEdemsa(rutaExcel);
      await procesarEcogas(rutaExcel);
      rutaSalida = "Resumen actualizado";
    } else {
      return res
        .status(400)
        .json({ exito: false, mensaje: "Servicio no válido." });
    }

    // Si se subió un archivo manual temporal desde la web, se remueve
    if (archivo && fs.existsSync(archivo.path)) {
      fs.unlinkSync(archivo.path);
    }

    res.json({
      exito: true,
      mensaje: `Scraping de ${servicio.toUpperCase()} finalizado con éxito.`,
      archivo: rutaSalida,
    });
  } catch (error) {
    console.error("Error en la ruta /api/consultar:", error);
    res.status(500).json({ exito: false, mensaje: error.message });
  }
});

app.get("/api/resumen-general", async (req, res) => {
  try {
    const rutaMaestro = path.join(process.cwd(), "data", "maestro.xlsx");

    if (!fs.existsSync(rutaMaestro)) {
      return res.json({
        exito: true,
        inquilinos: [],
        kpis: { totalDeuda: 0, conDeuda: 0, alDia: 0 },
      });
    }

    const filas = await leerExcel(rutaMaestro);

    const leerCache = (servicio) => {
      const ruta = path.join(process.cwd(), "cache", `cache-${servicio}.json`);
      if (fs.existsSync(ruta))
        return JSON.parse(fs.readFileSync(ruta, "utf-8"));
      return {};
    };

    // NUEVO: Obtener cuándo se modificó cada caché por última vez
    const obtenerFechaModificacion = (servicio) => {
      const ruta = path.join(process.cwd(), "cache", `cache-${servicio}.json`);
      if (fs.existsSync(ruta)) {
        return fs.statSync(ruta).mtime.toISOString();
      }
      return null;
    };

    const ultimasActualizaciones = {
      aysam: obtenerFechaModificacion("aysam"),
      guaymallen: obtenerFechaModificacion("guaymallen"),
      edemsa: obtenerFechaModificacion("edemsa"),
      ecogas: obtenerFechaModificacion("ecogas"),
    };

    const caches = {
      aysam: leerCache("aysam"),
      guaymallen: leerCache("guaymallen"),
      edemsa: leerCache("edemsa"),
      ecogas: leerCache("ecogas"),
    };

    const usoCuentas = {
      aysam: new Map(),
      guaymallen: new Map(),
      edemsa: new Map(),
      ecogas: new Map(),
    };
    const registrarUso = (servicio, cuenta, idFila) => {
      if (!cuenta) return;
      if (!usoCuentas[servicio].has(cuenta))
        usoCuentas[servicio].set(cuenta, new Set());
      usoCuentas[servicio].get(cuenta).add(idFila);
    };

    const obtenerInq = (f) =>
      f.INQUILINO ||
      f.INQUILINOS ||
      f.Inquilino ||
      f.Inquilinos ||
      f.inquilino ||
      f.inquilinos ||
      "";
    const obtenerProp = (f) =>
      f.PROPIETARIO ||
      f.PROPIETARIOS ||
      f.Propietario ||
      f.Propietarios ||
      f.propietario ||
      f.propietarios ||
      "";

    // BUSCADOR ESTRICTO: Ignora columnas basura para no cruzar datos
    const buscarCuentaEstricta = (fila, palabrasClave) => {
      for (const [key, value] of Object.entries(fila)) {
        if (value === undefined || value === null) continue;
        const k = key.trim().toUpperCase();

        // Ignorar columnas de texto generadas previamente
        if (
          k.includes("ESTADO") ||
          k.includes("TITULAR") ||
          k.includes("DOMICILIO") ||
          k.includes("DEUDA") ||
          k.includes("CANTIDAD") ||
          k.includes("MENSAJE")
        ) {
          continue;
        }

        const coincide = palabrasClave.some((p) => k.includes(p));
        if (
          coincide &&
          String(value).trim() !== "" &&
          String(value).trim() !== "----------"
        ) {
          return String(value).trim();
        }
      }
      return "";
    };

    // FUNCIÓN MEJORADA: Determina si alguna factura ya superó la fecha de hoy
    const determinarEstadoDeuda = (deuda, vencimientos) => {
      if (deuda === 0) return "AL DÍA";
      if (!vencimientos || vencimientos.length === 0) return "CON DEUDA";

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      let estaVencida = false;
      for (const item of vencimientos) {
        if (!item) continue;
        const vto = typeof item === "string" ? item : item.fecha;
        if (!vto) continue;

        let fechaVto;
        if (vto.includes("-") && vto.length >= 10 && vto.startsWith("20")) {
          const [anio, mes, dia] = vto.substring(0, 10).split("-");
          fechaVto = new Date(anio, mes - 1, dia);
        } else if (vto.includes("/")) {
          const [dia, mes, anio] = vto.split("/");
          fechaVto = new Date(anio, mes - 1, dia);
        }

        if (fechaVto && fechaVto < hoy) {
          estaVencida = true;
          break;
        }
      }
      return estaVencida ? "VENCIDA" : "A VENCER";
    };

    const listaInquilinos = [];

    // PROCESAR CADA FILA COMO UNA ENTIDAD ÚNICA (Por si hay inquilinos repetidos con 2 locales)
    filas.forEach((f, idx) => {
      const inq = obtenerInq(f);
      if (!inq) return;

      const item = {
        id: idx, // ID ÚNICO POR FILA
        inquilino: String(inq).trim().toUpperCase(),
        propietario: String(obtenerProp(f) || "N/D")
          .trim()
          .toUpperCase(),
        aysam: {
          deuda: 0,
          estado: "SIN CONSULTAR",
          cuenta: "",
          detalle: "",
          compartido: false,
          vencimientos: [],
        },
        guaymallen: {
          deuda: 0,
          estado: "SIN CONSULTAR",
          padron: "",
          detalle: "",
          compartido: false,
          vencimientos: [],
        },
        edemsa: {
          deuda: 0,
          estado: "SIN CONSULTAR",
          nic: "",
          detalle: "",
          compartido: false,
          vencimientos: [],
        },
        ecogas: {
          deuda: 0,
          estado: "SIN CONSULTAR",
          cuenta: "",
          detalle: "",
          compartido: false,
          vencimientos: [],
        },
        deudaTotal: 0,
      };

      // AYSAM
      const cAysam = buscarCuentaEstricta(f, ["AYSAM", "AGUA"]);
      if (cAysam) {
        item.aysam.cuenta = cAysam;
        registrarUso("aysam", cAysam, item.id);
        if (caches.aysam[cAysam]) {
          const d = caches.aysam[cAysam];
          item.aysam.deuda = Number(d.deudaTotal || d.total || 0);
          item.aysam.estado = determinarEstadoDeuda(
            item.aysam.deuda,
            d.vencimientos,
          );
          item.aysam.detalle = d.cantidadFacturas
            ? `${d.cantidadFacturas} facturas`
            : "";
          item.aysam.vencimientos = d.vencimientos || [];
        }
      }

      // GUAYMALLEN
      const cGuay = buscarCuentaEstricta(f, [
        "MUNICIPALIDAD",
        "PADRON",
        "GUAYMALLEN",
      ]);
      if (cGuay) {
        item.guaymallen.padron = cGuay;
        registrarUso("guaymallen", cGuay, item.id);
        if (caches.guaymallen[cGuay]) {
          const d = caches.guaymallen[cGuay];
          item.guaymallen.deuda = Number(d.deudaTotal || d.total || 0);
          item.guaymallen.estado = determinarEstadoDeuda(
            item.guaymallen.deuda,
            d.vencimientos,
          );
          item.guaymallen.detalle = d.cantidadCuotas
            ? `${d.cantidadCuotas} cuotas`
            : "";
          item.guaymallen.vencimientos = d.vencimientos || [];
        }
      }

      // EDEMSA
      const cEdemsa = buscarCuentaEstricta(f, ["EDEMSA", "NIC", "NIS", "LUZ"]);
      if (cEdemsa) {
        item.edemsa.nic = cEdemsa;
        registrarUso("edemsa", cEdemsa, item.id);
        if (caches.edemsa[cEdemsa]) {
          const d = caches.edemsa[cEdemsa];
          item.edemsa.deuda = Number(d.deudaTotal || d.total || 0);
          item.edemsa.estado = determinarEstadoDeuda(
            item.edemsa.deuda,
            d.vencimientos,
          );
          item.edemsa.detalle = d.facturas ? `${d.facturas} facturas` : "";
          item.edemsa.vencimientos = d.vencimientos || [];
        }
      }

      // ECOGAS
      const cEcogas = buscarCuentaEstricta(f, ["ECOGAS", "CLIENTE", "GAS"]);
      if (cEcogas) {
        item.ecogas.cuenta = cEcogas;
        registrarUso("ecogas", cEcogas, item.id);
        if (caches.ecogas[cEcogas]) {
          const d = caches.ecogas[cEcogas];
          item.ecogas.deuda = Number(d.deudaTotal || d.total || 0);
          item.ecogas.estado = determinarEstadoDeuda(
            item.ecogas.deuda,
            d.vencimientos,
          );
          item.ecogas.detalle = d.cantidad ? `${d.cantidad} comprobantes` : "";
          item.ecogas.vencimientos = d.vencimientos || [];
        }
      }

      listaInquilinos.push(item);
    });

    let sumaGlobalDeuda = 0;
    let conDeudaCount = 0;
    let alDiaCount = 0;
    const deudasSumadas = {
      aysam: new Set(),
      guaymallen: new Set(),
      edemsa: new Set(),
      ecogas: new Set(),
    };

    // Segunda pasada: Marcar compartidos y sumar KPIs
    listaInquilinos.forEach((item) => {
      item.aysam.compartido =
        item.aysam.cuenta && usoCuentas.aysam.get(item.aysam.cuenta)?.size > 1;
      item.guaymallen.compartido =
        item.guaymallen.padron &&
        usoCuentas.guaymallen.get(item.guaymallen.padron)?.size > 1;
      item.edemsa.compartido =
        item.edemsa.nic && usoCuentas.edemsa.get(item.edemsa.nic)?.size > 1;
      item.ecogas.compartido =
        item.ecogas.cuenta &&
        usoCuentas.ecogas.get(item.ecogas.cuenta)?.size > 1;

      item.deudaTotal =
        item.aysam.deuda +
        item.guaymallen.deuda +
        item.edemsa.deuda +
        item.ecogas.deuda;

      if (item.aysam.cuenta && !deudasSumadas.aysam.has(item.aysam.cuenta)) {
        sumaGlobalDeuda += item.aysam.deuda;
        deudasSumadas.aysam.add(item.aysam.cuenta);
      }
      if (
        item.guaymallen.padron &&
        !deudasSumadas.guaymallen.has(item.guaymallen.padron)
      ) {
        sumaGlobalDeuda += item.guaymallen.deuda;
        deudasSumadas.guaymallen.add(item.guaymallen.padron);
      }
      if (item.edemsa.nic && !deudasSumadas.edemsa.has(item.edemsa.nic)) {
        sumaGlobalDeuda += item.edemsa.deuda;
        deudasSumadas.edemsa.add(item.edemsa.nic);
      }
      if (item.ecogas.cuenta && !deudasSumadas.ecogas.has(item.ecogas.cuenta)) {
        sumaGlobalDeuda += item.ecogas.deuda;
        deudasSumadas.ecogas.add(item.ecogas.cuenta);
      }

      if (item.deudaTotal > 0) conDeudaCount++;
      else alDiaCount++;
    });

    listaInquilinos.sort((a, b) => b.deudaTotal - a.deudaTotal);

    res.json({
      exito: true,
      inquilinos: listaInquilinos,
      actualizaciones: ultimasActualizaciones, // <-- NUEVO
      kpis: {
        totalDeuda: sumaGlobalDeuda,
        conDeuda: conDeudaCount,
        alDia: alDiaCount,
        totalInquilinos: listaInquilinos.length,
      },
    });
  } catch (error) {
    console.error("Error generando resumen desde caché:", error);
    res.status(500).json({ exito: false, mensaje: error.message });
  }
});
// Ruta para descargar cualquier archivo Excel generado
app.get("/api/descargar/:archivo", (req, res) => {
  const nombreArchivo = req.params.archivo;
  const ruta = path.join(__dirname, "resultados", nombreArchivo);
  if (fs.existsSync(ruta)) {
    res.download(ruta);
  } else {
    res.status(404).send("Archivo no encontrado.");
  }
});
const PUERTO = process.env.PORT || 3000;
// ============================================================================
// API: DESCARGAR REPORTE EXCEL CONSOLIDADO
// ============================================================================
app.get("/api/descargar-excel", async (req, res) => {
  try {
    // Hacemos una petición interna a nuestra propia API para reutilizar la lógica
    const respuesta = await fetch("http://127.0.0.1:3000/api/resumen-general");
    const data = await respuesta.json();

    if (!data.exito) throw new Error("Error al obtener datos internos");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Resumen de Deudas");

    // Definir las columnas
    sheet.columns = [
      { header: "INQUILINO", key: "inq", width: 35 },
      { header: "PROPIETARIO", key: "prop", width: 35 },
      { header: "DEUDA AYSAM", key: "aysam", width: 18 },
      { header: "DEUDA GUAYMALLÉN", key: "guaymallen", width: 22 },
      { header: "DEUDA EDEMSA", key: "edemsa", width: 18 },
      { header: "DEUDA ECOGAS", key: "ecogas", width: 18 },
      { header: "DEUDA TOTAL", key: "total", width: 20 },
    ];

    // Diseño de la cabecera (Azul oscuro con letras blancas)
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3C72" },
    };

    // Formato de moneda para las columnas numéricas
    const formatoMoneda = '"$"#,##0.00;[Red]\-"$"#,##0.00';
    ["C", "D", "E", "F", "G"].forEach((col) => {
      sheet.getColumn(col).numFmt = formatoMoneda;
    });

    // Llenar los datos
    data.inquilinos.forEach((item) => {
      sheet.addRow({
        inq: item.inquilino,
        prop: item.propietario,
        aysam: item.aysam.deuda,
        guaymallen: item.guaymallen.deuda,
        edemsa: item.edemsa.deuda,
        ecogas: item.ecogas.deuda,
        total: item.deudaTotal,
      });
    });

    // Enviar el archivo al navegador
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Reporte_Deudas_Consolidado.xlsx"',
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generando Excel:", error);
    res.status(500).send("Error generando el archivo Excel.");
  }
});

app.get("/api/estado-servidor", (req, res) => {
  const memoria = process.memoryUsage();
  res.json({
    heapUsado: (memoria.heapUsed / 1024 / 1024).toFixed(2) + " MB",
    ramTotalAsignada: (memoria.rss / 1024 / 1024).toFixed(2) + " MB",
    tiempoActivo: Math.round(process.uptime()) + " segundos",
  });
});

app.post("/api/contratos/descargar", async (req, res) => {
  try {
    const { html } = req.body;

    // Convertimos el HTML de la vista previa a un buffer de documento Word
    const fileBuffer = await htmlToDocx(html, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", "attachment; filename=Contrato.docx");
    res.send(fileBuffer);
  } catch (error) {
    console.error("Error al generar el contrato:", error);
    res.status(500).send("Error generando el documento");
  }
});
app.listen(PUERTO, "0.0.0.0", () => {
  console.log(
    `🚀 Servidor unificado corriendo en red local en el puerto ${PUERTO}`,
  );
});
