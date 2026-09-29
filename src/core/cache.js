import fs from 'fs';
import path from 'path';

const CARPETA_CACHE = path.join(process.cwd(), 'cache');

function asegurarCarpeta() {
    if (!fs.existsSync(CARPETA_CACHE)) {
        fs.mkdirSync(CARPETA_CACHE, { recursive: true });
    }
}

export function cargarCache(servicio) {
    asegurarCarpeta();
    const rutaArchivo = path.join(CARPETA_CACHE, `cache-${servicio}.json`);
    try {
        if (fs.existsSync(rutaArchivo)) {
            return JSON.parse(fs.readFileSync(rutaArchivo, 'utf8'));
        }
    } catch {
        console.log(`[!] No se pudo leer la caché de ${servicio}. Se creará una nueva.`);
    }
    return {};
}

export function guardarEnCache(servicio, cache) {
    try {
        asegurarCarpeta();
        const rutaArchivo = path.join(CARPETA_CACHE, `cache-${servicio}.json`);
        fs.writeFileSync(rutaArchivo, JSON.stringify(cache, null, 2), 'utf8');
    } catch (err) {
        console.error(`[!] Error escribiendo la caché de ${servicio}:`, err.message);
    }
}