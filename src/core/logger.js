export function mostrarProgreso(actual, total, mensaje) {
    const porcentaje = Math.min(100, Math.max(0, Math.round((actual / total) * 100)));
    const barrasCompletas = Math.round(porcentaje / 5); // 20 bloques en total
    const barrasVacias = 20 - barrasCompletas;
    const barraVisual = '█'.repeat(barrasCompletas) + '░'.repeat(barrasVacias);
    
    console.log(`\n[${barraVisual}] ${porcentaje}% (${actual}/${total}) -> ${mensaje}`);
}