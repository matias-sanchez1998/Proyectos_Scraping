// Conversión decimal exacta: evita redondear importes con Number.
const unidades = ["CERO","UNO","DOS","TRES","CUATRO","CINCO","SEIS","SIETE","OCHO","NUEVE","DIEZ","ONCE","DOCE","TRECE","CATORCE","QUINCE","DIECISÉIS","DIECISIETE","DIECIOCHO","DIECINUEVE","VEINTE","VEINTIUNO","VEINTIDÓS","VEINTITRÉS","VEINTICUATRO","VEINTICINCO","VEINTISÉIS","VEINTISIETE","VEINTIOCHO","VEINTINUEVE"];
function apocopar(texto) {return texto.replace(/VEINTIUNO$/,"VEINTIÚN").replace(/ Y UNO$/," Y UN").replace(/UNO$/,"UN");}
function menores(n) {
  if(n<30)return unidades[n];
  if(n<100)return ["","","","TREINTA","CUARENTA","CINCUENTA","SESENTA","SETENTA","OCHENTA","NOVENTA"][Math.floor(n/10)]+(n%10?" Y "+unidades[n%10]:"");
  if(n===100)return "CIEN";
  return ["","CIENTO","DOSCIENTOS","TRESCIENTOS","CUATROCIENTOS","QUINIENTOS","SEISCIENTOS","SETECIENTOS","OCHOCIENTOS","NOVECIENTOS"][Math.floor(n/100)]+(n%100?" "+menores(n%100):"");
}
export function enteroALetras(n) {
  n=BigInt(n);
  if(n<0n||n>999999999999n)throw new Error("El importe está fuera del rango permitido.");
  if(n<1000n)return menores(Number(n));
  if(n<1000000n){const miles=n/1000n,resto=n%1000n;return (miles===1n?"MIL":apocopar(menores(Number(miles)))+" MIL")+(resto?" "+menores(Number(resto)):"");}
  const millones=n/1000000n,resto=n%1000000n;
  return (millones===1n?"UN MILLÓN":apocopar(enteroALetras(millones))+" MILLONES")+(resto?" "+enteroALetras(resto):"");
}
export function importeALetras(valor) {
  const s=String(valor).trim();
  if(!/^\d{1,12}(?:[.,]\d{1,2})?$/.test(s))throw new Error("Usá un importe sin separador de miles y con hasta dos decimales.");
  const [entero,decimal=""]=s.replace(",",".").split(".");
  const centavos=BigInt(entero)*100n+BigInt(decimal.padEnd(2,"0"));
  const pesos=centavos/100n,cent=centavos%100n;
  const letras=apocopar(enteroALetras(pesos))+(cent?" CON "+String(cent).padStart(2,"0")+"/100":"");
  const numero=pesos.toLocaleString("es-AR")+(cent?","+String(cent).padStart(2,"0"):"");
  return {centavos:centavos.toString(),letras,numero,completo:`PESOS ${letras} ($${numero})`};
}
