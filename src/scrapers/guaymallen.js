import { leerExcel, guardarExcel } from '../core/excel.js';
import { cargarCache, guardarEnCache } from '../core/cache.js';
import axios from 'axios';
import path from 'path';

const URL_GUAYMALLEN = "https://ventanillaunica.guaymallen.gob.ar/api/pagos/payment-intent";

async function consultarPadron(codigo) {
    try {
        const response = await axios.get(URL_GUAYMALLEN, {
            params: {
                action: "buscar",
                tipo: "Inm",
                codigo: codigo,
            },
            headers: {
                Accept: "*/*",
                Referer: "https://ventanillaunica.guaymallen.gob.ar/pagos",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            timeout: 15000,
        });

        return response.data;
    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
}

function procesarResultado(resultado, padron) {
    if (!resultado || !resultado.success) {
        return {
            padron,
            estado: "ERROR",
            titular: null,
            cuil: null,
            nomenclatura: null,
            cuotas: [],
            cantidadCuotas: 0,
            total: 0,
            mensaje: resultado?.error || "Error desconocido",
        };
    }

    if (!resultado.data || resultado.data.length === 0) {
        return {
            padron,
            estado: "SIN DEUDA",
            titular: null,
            cuil: null,
            nomenclatura: null,
            cuotas: [],
            cantidadCuotas: 0,
            total: 0,
            mensaje: "No se encontraron deudas para el código ingresado.",
        };
    }

    const servicio = resultado.data[0];
    const cuotas = servicio.installments || [];

    const cuotasProcesadas = cuotas.map((cuota) => ({
        anio: cuota.year,
        numero: cuota.number,
        referencia: cuota.reference,
        capital: Number(cuota.capital || 0),
        interes: Number(cuota.interest || 0),
        total: Number(cuota.capital || 0) + Number(cuota.interest || 0),
        vencimiento: cuota.dueDate,
        descripcion: cuota.description,
    }));

    const total = cuotasProcesadas.reduce(
        (acumulado, cuota) => acumulado + cuota.total,
        0
    );

    return {
        padron,
        estado: cuotas.length > 0 ? "CON DEUDA" : "SIN DEUDA",
        titular: servicio.holderName || null,
        cuil: servicio.holderCuil || null,
        nomenclatura: servicio.observation || null,
        cuotas: cuotasProcesadas,
        cantidadCuotas: cuotasProcesadas.length,
        total,
    };
}

export async function procesarGuaymallen(rutaArchivoEntrada) {
    console.log('[*] Iniciando procesamiento de Municipalidad de Guaymallén...');

    const clientes = await leerExcel(rutaArchivoEntrada);
    const resultados = [];
    const cache = cargarCache('guaymallen');

    for (const cliente of clientes) {
        const padron = cliente.MUNICIPALIDAD || cliente.Municipalidad || cliente.PADRON || cliente.Padron || cliente.padron;

        if (!padron) {
            continue;
        }

        const padronStr = String(padron).trim();

        // Revisar caché
        if (cache[padronStr]) {
            console.log(`⏩ Padrón Guaymallén ${padronStr} obtenido desde la caché.`);
            const c = cache[padronStr];
            resultados.push({
                ...cliente,
                ESTADO_MUNI: c.estado,
                TITULAR_MUNI: c.titular || 'N/D',
                CUIL_MUNI: c.cuil || 'N/D',
                NOMENCLATURA: c.nomenclatura || 'N/D',
                DEUDA_TOTAL_MUNI: c.total,
                CANTIDAD_CUOTAS: c.cantidadCuotas,
                MENSAJE: c.mensaje || '',
                ORIGEN: 'CACHE'
            });
            continue;
        }

        console.log(`[*] Consultando Padrón Guaymallén: ${padronStr}`);

       try {
            const raw = await consultarPadron(padronStr);
            const res = procesarResultado(raw, padronStr);

            if (res.estado !== 'ERROR') {
                cache[padronStr] = {
                    estado: res.estado,
                    titular: res.titular,
                    cuil: res.cuil,
                    nomenclatura: res.nomenclatura,
                    total: res.total,
                    cantidadCuotas: res.cantidadCuotas,
vencimientos: res.cuotas.map(c => ({ fecha: c.vencimiento, monto: c.total })),                    mensaje: res.mensaje,
                    fecha: new Date().toISOString()
                };
                guardarEnCache('guaymallen', cache);
            }

            resultados.push({
                ...cliente,
                ESTADO_MUNI: res.estado,
                TITULAR_MUNI: res.titular || 'N/D',
                CUIL_MUNI: res.cuil || 'N/D',
                NOMENCLATURA: res.nomenclatura || 'N/D',
                DEUDA_TOTAL_MUNI: res.total,
                CANTIDAD_CUOTAS: res.cantidadCuotas,
                MENSAJE: res.mensaje || '',
                ORIGEN: 'EN VIVO'
            });

            await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (err) {
            console.error(`[X] Error con padrón ${padronStr}: ${err.message}`);
            resultados.push({
                ...cliente,
                ESTADO_MUNI: 'ERROR CONEXIÓN',
                TITULAR_MUNI: 'N/D',
                DEUDA_TOTAL_MUNI: 0,
                CANTIDAD_CUOTAS: 0,
                MENSAJE: err.message
            });
        }
    }

    const rutaSalida = path.join(process.cwd(), 'resultados', 'Deudas_Guaymallen_Actualizado.xlsx');
    await guardarExcel(resultados, rutaSalida);

    console.log('[+] Procesamiento de Guaymallén finalizado.');
    return rutaSalida;
}