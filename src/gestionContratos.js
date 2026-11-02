import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import sanitizeHtml from "sanitize-html";

// Una única instancia del servidor comparte estos datos con todas las PCs.
export function crearGestionContratos({ archivo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "gestion-contratos.json") } = {}) {
  const router = express.Router();
  router.use(express.json({ limit: "3mb" }));
  router.use((req,res,next)=>{
    res.set("Cache-Control","no-store");
    if(!["GET","HEAD"].includes(req.method)&&req.get("origin")){
      try{if(new URL(req.get("origin")).host!==req.get("host"))return res.status(403).json({error:"Abrí el formulario desde el mismo servidor."});}
      catch{return res.status(403).json({error:"Origen no válido."});}
    }
    next();
  });
  let cola = Promise.resolve();
  const error = (mensaje,status=400) => Object.assign(new Error(mensaje),{status});
  const objeto = v => v && typeof v === "object" && !Array.isArray(v);
  const texto = (v,max=2000) => typeof v === "string" && v.length<=max ? v : "";
  const idValido = id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
  const html = valor => sanitizeHtml(texto(valor,1500000), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags,"h1","h2","div","span","font","u","s"],
    allowedAttributes: {"*": ["style","class","data-*"],font:["color","face","size"]},
    allowedStyles: {"*": {"text-align":[/^(left|right|center|justify)$/],"font-weight":[/^(bold|normal|[1-9]00)$/],"font-style":[/^(italic|normal)$/],"text-decoration":[/^(underline|line-through|none)$/]}},
    allowedSchemes: [], allowProtocolRelative: false
  });
  async function leer() {
    try {const db=JSON.parse(await fs.readFile(archivo,"utf8"));if(!objeto(db)||!["borradores","personas","inmuebles"].every(k=>Array.isArray(db[k])))throw error("El archivo de datos requiere revisión.",500);return db;}
    catch(e){if(e.code==="ENOENT")return {version:1,borradores:[],personas:[],inmuebles:[]};throw e;}
  }
  async function escribir(db) {
    await fs.mkdir(path.dirname(archivo),{recursive:true});
    const temporal=archivo+"."+randomUUID()+".tmp";
    try {await fs.writeFile(temporal,JSON.stringify(db,null,2),{mode:0o600});await fs.rename(temporal,archivo);}
    finally {await fs.unlink(temporal).catch(()=>{});}
  }
  function ejecutar(fn) {
    const resultado=cola.then(fn);cola=resultado.catch(()=>{});return resultado;
  }
  const ruta = fn => async(req,res,next)=>{try{await ejecutar(()=>fn(req,res));}catch(e){next(e);}};
  function validarBorrador(v) {
    if(!objeto(v)||!objeto(v.datos)||!objeto(v.partes)||!texto(v.modelo,100))throw error("Borrador no válido.");
    if(typeof v.html!=="string"||v.html.length>1500000)throw error("El texto del contrato es demasiado grande o no es válido.");
    const partes={};
    for(const g of ["locadores","locatarios","garantes"]){if(!Array.isArray(v.partes[g])||v.partes[g].length>100)throw error("Lista de personas no válida.");partes[g]=v.partes[g].map(p=>{if(!objeto(p))throw error("Persona no válida.");return Object.fromEntries(Object.entries(p).filter(([k,val])=>["id","trato","nombre","dni","cuil","domicilio","cp","email","telefono","agendaId"].includes(k)&&typeof val==="string"&&val.length<=2000).concat([["ocupante",!!p.ocupante]]));});}
    function lista(v,max){if(!Array.isArray(v)||v.length>max||v.some(x=>!objeto(x)))throw error("Lista de datos no válida.");return v.map(x=>Object.fromEntries(Object.entries(x).filter(([k,val])=>!['__proto__','constructor','prototype'].includes(k)&&typeof val==="string"&&val.length<=2000)));}
    const originales={};
    if(objeto(v.originalesClausulas))for(const [id,o]of Object.entries(v.originalesClausulas)){if(!idValido(id)||["__proto__","constructor","prototype"].includes(id)||!objeto(o))continue;originales[id]={orden:Number(o.orden)||0,titulo:texto(o.titulo),html:html(o.html)};}
    return {version:4,nombre:texto(v.nombre,160)||"Contrato",modelo:v.modelo,
      datos:Object.fromEntries(Object.entries(v.datos).filter(([k,val])=>!['__proto__','constructor','prototype'].includes(k)&&typeof val==="string"&&val.length<=10000)),partes,
      servicios:lista(v.servicios||[],100),otrosOcupantes:lista(v.otrosOcupantes||[],100),
      html:html(v.html),manual:!!v.manual,pendiente:!!v.pendiente,originalesClausulas:originales,inmuebleAgendaId:texto(v.inmuebleAgendaId,100)};
  }
  function validarAgenda(tipo,v) {
    if(!objeto(v))throw error("Datos de agenda no válidos.");
    const keys=tipo==="personas"?["trato","nombre","dni","cuil","domicilio","cp","email","telefono"]:["referencia","inmuebleDomicilio","padronAtm","descripcion","pintura"];
    const dato=Object.fromEntries(keys.map(k=>[k,texto(v[k],k==="descripcion"?10000:2000).trim()]));
    if(tipo==="personas"&&!dato.nombre)throw error("Ingresá el nombre de la persona.");
    if(tipo==="inmuebles"&&!dato.inmuebleDomicilio)throw error("Ingresá el domicilio del inmueble.");
    if(tipo==="inmuebles"){
      if(v.servicios!==undefined&&(!Array.isArray(v.servicios)||v.servicios.length>100||v.servicios.some(x=>!objeto(x))))throw error("Servicios no válidos.");
      dato.servicios=(v.servicios||[]).map(s=>Object.fromEntries(["nombre","empresa","cuenta","parte"].map(k=>[k,texto(s[k])])));
    }
    return dato;
  }
  const estadosContrato = ["borrador", "revision", "finalizado"];
  function metadatosContrato(v, actual = {}) {
    const estado = v.estado ?? actual.estado ?? "borrador";
    const archivado = v.archivado ?? actual.archivado ?? false;
    if (!estadosContrato.includes(estado) || typeof archivado !== "boolean") {
      throw error("Estado o archivo del contrato no válido.");
    }
    return { estado, archivado };
  }
  router.patch("/borradores/:id", ruta(async (req, res) => {
    if (!objeto(req.body)) throw error("Datos no válidos.");
    const db = await leer();
    const indice = db.borradores.findIndex(d => d.id === req.params.id);
    if (indice < 0) throw error("No se encontró el contrato.", 404);
    const actual = db.borradores[indice];
    if (req.body.revision !== actual.revision) {
      throw error("Otra computadora modificó este contrato. Actualizá la tabla y volvé a intentar.", 409);
    }
    const actualizado = { ...actual, ...metadatosContrato(req.body, actual),
      revision: actual.revision + 1, fecha: new Date().toISOString() };
    db.borradores[indice] = actualizado;
    await escribir(db);
    res.json(actualizado);
  }));
  router.delete("/borradores", ruta(async (req, res) => {
    if (req.body?.confirmar !== true) {
      throw error("Confirmá la eliminación de todos los borradores.");
    }
    const db = await leer();
    const eliminados = db.borradores.length;
    db.borradores = [];
    await escribir(db);
    res.json({ ok: true, eliminados });
  }));
  for(const tipo of ["borradores","personas","inmuebles"]){
    router.get("/"+tipo,ruta(async(_req,res)=>{
      const db=await leer();res.json(db[tipo].map(d=>tipo==="borradores"?{id:d.id,nombre:d.nombre,modelo:d.modelo,fecha:d.fecha,revision:d.revision,estado:d.estado||"borrador",archivado:!!d.archivado,locatarios:(d.partes?.locatarios||[]).map(p=>p.nombre).filter(Boolean).join("; "),direccion:d.datos?.inmuebleDomicilio||""}:d).sort((a,b)=>b.fecha.localeCompare(a.fecha)));
    }));
    router.get("/"+tipo+"/:id",ruta(async(req,res)=>{const db=await leer(),d=db[tipo].find(x=>x.id===req.params.id);if(!d)throw error("No se encontró el registro.",404);res.json(d);}));
    router.post("/"+tipo,ruta(async(req,res)=>{
      if(!objeto(req.body))throw error("Datos no válidos.");
      const db=await leer(),id=req.body.id||randomUUID();if(!idValido(id))throw error("Identificador no válido.");
      const indice=db[tipo].findIndex(x=>x.id===id),actual=db[tipo][indice];
      if(actual&&req.body.revision!==actual.revision)throw error("Otra computadora modificó este registro. Recuperá la versión compartida o guardá tus cambios como una copia.",409);
      if(!actual&&req.body.revision)throw error("El registro fue eliminado. Guardá tus cambios como una copia.",409);
      const datos=tipo==="borradores"?validarBorrador(req.body):validarAgenda(tipo,req.body);
      const dni=datos.dni?.replace(/\D/g,"");
      if(tipo==="personas"&&dni&&db.personas.some(x=>x.id!==id&&x.dni.replace(/\D/g,"")===dni))throw error("Ya existe una persona con ese DNI. Seleccionala para actualizar sus datos.",409);
      const nuevo={...datos,...(tipo==="borradores"?metadatosContrato(req.body,actual):{}),id,revision:(actual?.revision||0)+1,fecha:new Date().toISOString()};
      if(indice<0)db[tipo].push(nuevo);else db[tipo][indice]=nuevo;
      await escribir(db);res.json(nuevo);
    }));
    router.delete("/"+tipo+"/:id",ruta(async(req,res)=>{
      if(!objeto(req.body))throw error("Indicá la versión del registro.");
      const db=await leer(),i=db[tipo].findIndex(x=>x.id===req.params.id);if(i<0)throw error("No se encontró el registro.",404);
      if(req.body.revision!==db[tipo][i].revision)throw error("El registro cambió. Actualizá la lista antes de eliminarlo.",409);
      db[tipo].splice(i,1);await escribir(db);res.json({ok:true});
    }));
  }
  router.use((e,_req,res,_next)=>{const status=e.status||500;res.status(status).json({error:status===500?"No se pudieron guardar o recuperar los datos compartidos. Revisá el servidor.":e.message});});
  return router;
}
export default crearGestionContratos();
