const XLSX = require('xlsx');
const fs = require('fs');

const workbook = XLSX.readFile('clientes-ecogas.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

const clientes = data
  .filter(row => row.ECOGAS)
  .map(row => {
    const nombre = row.Inquilinos && row.Inquilinos.trim() !== ''
      ? row.Inquilinos.trim()
      : String(row.Propietarios || '').trim();

    return {
      cliente: String(row.ECOGAS).trim(),
      nombre
    };
  });

fs.writeFileSync('clientes-ecogas.json', JSON.stringify(clientes, null, 2));
console.log('clientes-ecogas.json generado correctamente');
