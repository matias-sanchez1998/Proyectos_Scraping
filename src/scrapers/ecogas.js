import { chromium } from 'playwright';
import { leerExcel, guardarExcel } from '../core/excel.js';
import { cargarCache, guardarEnCache } from '../core/cache.js';
import { resolverCaptcha } from '../core/capsolver.js';
import { mostrarProgreso } from '../core/logger.js';
import path from 'path';
import pLimit from 'p-limit';

const URL_ECOGAS = 'https://autogestion.ecogas.com.ar/uiextranet/ingreso?s=p&c=0';

// Concurrencia controlada: 3 cuentas en paralelo simultáneas
const limit = pLimit(3);

async function obtenerSiteKey(page) {
    const siteKey = await page.evaluate(() => {
        const iframe = document.querySelector('iframe[src*="recaptcha"]');
        if (iframe) {
            const match = iframe.src.match(/[?&]k=([^&]+)/);
            if (match && match[1]) return match[1];
        }
        const el = document.querySelector('.g-recaptcha, [data-sitekey]');
        if (el && el.getAttribute('data-sitekey')) {
            return el.getAttribute('data-sitekey');
        }
        return null;
    });

    return siteKey || '6LfEcmcUAAAAAMsSJl579rDd5nw7eArUZn7AFNqY';
}

function convertirImporte(texto) {
    if (!texto) return 0;
    const t = String(texto).trim();
    if (t.includes('/') || t.includes('-')) return 0;

    const match = t.match(/[\d.,]+/);
    if (!match) return 0;
    
    let limpio = match[0];
    if (limpio.includes(',') && limpio.includes('.')) {
        limpio = limpio.replace(/\./g, '').replace(',', '.');
    } else if (limpio.includes(',')) {
        limpio = limpio.replace(',', '.');
    }

    const numero = parseFloat(limpio);
    return Number.isFinite(numero) ? numero : 0;
}

export async function procesarEcogas(rutaArchivoEntrada) {
    console.log('[*] Iniciando procesamiento de Ecogas en paralelo (3 hilos)...');

    const clientes = await leerExcel(rutaArchivoEntrada);
    const resultados = [];
    const cache = cargarCache('ecogas');

    let browser = null;
    let indice = 0;

    if (global.progresoScraping) {
        global.progresoScraping = { porcentaje: 0, actual: 0, total: clientes.length };
    }

    try {
        browser = await chromium.launch({ headless: true }); // headless: true ahorra mucha CPU y memoria RAM

        const tareas = clientes.map((cliente, i) => limit(async () => {
            let nroCliente = null;
            for (const [key, val] of Object.entries(cliente)) {
                if (key.toUpperCase().includes('ECOGAS') || key.toUpperCase().includes('CLIENTE')) {
                    if (val) nroCliente = val;
                }
            }

            if (!nroCliente || String(nroCliente).trim() === '----------' || String(nroCliente).trim() === '') {
                indice++;
                if (global.progresoScraping) {
                    global.progresoScraping.actual = indice;
                    global.progresoScraping.porcentaje = Math.round((indice / clientes.length) * 100);
                }
                return;
            }

            const nroClienteStr = String(nroCliente).trim();
            const cacheItem = cache[nroClienteStr];
            const esCacheBuggeada = cacheItem && cacheItem.estado === 'CON DEUDA' && cacheItem.total === 0;

            // CASO 1: Desde la caché
            if (cacheItem && !esCacheBuggeada) {
                mostrarProgreso(indice + 1, clientes.length, `[CACHE] Cuenta Ecogas: ${nroClienteStr}`);
                resultados.push({
                    ...cliente,
                    ESTADO_ECOGAS: cacheItem.estado,
                    DEUDA_TOTAL_ECOGAS: cacheItem.total,
                    CANTIDAD_COMPROBANTES: cacheItem.cantidad,
                    ORIGEN: 'CACHE'
                });
                indice++;
                if (global.progresoScraping) {
                    global.progresoScraping.actual = indice;
                    global.progresoScraping.porcentaje = Math.round((indice / clientes.length) * 100);
                }
                return;
            }

            // CASO 2: Consulta en vivo (abriendo una pestaña exclusiva que luego se destruye)
            let page = null;
            try {
                mostrarProgreso(indice + 1, clientes.length, `[EN VIVO] Consultando Ecogas: ${nroClienteStr}`);
                
                page = await browser.newPage();

                // Optimización: bloquea imágenes y fuentes para que cargue ultra rápido
                await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2}', route => route.abort());

                await page.goto(URL_ECOGAS, { waitUntil: 'domcontentloaded', timeout: 60000 });

                await page.waitForSelector('#cliente', { timeout: 20000 });
                await page.fill('#cliente', nroClienteStr);

                const siteKey = await obtenerSiteKey(page);
                const token = await resolverCaptcha(page.url(), siteKey);

                if (!token) throw new Error('No se obtuvo token de captcha');

                await page.evaluate((captchaToken) => {
                    let input = document.querySelector('textarea[name="g-recaptcha-response"]') || document.querySelector('#g-recaptcha-response');
                    if (!input) {
                        input = document.createElement('textarea');
                        input.id = 'g-recaptcha-response';
                        input.name = 'g-recaptcha-response';
                        input.style.display = 'none';
                        document.forms[0].appendChild(input);
                    }
                    input.value = captchaToken;
                }, token);

                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
                    page.evaluate(() => {
                        const form = document.querySelector('form');
                        if (form) form.submit();
                        else {
                            const btn = document.querySelector('#btnBuscar, button[type="submit"]');
                            if (btn) btn.click();
                        }
                    })
                ]);

                await page.waitForTimeout(1500);

                const filasTabla = await page.evaluate(() => {
                    return [...document.querySelectorAll('#tbl_adeudados tbody tr')]
                        .map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim()))
                        .filter(tds => tds.length > 0);
                });

                let totalMonto = 0;
                let cantComprobantes = filasTabla.length;
                let vencimientos = [];

                for (const tds of filasTabla) {
                    let montoFila = 0;
                    let vtoFila = ''; 
                    
                    for (const textoCelda of tds) {
                        const valor = convertirImporte(textoCelda);
                        if (valor > montoFila) montoFila = valor;

                        if (/^\d{2}\/\d{2}\/\d{4}$/.test(textoCelda)) {
                            if (!vtoFila) {
                                vtoFila = textoCelda;
                            } else {
                                const [d1, m1, a1] = vtoFila.split('/');
                                const [d2, m2, a2] = textoCelda.split('/');
                                const f1 = new Date(a1, m1 - 1, d1);
                                const f2 = new Date(a2, m2 - 1, d2);
                                if (f2 > f1) vtoFila = textoCelda;
                            }
                        }
                    }

                    if (vtoFila) vencimientos.push({ fecha: vtoFila, monto: montoFila });
                    totalMonto += montoFila;
                }

                let estado = totalMonto > 0 ? 'CON DEUDA' : 'AL DÍA';

                // Guardar en caché
                cache[nroClienteStr] = {
                    estado,
                    total: totalMonto,
                    cantidad: cantComprobantes,
                    vencimientos,
                    fecha: new Date().toISOString()
                };
                guardarEnCache('ecogas', cache);

                resultados.push({
                    ...cliente,
                    ESTADO_ECOGAS: estado,
                    DEUDA_TOTAL_ECOGAS: totalMonto,
                    CANTIDAD_COMPROBANTES: cantComprobantes,
                    ORIGEN: 'EN VIVO'
                });

            } catch (err) {
                console.error(`❌ Error en cliente ${nroClienteStr}: ${err.message}`);
                resultados.push({ 
                    ...cliente, 
                    ESTADO_ECOGAS: 'ERROR CONSULTA', 
                    DEUDA_TOTAL_ECOGAS: 0, 
                    CANTIDAD_COMPROBANTES: 0, 
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

    const rutaSalida = path.join(process.cwd(), 'resultados', 'Deudas_Ecogas_Actualizado.xlsx');
    await guardarExcel(resultados, rutaSalida);
    console.log('[+] Procesamiento de Ecogas finalizado.');
    return rutaSalida;
}