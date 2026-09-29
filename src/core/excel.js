import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

export async function leerExcel(rutaArchivo) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(rutaArchivo);
    const worksheet = workbook.worksheets[0];

    const filas = [];
    let encabezados = [];

    const normalizarValor = (val) => {
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') {
            if (val.result !== undefined) return String(val.result).trim();
            if (val.text !== undefined) return String(val.text).trim();
            if (val.richText) return val.richText.map(t => t.text).join('').trim();
            return '';
        }
        return String(val).trim();
    };

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
            encabezados = row.values.slice(1).map(h => normalizarValor(h));
            return;
        }

        const datosFila = {};
        let tieneDatos = false;

        row.values.slice(1).forEach((valor, index) => {
            const clave = encabezados[index];
            if (clave) {
                const valLimpio = normalizarValor(valor);
                datosFila[clave] = valLimpio;
                if (valLimpio !== '') tieneDatos = true;
            }
        });

        if (tieneDatos) {
            filas.push(datosFila);
        }
    });

    return filas;
}

export async function guardarExcel(datos, rutaSalida) {
    const dir = path.dirname(rutaSalida);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Resultados');

    if (!datos || datos.length === 0) {
        await workbook.xlsx.writeFile(rutaSalida);
        return;
    }

    const columnas = Object.keys(datos[0]).map(clave => ({
        header: clave,
        key: clave,
        width: Math.max(clave.length + 5, 15)
    }));

    worksheet.columns = columnas;

    datos.forEach(fila => {
        worksheet.addRow(fila);
    });

    // Formato negrita al encabezado
    worksheet.getRow(1).font = { bold: true };

    await workbook.xlsx.writeFile(rutaSalida);
    console.log(`[+] Archivo Excel guardado exitosamente en: ${rutaSalida}`);
}