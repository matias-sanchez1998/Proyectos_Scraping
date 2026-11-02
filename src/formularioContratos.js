import express from "express";
import { load } from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { importeALetras } from "./numeroALetras.js";

const router = express.Router();
router.use(express.json({ limit: "3mb" }));
const carpeta = path.dirname(fileURLToPath(import.meta.url));
const catalogo = JSON.parse(
  await fs.readFile(path.join(carpeta, "modelosContratos.json"), "utf8"),
);
const modelos = catalogo.modelos;
const fallo = (mensaje) => Object.assign(new Error(mensaje), { status: 400 });
function elegir(id = "mutti") {
  const m = modelos.find((m) => m.id === id);
  if (!m) throw fallo("Elegí una base de cláusulas disponible.");
  return m;
}
function bloques($) {
  const q = "p,li,td,th,h1,h2,h3,h4";
  return $(q)
    .filter((_i, el) => $(el).find(q).length === 0)
    .toArray()
    .filter((el) => $(el).text().trim());
}
function modelo(m) {
  const $ = load(m.html, null, false);
  if (
    createHash("sha256")
      .update(JSON.stringify(bloques($).map((el) => $(el).text())))
      .digest("hex") !== m.hash
  )
    throw fallo("La plantilla fue modificada fuera del catálogo revisado.");
  return $;
}
function opciones(grupo) {
  return catalogo[grupo].map((v) => ({ valor: v.id, etiqueta: v.etiqueta }));
}
function campos(m) {
  return m.campos.map((c) => ({
    ...c,
    opciones: c.catalogo ? opciones(c.catalogo) : c.opciones,
    valorInicial:
      c.id === "garantia"
        ? m.garantiaDefault
        : c.id === "ajuste"
          ? m.ajusteDefault
          : c.valorInicial,
  }));
}
function importe(s) {
  try {
    return importeALetras(s);
  } catch (e) {
    throw fallo(e.message);
  }
}
function visible(c, d) {
  return (
    !c.visibleSi ||
    Object.entries(c.visibleSi).every(([key, value]) => d[key] === value)
  );
}
function sustituir($, el, zonas, valores) {
  const nodos = [];
  function recorrer(n) {
    if (n.type === "text") nodos.push(n);
    else for (const h of n.children || []) recorrer(h);
  }
  recorrer(el);
  const original = nodos.map((n) => n.data).join("");
  const reglas = zonas
    .map((z) => ({ inicio: z.inicio, fin: z.fin, valor: valores[z.id] }))
    .sort((a, b) => a.inicio - b.inicio);
  for (const z of zonas) {
    if (
      original.slice(z.inicio, z.fin) !== z.original ||
      typeof valores[z.id] !== "string"
    )
      throw fallo(
        "No se pudo aplicar el campo " + z.id + " sin alterar el texto fijo.",
      );
  }
  for (let i = 1; i < reglas.length; i++)
    if (reglas[i].inicio < reglas[i - 1].fin)
      throw fallo("Hay campos superpuestos en el catálogo.");
  let offset = 0;
  for (const nodo of nodos) {
    const inicio = offset,
      fin = offset + nodo.data.length;
    let salida = "",
      cursor = inicio;
    for (const r of reglas.filter((r) => r.fin > inicio && r.inicio < fin)) {
      salida += original.slice(cursor, Math.max(cursor, r.inicio));
      if (r.inicio >= inicio) salida += r.valor;
      cursor = Math.min(fin, r.fin);
    }
    nodo.data = salida + original.slice(cursor, fin);
    offset = fin;
  }
}
function variante(grupo, id, v) {
  const item = catalogo[grupo].find((x) => x.id === id);
  if (!item) throw fallo("Elegí una variante válida de " + grupo + ".");
  const $ = load(item.html, null, false);
  const b = bloques($);
  if (b.length !== 1) throw fallo("Variante de cláusula no válida.");
  sustituir($, b[0], item.zonas, v);
  return $.html();
}
function letras(n) {
  const u = [
    "cero",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
    "diez",
    "once",
    "doce",
    "trece",
    "catorce",
    "quince",
    "dieciséis",
    "diecisiete",
    "dieciocho",
    "diecinueve",
    "veinte",
    "veintiuno",
    "veintidós",
    "veintitrés",
    "veinticuatro",
    "veinticinco",
    "veintiséis",
    "veintisiete",
    "veintiocho",
    "veintinueve",
  ];
  if (n < 30) return u[n];
  if (n < 100)
    return (
      [
        "",
        "",
        "",
        "treinta",
        "cuarenta",
        "cincuenta",
        "sesenta",
        "setenta",
        "ochenta",
        "noventa",
      ][Math.floor(n / 10)] + (n % 10 ? " y " + u[n % 10] : "")
    );
  if (n === 100) return "cien";
  if (n < 1000)
    return (
      [
        "",
        "ciento",
        "doscientos",
        "trescientos",
        "cuatrocientos",
        "quinientos",
        "seiscientos",
        "setecientos",
        "ochocientos",
        "novecientos",
      ][Math.floor(n / 100)] + (n % 100 ? " " + letras(n % 100) : "")
    );
  return (
    (n < 2000 ? "mil" : letras(Math.floor(n / 1000)) + " mil") +
    (n % 1000 ? " " + letras(n % 1000) : "")
  );
}
function fecha(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor))
    throw fallo("Completá las fechas con el selector de calendario.");
  const d = new Date(valor + "T12:00:00Z");
  if (
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== valor ||
    d.getUTCFullYear() < 1900 ||
    d.getUTCFullYear() > 9999
  )
    throw fallo("Fecha no válida.");
  return {
    dia: d.getUTCDate(),
    mes: d.toLocaleString("es-AR", { month: "long", timeZone: "UTC" }),
    ano: d.getUTCFullYear(),
  };
}
function fechaLarga(valor) {
  const f = fecha(valor);
  return `${f.dia === 1 ? "primero" : letras(f.dia)} (${String(f.dia).padStart(2, "0")}) de ${f.mes} del año ${letras(f.ano)} (${f.ano})`;
}
function personas(lista, grupo) {
  if (!Array.isArray(lista) || !lista.length)
    throw fallo(`Agregá al menos un integrante en ${grupo}.`);
  return lista.map((p, i) => {
    if (!p || typeof p !== "object" || Array.isArray(p))
      throw fallo(`Datos no válidos en ${grupo}.`);
    const v = {};
    for (const key of [
      "nombre",
      "dni",
      "domicilio",
      "trato",
      "cuil",
      "cp",
      "email",
      "telefono",
    ]) {
      if (
        p[key] !== undefined &&
        (typeof p[key] !== "string" || p[key].length > 2000)
      )
        throw fallo(`Dato no válido en ${grupo} ${i + 1}.`);
      v[key] = (p[key] || "").trim();
    }
    for (const key of ["nombre", "dni", "domicilio", "trato"])
      if (!v[key]) throw fallo(`Completá ${key} en ${grupo} ${i + 1}.`);
    if (!/^(Sr\.?|Sra\.?)$/i.test(v.trato))
      throw fallo("El tratamiento debe ser Sr. o Sra.");
    v.ocupante = p.ocupante === true;
    return v;
  });
}
function identidad(p, propietario = false, m) {
  return `${p.trato} ${p.nombre}, DNI Nº ${p.dni}${p.cuil ? ", CUIT/CUIL " + p.cuil : ""}, ${propietario && m.id === "grilli" ? "constituyendo domicilio real y especial válido para cualquier notificación en" : "con domicilio real y especial en"} ${p.domicilio}${p.cp ? " (C.P.:" + p.cp + ")" : ""}`;
}
function textoServicios(lista, m) {
  if (!Array.isArray(lista)) throw fallo("Los servicios deben ser una lista.");
  const items = lista.map((s, i) => {
    if (!s || typeof s !== "object" || Array.isArray(s))
      throw fallo(`Servicio ${i + 1} no válido.`);
    const v = {};
    for (const key of ["nombre", "empresa", "cuenta", "parte", "vencimiento"]) {
      if (
        s[key] !== undefined &&
        (typeof s[key] !== "string" || s[key].length > 2000)
      )
        throw fallo(`Dato no válido en servicio ${i + 1}.`);
      v[key] = (s[key] || "").trim();
    }
    if (!v.nombre || !v.parte)
      throw fallo(
        `Completá el servicio ${i + 1} y la parte que corresponde pagar.`,
      );
    if (v.vencimiento) fecha(v.vencimiento);
    return `${v.nombre}${v.empresa ? " (" + v.empresa + (v.cuenta ? ", cuenta / padrón / NIC: " + v.cuenta : "") + ")" : v.cuenta ? " (cuenta / padrón / NIC: " + v.cuenta + ")" : ""}; parte a cargo de la LOCATARIA: ${v.parte}${v.vencimiento ? "; vencimiento: " + fechaLarga(v.vencimiento) : ""}`;
  });
  // Se conservan íntegros los dos ítems generales del Word, además de los servicios elegidos.
  items.push(
    m.id === "mutti"
      ? "Cualquier otro servicio que sea suministrado, eventualmente, en el inmueble alquilado (Ejemplo: teléfono,   cable video, etc.)"
      : "Cualquier otro servicio que sea suministrado, eventualmente, en el inmueble alquilado (Ejemplo: teléfono,   cable video, etc.)",
  );
  items.push(
    "Las multas que impongan organismos estatales  (municipales, provinciales y nacionales) y privados por imprudencia o negligencia de la locataria en el uso del inmueble arrendado.",
  );
  function indice(n) {
    let t = "";
    for (n++; n; n = Math.floor((n - 1) / 26))
      t = String.fromCharCode(65 + ((n - 1) % 26)) + t;
    return t;
  }
  return items.map((t, i) => `${indice(i)}) ${t}`).join("; ");
}
function valores(req, m) {
  const d = req.datos;
  if (!d || typeof d !== "object" || Array.isArray(d))
    throw fallo("Datos del formulario no válidos.");
  const v = {};
  for (const c of campos(m)) {
    if (!visible(c, d)) continue;
    const dato = d[c.id];

    if (
      c.id === "padronAtm" &&
      (dato === undefined || (typeof dato === "string" && !dato.trim()))
    ) {
      v[c.id] = "";
      continue;
    }
    if (typeof dato !== "string" || !dato.trim() || dato.length > 10000)
      throw fallo(`Completá: ${c.grupo} / ${c.etiqueta}.`);
    v[c.id] = dato.trim();
    if (c.tipo === "date") fecha(v[c.id]);
    if (
      c.opciones &&
      !c.opciones.some((o) => (typeof o === "string" ? o : o.valor) === v[c.id])
    )
      throw fallo("Elegí una opción válida: " + c.etiqueta);
    if (c.importe) {
      const i = importe(v[c.id]);
      if (BigInt(i.centavos) <= 0n && c.id !== "depositoAnterior")
        throw fallo("El importe debe ser mayor que cero.");
    }
  }
  if (!/^\d+$/.test(v.meses) || Number(v.meses) < 1 || Number(v.meses) > 120)
    throw fallo("La duración debe ser un entero entre 1 y 120 meses.");
  if (v.fin <= v.inicio)
    throw fallo("La fecha final debe ser posterior al inicio.");
  const partes = {
    locadores: personas(req.partes?.locadores, "locadores"),
    locatarios: personas(req.partes?.locatarios, "locatarios"),
    garantes: personas(req.partes?.garantes, "garantes"),
  };
  const extras = req.otrosOcupantes || [];
  if (!Array.isArray(extras)) throw fallo("Ocupantes no válidos.");
  const adicionales = extras.map((p, i) => {
    if (
      !p ||
      typeof p.nombre !== "string" ||
      !p.nombre.trim() ||
      p.nombre.length > 2000 ||
      (p.dni !== undefined &&
        (typeof p.dni !== "string" || p.dni.length > 2000))
    )
      throw fallo(`Completá el otro ocupante ${i + 1}.`);
    return { nombre: p.nombre.trim(), dni: (p.dni || "").trim(), trato: "" };
  });
  const ocupantes = [
    ...partes.locatarios.filter((p) => p.ocupante),
    ...adicionales,
  ];
  if (m.uso === "Vivienda" && !ocupantes.length)
    throw fallo("Determiná quiénes ocuparán la vivienda.");
  if (v.destino === "VIVIENDA UNIPERSONAL" && ocupantes.length !== 1)
    throw fallo(
      "Para destino unipersonal indicá un ocupante, o elegí otro destino.",
    );
  v.nombresOcupantes = ocupantes
    .map(
      (p) =>
        `${p.trato ? p.trato + " " : ""}${p.nombre}${p.dni ? ", DNI Nº " + p.dni : ""}`,
    )
    .join("; y ");
  v.destinoCompleto =
    " " +
    (m.uso === "Comercio"
      ? `COMERCIO (${v.rubro})`
      : v.destino + " de " + v.nombresOcupantes);
  v.listaLocadores = partes.locadores
    .map((p) => identidad(p, true, m))
    .join("; y ");
  v.listaLocatarios = partes.locatarios
    .map((p) => identidad(p, false, m))
    .join("; y ");
  v.listaGarantes =
    " " +
    partes.garantes
      .map((p, i) => `${i + 1}) ${identidad(p, false, m)}`)
      .join("; ") +
    "; ";
  v.nombresLocatarios = partes.locatarios
    .map((p) => `${p.trato} ${p.nombre}`)
    .join(" y ");
  v.nombresMandato = v.nombresLocatarios + " ";
  const meses = Number(v.meses);
  v.duracion = `${letras(meses).toUpperCase()} (${meses}) ${meses === 1 ? "MES" : "MESES"}`;
  v.inicioLargo = fechaLarga(v.inicio);
  v.finLargo = fechaLarga(v.fin);
  if (v.seguro) v.seguroLargo = fechaLarga(v.seguro);
  v.canonPalabras = "PESOS " + importe(v.canonNumero).letras;
  v.canonCifras = "($" + importe(v.canonNumero).numero + ")";
  v.canonCompleto = importe(v.canonNumero).completo;
  v.depositoCompleto = importe(v.depositoNumero).completo;
  if (v.garantia === "actualizacion_total") {
    const total = BigInt(importe(v.depositoNumero).centavos),
      previo = BigInt(importe(v.depositoAnterior).centavos);
    if (previo >= total)
      throw fallo(
        "El total final debe superar el depósito anterior para esta integración.",
      );
    const dif = total - previo;
    v.aporteCompleto = importe(
      `${dif / 100n}.${String(dif % 100n).padStart(2, "0")}`,
    ).completo;
  }
  v.listaServicios = textoServicios(req.servicios || [], m);
  v.serviciosSuministrados =
    " " + (req.servicios || []).map((s) => s.nombre.trim()).join(", ");
  if (!v.serviciosSuministrados.trim())
    v.serviciosSuministrados =
      " los que se detallan en la cláusula de servicios";
  if (v.fechaOriginal) {
    const f = fecha(v.fechaOriginal);
    v.fechaOriginalLargo = `${f.dia} de ${f.mes} de ${f.ano}`;
    v.fechaOriginalCorta = `${String(f.dia).padStart(2, "0")}/${String(new Date(v.fechaOriginal + "T12:00:00Z").getUTCMonth() + 1).padStart(2, "0")}/${f.ano}`;
    v.fechaOriginalAno = "el año " + f.ano;
  }
  if (v.fechaCertificacion) {
    const f = fecha(v.fechaCertificacion);
    v.fechaCertificacionLargo = `${f.dia} de ${f.mes} de ${f.ano}`;
  }
  const f = fecha(v.firma);
  v.firmaLugar = "en Guaymallén, Mendoza";
  v.firmaDia = `${letras(f.dia)} (${f.dia})`;
  v.firmaMes = f.mes + " ";
  v.firmaAno = `${letras(f.ano)} (${f.ano})`;
  return { v, partes };
}
function contactos($, m, partes, originales) {
  const origen = originales[m.contactos[0]];
  for (const [grupo, lista] of Object.entries(partes))
    for (const p of lista) {
      const rol =
        grupo === "locadores"
          ? "LOCADORA"
          : grupo === "garantes"
            ? "CODEUDOR"
            : "LOCATARIA " + (p.ocupante ? "ocupante" : "no ocupante");
      const el = $("<p></p>");
      el.text(
        `${rol} ${p.trato} ${p.nombre}: ${p.email ? "correo: " + p.email : "sin correo electrónico declarado"}; ${p.telefono ? "teléf.: " + p.telefono : "sin teléfono declarado"}`,
      );
      $(origen).before(el);
    }
  for (const p of m.contactos) $(originales[p]).remove();
}
function generar(m, req) {
  const $ = modelo(m),
    originales = bloques($),
    { v, partes } = valores(req, m);
  const porBloque = new Map();
  for (const z of m.zonas) {
    if (!porBloque.has(z.p)) porBloque.set(z.p, []);
    porBloque.get(z.p).push(z);
  }
  for (const [p, zs] of porBloque) {
    if (
      Object.entries(m.opcionales || {}).some(
        ([key, ps]) => v[key] === "No incluir" && ps.includes(p),
      )
    )
      continue;
    if (
      m.seguroBloque &&
      p === 99 &&
      v.seguroTipo === "Incendio contratado por locadora"
    )
      continue;
    sustituir($, originales[p], zs, v);
  }
  // El selector reemplaza únicamente la cláusula correspondiente, con su texto completo de origen.
  if (v.ajuste !== m.ajusteDefault)
    $(originales[m.precio]).replaceWith(variante("ajustes", v.ajuste, v));
  const primerDep = originales[m.depositoInicio];
  const nuevo = $("<div></div>");
  nuevo.append(
    $("<p></p>").append(
      $("<strong></strong>").text(
        v.garantia === "pagare" ? "PAGARÉ A LA VISTA" : "EN MONEDA",
      ),
    ),
  );
  nuevo.append(variante("garantias", v.garantia, v));
  $(primerDep).before(nuevo.contents());
  for (let i = m.depositoInicio; i < m.depositoFin; i++)
    $(originales[i]).remove();
  if (m.seguroBloque) {
    const quitar =
      v.seguroTipo === "Incendio contratado por locadora"
        ? [98, 99]
        : [96, 97, 98];
    for (const p of quitar) $(originales[p]).remove();
  }
  for (const [key, ps] of Object.entries(m.opcionales || {}))
    if (v[key] === "No incluir") for (const p of ps) $(originales[p]).remove();
  contactos($, m, partes, originales);
  for (const p of m.remover) $(originales[p]).remove();
  for (const [i, prefijo] of m.numeracion) {
    const el = originales[i];
    if (!el.parent) continue;
    if (el.name !== "li" || $(el).parent()[0]?.name !== "ol")
      throw fallo("Numeración de cláusulas no válida.");
    const p = $("<p></p>");
    p.append($("<strong></strong>").text(prefijo));
    p.append($(el).contents());
    $(el).parent().replaceWith(p);
  }
  // Las menciones de frecuencia en el título son datos de la variante elegida.
  const ajuste = catalogo.ajustes.find((a) => a.id === v.ajuste);
  const frecuencia = v.ajuste.includes("mensual")
    ? "MENSUAL"
    : v.ajuste.includes("cuatrimestral")
      ? "CUATRIMESTRAL"
      : "TRIMESTRAL";
  for (const el of bloques($)) {
    const t = $(el).text();
    if (
      t.length < 260 &&
      (t.includes("PRECIO") || t.startsWith("AJUSTE")) &&
      /AJUSTE|ALQUILER/.test(t)
    ) {
      function renombrar(n) {
        if (n.type === "text")
          n.data = n.data.replace(
            /CUATRIMESTRAL|TRIMESTRAL|MENSUAL/g,
            frecuencia,
          );
        else for (const h of n.children || []) renombrar(h);
      }
      renombrar(el);
    }
  }
  return $.html();
}
router.get("/modelos", (_req, res) =>
  res.json(
    modelos.map(({ id, nombre, operacion, uso }) => ({
      id,
      nombre,
      operacion,
      uso,
    })),
  ),
);
router.get("/modelo", (req, res, next) => {
  try {
    const m = elegir(req.query.modelo);
    modelo(m);
    res.json({
      id: m.id,
      archivo: m.archivo,
      uso: m.uso,
      operacion: m.operacion,
      campos: campos(m),
      condiciones: `${m.operacion} · ${m.uso}. Elegí ajuste y garantía. Personas, ocupantes y servicios definidos por ustedes.`,
    });
  } catch (e) {
    next(e);
  }
});
router.get("/importe", (req, res, next) => {
  try {
    res.json(importe(req.query.valor || ""));
  } catch (e) {
    next(e);
  }
});
router.post("/borrador", (req, res, next) => {
  try {
    res.type("html").send(generar(elegir(req.body.modelo), req.body));
  } catch (e) {
    next(e);
  }
});
router.use((error, _req, res, _next) => {
  console.error("Formulario de contratos:", error.message);
  res
    .status(error.status || 500)
    .json({
      error: error.status
        ? error.message
        : "No se pudo completar el contrato. Revisá la terminal.",
    });
});
export default router;
