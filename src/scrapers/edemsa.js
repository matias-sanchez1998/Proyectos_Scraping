import { chromium } from 'playwright';
import { leerExcel, guardarExcel } from '../core/excel.js';
import { cargarCache, guardarEnCache } from '../core/cache.js';
import { resolverCaptcha } from '../core/capsolver.js';
import * as cheerio from 'cheerio';
import path from 'path';
import { mostrarProgreso } from '../core/logger.js';
import pLimit from 'p-limit';

const URL_LOGIN = 'https://oficinavirtual.edemsa.com/login.php';

// Concurrencia controlada: 3 consultas en paralelo
const limit = pLimit(3);

// ==========================================
// PARSERS Y HELPERS
// ==========================================
function convertirImporte(texto) {
    if (!texto) return 0;
    const limpio = texto.replace(/\$/g, '').replace(/\./g, '').replace(',', '.').trim();
    const numero = Number(limpio);
    return Number.isFinite(numero) ? numero : 0;
}

function analizarEncabezadoFactura(encabezado) {
    const res = { numero: '', periodo: '', tipo: '' };
    if (!encabezado) return res;

    const normal = encabezado.match(/Factura N°\s*(.+?)\s*-\s*Periodo:\s*(\d{2}-\d{4})/i);
    if (normal) {
        res.numero = normal[1].trim();
        res.periodo = normal[2].replace('-', '/');
        res.tipo = 'FACTURA';
        return res;
    }

    const especial = encabezado.match(/Factura N°\s*([A-Z]-\d{4}-\d+)\s*-\s*(.+)$/i);
    if (especial) {
        res.numero = especial[1].trim();
        res.tipo = especial[2].trim();
        return res;
    }

    return res;
}

function extraerFacturas(htmlDeuda) {
    if (!htmlDeuda) return [];
    const $ = cheerio.load(htmlDeuda);
    const facturas = [];

    $('.border_celeste').each((_, contenedor) => {
        const $contenedor =$(contenedor);
        let facturaActual = null;

        $contenedor.children().each((_, elemento) => {
            const $el =$(elemento);

            if ($el.hasClass('card')) {
                const enc = $el.find('.card-header h6').first().text().replace(/\s+/g, ' ').trim();
                const info = analizarEncabezadoFactura(enc);
                facturaActual = info.numero ? info : null;
                return;
            }

if (!facturaActual || !$el.hasClass('row') || !$el.hasClass('pb-3') || !$el.hasClass('pt-3')) {                return;
            }

            const columnas = $el.find('.col-12.col-md-6').first().find('.row').first().children('div');
            if (columnas.length < 4) return;

            const cuota = Number($(columnas[0]).text().replace(/\s+/g, ' ').trim());
            const importe = convertirImporte($(columnas[1]).text().replace(/\s+/g, ' ').trim());
            const vencimiento = $(columnas[2]).text().replace(/\s+/g, ' ').trim();
            const estado = $(columnas[3]).text().replace(/\s+/g, ' ').trim().toUpperCase();

            if (Number.isFinite(cuota)) {
                facturas.push({
                    numero: facturaActual.numero,
                    periodo: facturaActual.periodo,
                    cuota,
                    importe,
                    vencimiento,
                    estado
                });
            }
        });
    });

    return facturas;
}

function extraerDatosGenerales(htmlGeneral) {
    if (!htmlGeneral) return { titular: 'N/D', direccion: 'N/D', totalMostrado: 0 };
    const $ = cheerio.load(htmlGeneral);
    const texto = $('body').text().replace(/\s+/g, ' ').trim();

    const titularMatch = texto.match(/Titular de la cuenta:\s*(.*?)\s+Dirección del Suministro:/i);
    const direccionMatch = texto.match(/Dirección del Suministro:\s*(.*?)\s+NIC:/i);
    const totalMatch = texto.match(/Total\s+\$?\s*([\d.,]+)/i);

    return {
        titular: titularMatch ? titularMatch[1].trim() : 'N/D',
        direccion: direccionMatch ? direccionMatch[1].trim() : 'N/D',
        totalMostrado: totalMatch ? convertirImporte(totalMatch[1]) : 0
    };
}

// ==========================================
// AUTOMATIZACIÓN PLAYWRIGHT
// ==========================================
async function obtenerSiteKey(page) {
    return await page.evaluate(() => {
        const iframe = document.querySelector('iframe[src*="recaptcha"]');
        if (iframe) {
            const match = iframe.src.match(/[?&]k=([^&]+)/);
            if (match && match[1]) return match[1];
        }
        const el = document.querySelector('.g-recaptcha, [data-sitekey]');
        return el ? el.getAttribute('data-sitekey') : '6LfEcmcUAAAAAMsSJl579rDd5nw7eArUZn7AFNqY';
    });
}

async function aplicarCaptchaAuto(page) {
    const siteKey = await obtenerSiteKey(page);
    const token = await resolverCaptcha(page.url(), siteKey);

    if (!token) throw new Error('CapSolver no devolvió token.');

    await page.evaluate((captchaToken) => {
        const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
        if (textarea) {
            textarea.value = captchaToken;
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, token);
}

async function consultarUnNIC(page, nic) {
    let general = null;
    let deudaHtml = '';

    const handler = async (response) => {
        const url = response.url();
        try {
            if (url.includes('v_consulta_factura.php')) {
                const t = await response.text();
                if (t.trim()) general = t;
            }
            if (url.includes('v_tabla_factura_consulta_deuda.php')) {
                const t = await response.text();
                if (t.trim()) deudaHtml += t;
            }
        } catch {}
    };

    page.on('response', handler);

    try {
        const input = page.locator('input#nic[type="text"]').first();
        await input.waitFor({ state: 'visible', timeout: 15000 });
        await input.fill(String(nic));

        const botones = page.locator('button[type="submit"]');
        let botonConsultar = null;
        for (let i = 0; i < await botones.count(); i++) {
            const b = botones.nth(i);
            const txt = (await b.innerText().catch(() => '')).toUpperCase();
            if (txt.includes('CONSULTAR')) {
                botonConsultar = b;
                break;
            }
        }

        if (!botonConsultar) throw new Error('Botón CONSULTAR no encontrado.');
        await botonConsultar.click();

        const inicio = Date.now();
        let momentoPrimeraRespuesta = null;

        while (Date.now() - inicio < 12000) {
            if (general || deudaHtml) {
                if (!momentoPrimeraRespuesta) momentoPrimeraRespuesta = Date.now();
                if (Date.now() - momentoPrimeraRespuesta >= 3000) break;
            }
            await page.waitForTimeout(250);
        }

        return { general, deudaHtml };
    } finally {
        page.off('response', handler);
    }
}

// ==========================================
// FUNCIÓN PRINCIPAL DEL SCRAPER
// ==========================================
export async function procesarEdemsa(rutaArchivoEntrada) {
    console.log('[*] Iniciando procesamiento de EDEMSA en paralelo (3 hilos)...');

    const clientes = await leerExcel(rutaArchivoEntrada);
    const resultados = [];
    const cache = cargarCache('edemsa');

    let browser = null;
    let indice = 0;

    if (global.progresoScraping) {
        global.progresoScraping = { porcentaje: 0, actual: 0, total: clientes.length };
    }

    try {
        browser = await chromium.launch({ headless: true });

        const tareas = clientes.map((cliente) => limit(async () => {
            const nic = cliente['NIC EDEMSA'] || cliente.Nic || cliente.nic || 
                        cliente.EDEMSA || cliente.Edemsa || cliente.edemsa || 
                        cliente.NIS || cliente.Nis || cliente.nis || 
                        cliente.CUENTA || cliente.Cuenta || cliente.cuenta || 
                        cliente['N° NIC'] || cliente['NRO NIC'] || cliente['SUMINISTRO'];

            if (!nic || String(nic).trim() === '----------' || String(nic).trim() === '') {
                indice++;
                if (global.progresoScraping) {
                    global.progresoScraping.actual = indice;
                    global.progresoScraping.porcentaje = Math.round((indice / clientes.length) * 100);
                }
                return;
            }

            const nicStr = String(nic).trim();

            // 1. REVISAR CACHÉ
            if (cache[nicStr]) {
                mostrarProgreso(indice + 1, clientes.length, `[CACHE] NIC EDEMSA: ${nicStr}`);
                const c = cache[nicStr];
                resultados.push({
                    ...cliente,
                    ESTADO_EDEMSA: c.estado,
                    TITULAR_EDEMSA: c.titular,
                    DIRECCION_EDEMSA: c.direccion,
                    DEUDA_TOTAL_EDEMSA: c.deudaTotal,
                    FACTURAS_PENDIENTES_EDEMSA: c.facturas,
                    ORIGEN: 'CACHE'
                });

                indice++;
                if (global.progresoScraping) {
                    global.progresoScraping.actual = indice;
                    global.progresoScraping.porcentaje = Math.round((indice / clientes.length) * 100);
                }
                return;
            }

            // 2. CONSULTA EN VIVO
            let page = null;
            try {
                mostrarProgreso(indice + 1, clientes.length, `[EN VIVO] Consultando NIC EDEMSA: ${nicStr}`);

                page = await browser.newPage();
                await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2}', route => route.abort());

                await page.goto(URL_LOGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForTimeout(1000);
                await aplicarCaptchaAuto(page);
                await page.waitForTimeout(1000);

                const { general, deudaHtml } = await consultarUnNIC(page, nicStr);

                const datosGen = extraerDatosGenerales(general);
                const facturas = extraerFacturas(deudaHtml);
                const pendientes = facturas.filter(f => f.estado === 'PENDIENTE');
                const deudaSuma = pendientes.reduce((acc, f) => acc + f.importe, 0);

                const deudaFinal = deudaSuma > 0 ? deudaSuma : datosGen.totalMostrado;
                const estado = deudaFinal > 0 ? 'CON DEUDA' : 'AL DÍA';

                // Guardar en caché con estructura { fecha, monto }
                cache[nicStr] = {
                    estado,
                    titular: datosGen.titular,
                    direccion: datosGen.direccion,
                    deudaTotal: deudaFinal,
                    facturas: pendientes.length,
                    vencimientos: pendientes.map(f => ({ fecha: f.vencimiento, monto: f.importe })),
                    fecha: new Date().toISOString()
                };
                guardarEnCache('edemsa', cache);

                resultados.push({
                    ...cliente,
                    ESTADO_EDEMSA: estado,
                    TITULAR_EDEMSA: datosGen.titular,
                    DIRECCION_EDEMSA: datosGen.direccion,
                    DEUDA_TOTAL_EDEMSA: deudaFinal,
                    FACTURAS_PENDIENTES_EDEMSA: pendientes.length,
                    ORIGEN: 'EN VIVO'
                });

            } catch (err) {
                console.error(`❌ Error en NIC ${nicStr}: ${err.message}`);
                resultados.push({
                    ...cliente,
                    ESTADO_EDEMSA: 'ERROR CONSULTA',
                    TITULAR_EDEMSA: 'N/D',
                    DIRECCION_EDEMSA: 'N/D',
                    DEUDA_TOTAL_EDEMSA: 0,
                    FACTURAS_PENDIENTES_EDEMSA: 0,
                    MENSAJE: err.message
                });
            } finally {
                if (page) await page.close().catch(() => {});
                indice++;
                if (global.progresoScraping) {
                    global.progresoScraping.actual = indice;
                    global.progresoScraping.porcentaje = Math.round((indice / clientes.length) * 100);
                }
            }
        }));

        await Promise.all(tareas);

    } finally {
        if (browser) await browser.close();
    }

    const rutaSalida = path.join(process.cwd(), 'resultados', 'Deudas_EDEMSA_Actualizado.xlsx');
    await guardarExcel(resultados, rutaSalida);

    console.log('[+] Procesamiento de EDEMSA finalizado.');
    return rutaSalida;
}