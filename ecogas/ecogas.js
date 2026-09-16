const { chromium } = require('playwright');
const fs = require('fs');
const { resolverCaptcha } = require('./src/capsolver');

const URL = 'https://autogestion.ecogas.com.ar/uiextranet/ingreso?s=p&c=0';
const INPUT_FILE = 'clientes-ecogas.json';
const CACHE_FILE = 'resultados-ecogas.json';

let cache = {};
if (fs.existsSync(CACHE_FILE)) {
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    cache = {};
  }
}

// Normalizar claves del cache
const cacheNormalizado = {};
for (const [k, v] of Object.entries(cache)) {
  const key = String(k || '').trim();
  if (key) cacheNormalizado[key] = v;
}
cache = cacheNormalizado;

// Leer clientes y deduplicar
const clientesOriginales = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
const clientesMap = new Map();

for (const item of clientesOriginales) {
  const cliente = String(item.cliente || '').trim();
  const nombre = String(item.nombre || '').trim();

  if (!cliente || cliente === '----------') continue;

  if (!clientesMap.has(cliente)) {
    clientesMap.set(cliente, { cliente, nombre });
  } else {
    const existente = clientesMap.get(cliente);
    if (nombre && existente.nombre !== nombre) {
      if (!existente.nombresExtra) existente.nombresExtra = [];
      if (!existente.nombresExtra.includes(nombre)) {
        existente.nombresExtra.push(nombre);
      }
    }
  }
}

const clientes = Array.from(clientesMap.values());
const totalClientes = clientes.length;
let procesados = 0;

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  for (const item of clientes) {
    const cliente = String(item.cliente || '').trim();
    const nombre = String(item.nombre || '').trim();

    if (!cliente) {
      procesados++;
      continue;
    }

    if (cache[cliente]) {
      if (!cache[cliente].nombres) cache[cliente].nombres = [];
      if (nombre && !cache[cliente].nombres.includes(nombre)) cache[cliente].nombres.push(nombre);
      
      if (item.nombresExtra && Array.isArray(item.nombresExtra)) {
        for (const n of item.nombresExtra) {
          if (n && !cache[cliente].nombres.includes(n)) cache[cliente].nombres.push(n);
        }
      }

      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
      procesados++;
      const porcentaje = ((procesados / totalClientes) * 100).toFixed(2);
      console.log(`⏩ ${cliente} ya procesado`);
      console.log(`📈 Progreso: \({procesados}/\){totalClientes} (${porcentaje}%)`);
      continue;
    }

    console.log(`\n🔍 Consultando cliente ${cliente}`);

    try {
      await page.waitForSelector('#cliente', { timeout: 20000 });

      // Inserción limpia del Nro de Cliente
      await page.focus('#cliente');
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.type('#cliente', cliente, { delay: 50 });

      // Resolución de CapSolver
      const token = await resolverCaptcha(page, page.url());

      // Inyección robusta del token en el DOM
      await page.evaluate((captchaToken) => {
        let input = document.querySelector('textarea[name="g-recaptcha-response"]') || 
                    document.querySelector('#g-recaptcha-response');
        
        if (!input) {
          input = document.createElement('textarea');
          input.id = 'g-recaptcha-response';
          input.name = 'g-recaptcha-response';
          input.style.display = 'none';
          document.forms[0].appendChild(input);
        }
        
        input.value = captchaToken;
      }, token);

      console.log("✓ Token inyectado en el formulario.");

      // Disparar envío del formulario
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
        page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) {
            form.submit();
          } else {
            document.querySelector('#btnBuscar, button[type="submit"]').click();
          }
        })
      ]);

      await page.waitForTimeout(2000);

      const tieneDeuda = (await page.locator('#tbl_adeudados tbody tr').count()) > 0;

      const nombres = [];
      if (nombre) nombres.push(nombre);
      if (item.nombresExtra && Array.isArray(item.nombresExtra)) {
        for (const n of item.nombresExtra) {
          if (n && !nombres.includes(n)) nombres.push(n);
        }
      }

      if (!tieneDeuda) {
        cache[cliente] = {
          cliente,
          nombres,
          sinDeuda: true,
          deudas: [],
          fecha: new Date().toISOString()
        };
      } else {
        const deudas = await page.evaluate(() => {
          return [...document.querySelectorAll('#tbl_adeudados tbody tr')]
            .map(tr => {
              const tds = [...tr.querySelectorAll('td')].map(td => td.innerText.trim());
              if (tds.length < 7 || !tds[1] || !tds[3]) return null;

              return {
                comprobante: tds[1],
                documento: tds[2],
                importe: tds[3],
                intereses: tds[4],
                vencimiento: tds[5],
                emision: tds[6]
              };
            })
            .filter(Boolean);
        });

        cache[cliente] = {
          cliente,
          nombres,
          sinDeuda: false,
          deudas,
          fecha: new Date().toISOString()
        };
      }

      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

      procesados++;
      const porcentaje = ((procesados / totalClientes) * 100).toFixed(2);
      console.log(`✅ ${cliente} guardado`);
      console.log(`📈 Progreso: \({procesados}/\){totalClientes} (${porcentaje}%)`);

      // Reiniciar página para la siguiente consulta
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1500);

    } catch (err) {
      procesados++;
      const porcentaje = ((procesados / totalClientes) * 100).toFixed(2);
      console.log(`❌ Error cliente \({cliente}:\){err.message}`);
      console.log(`📈 Progreso: \({procesados}/\){totalClientes} (${porcentaje}%)`);

      try {
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
      } catch (e) {
        console.log(`⚠️ No se pudo reiniciar navegación tras el error en ${cliente}`);
      }
    }
  }

  await browser.close();
  console.log("\n✨ Proceso completado exitosamente.");
})();