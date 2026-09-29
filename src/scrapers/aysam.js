import { leerExcel, guardarExcel } from '../core/excel.js';
import { cargarCache, guardarEnCache } from '../core/cache.js';
import axios from 'axios';
import path from 'path';

const URL_AYSAM = "https://oficinavirtual.aysam.com.ar/recursos/includeActions/inc_getDetailCuenta.php";

async function consultarCuenta(numeroCuenta, recaptchaResponse = "") {
    try {
        const partes = String(numeroCuenta).trim().split("-");

        if (partes.length !== 4) {
            throw new Error(`Formato de cuenta inválido: ${numeroCuenta}`);
        }

        const [inputNcSec1, inputNcSec2, inputNcSec3, inputNcSec4] = partes;
        const params = new URLSearchParams();

        params.append("inputNcSec1", inputNcSec1);
        params.append("inputNcSec2", inputNcSec2);
        params.append("inputNcSec3", inputNcSec3);
        params.append("inputNcSec4", inputNcSec4);
        params.append("isbb", "");
        params.append("o", "1");
        params.append("actions", "get-cta-home");
        params.append("recaptcha_response", recaptchaResponse);

        const response = await axios.post(URL_AYSAM, params.toString(), {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                Origin: "https://oficinavirtual.aysam.com.ar",
                Referer: "https://oficinavirtual.aysam.com.ar/section/home-public/detail-cuenta/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            timeout: 20000,
        });

        return response.data;
    } catch (error) {
        return {
            code: -1,
            error_message: error.message,
            data: null,
        };
    }
}

function procesarCuenta(respuesta) {
    if (!respuesta || respuesta.code !== 0 || !respuesta.data) {
        return {
            estado: "ERROR",
            mensaje: respuesta?.error_message || "No se pudo obtener la información.",
        };
    }

    const data = respuesta.data;
    const cuenta = data.deuda || {};
    const datos = data.datosCuenta || {};

    const facturas = (cuenta.facturas || []).map((factura) => ({
        periodo: factura.periodo,
        cuota: factura.numberCuota,
        numeroFactura: factura.numero,
        importeHistorico: Number(factura.importeHistorico || 0),
        recargo: Number(factura.recargo || 0),
        importe: Number(factura.importe || 0),
        vencimiento: factura.fechaVencimiento || "",
        vencida: Number(factura.vencida || 0) === 1,
        estado: factura.estado || "",
        descripcion: factura.descripcion || "",
    }));

    const deudaTotal = facturas.reduce((total, factura) => total + factura.importe, 0);
    const deudaVencida = facturas.filter((factura) => factura.vencida).reduce((total, factura) => total + factura.importe, 0);
    const deudaNoVencida = facturas.filter((factura) => !factura.vencida).reduce((total, factura) => total + factura.importe, 0);

    return {
        estado: facturas.length > 0 ? "CON DEUDA" : "SIN DEUDA",
        cuenta: data.numCuenta || "",
        titular: datos.titular || "",
        domicilio: datos.dirServicio || "",
        facturas,
        cantidadFacturas: facturas.length,
        deudaTotal,
        deudaVencida,
        deudaNoVencida,
        proximaFactura: datos.montoProxFactura || "",
        proximoVencimiento: datos.fVencProxFactura || "",
        tienePlanPago: datos.tienePlanPago || false,
    };
}

export async function procesarAysam(rutaArchivoEntrada) {
    console.log('[*] Iniciando procesamiento de AYSAM...');
    
    const clientes = await leerExcel(rutaArchivoEntrada);
    const resultados = [];
    const cache = cargarCache('aysam');
let indice = 0;
    for (const cliente of clientes) {
        const cuenta = cliente.AYSAM || cliente.aysam; 
        indice++;
        if (global.progresoScraping) {
            global.progresoScraping.actual = indice;
            global.progresoScraping.total = clientes.length;
            global.progresoScraping.porcentaje = Math.round((indice / clientes.length) * 100);
        }
        if (!cuenta) {
            continue;
        }

        const cuentaStr = String(cuenta).trim();

        if (!cuentaStr.includes('-') || cuentaStr.split('-').length !== 4) {
            resultados.push({
                ...cliente,
                ESTADO_AYSAM: 'FORMATO INVÁLIDO',
                DEUDA_TOTAL: 0
            });
            continue;
        }

        // Revisar caché
        if (cache[cuentaStr]) {
            console.log(`⏩ Cuenta AYSAM ${cuentaStr} obtenida desde la caché.`);
            const c = cache[cuentaStr];
            resultados.push({
                ...cliente,
                ESTADO_AYSAM: c.estado,
                TITULAR_AYSAM: c.titular,
                DOMICILIO_AYSAM: c.domicilio,
                DEUDA_TOTAL: c.deudaTotal || 0,
                DEUDA_VENCIDA: c.deudaVencida || 0,
                FACTURAS_PENDIENTES: c.cantidadFacturas || 0,
                PLAN_DE_PAGO: c.tienePlanPago ? 'SÍ' : 'NO',
                ORIGEN: 'CACHE'
            });
            continue;
        }

        console.log(`[*] Consultando cuenta AYSAM: ${cuentaStr}`);
        
        try {
            const respuestaCruda = await consultarCuenta(cuentaStr);
            const datosProcesados = procesarCuenta(respuestaCruda);

            if (datosProcesados.estado === 'ERROR') {
                console.log(`[X] Error en respuesta para ${cuentaStr}: ${datosProcesados.mensaje}`);
                resultados.push({
                    ...cliente,
                    ESTADO_AYSAM: 'ERROR API',
                    MENSAJE: datosProcesados.mensaje,
                    DEUDA_TOTAL: 0
                });
            } else {
                // Guardar en caché si respondió con éxito
                cache[cuentaStr] = {
                    estado: datosProcesados.estado,
                    titular: datosProcesados.titular,
                    domicilio: datosProcesados.domicilio,
                    deudaTotal: datosProcesados.deudaTotal || 0,
                    deudaVencida: datosProcesados.deudaVencida || 0,
                    cantidadFacturas: datosProcesados.cantidadFacturas || 0,
                    tienePlanPago: datosProcesados.tienePlanPago || false,
vencimientos: datosProcesados.facturas.map(f => ({ fecha: f.vencimiento, monto: f.importe })),
                    fecha: new Date().toISOString()
                };
                guardarEnCache('aysam', cache);

                resultados.push({
                    ...cliente,
                    ESTADO_AYSAM: datosProcesados.estado,
                    TITULAR_AYSAM: datosProcesados.titular,
                    DOMICILIO_AYSAM: datosProcesados.domicilio,
                    DEUDA_TOTAL: datosProcesados.deudaTotal || 0,
                    DEUDA_VENCIDA: datosProcesados.deudaVencida || 0,
                    FACTURAS_PENDIENTES: datosProcesados.cantidadFacturas || 0,
                    PLAN_DE_PAGO: datosProcesados.tienePlanPago ? 'SÍ' : 'NO',
                    ORIGEN: 'EN VIVO'
                });
            }

            await new Promise(r => setTimeout(r, 200));

        } catch (error) {
            console.error(`[X] Error consultando cuenta ${cuentaStr}: ${error.message}`);
            resultados.push({
                ...cliente,
                ESTADO_AYSAM: 'ERROR CONEXIÓN',
                DEUDA_TOTAL: 0
            });
        }
    }

    const rutaSalida = path.join(process.cwd(), 'resultados', 'Deudas_AYSAM_Actualizado.xlsx');
    await guardarExcel(resultados, rutaSalida);
    
    console.log('[+] Procesamiento de AYSAM finalizado.');
    return rutaSalida;
}