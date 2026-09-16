const { chromium } = require("playwright");
const { resolverCaptcha } = require("./capsolver");

const URL = "https://oficinavirtual.edemsa.com";

async function aplicarCaptchaAuto(page) {
  const token = await resolverCaptcha(page);

  await page.evaluate((captchaToken) => {
    const textarea = document.querySelector(
      'textarea[name="g-recaptcha-response"]'
    );

    if (textarea) {
      textarea.value = captchaToken;

      textarea.dispatchEvent(
        new Event("change", { bubbles: true })
      );

      textarea.dispatchEvent(
        new Event("input", { bubbles: true })
      );
    }
  }, token);
}

async function encontrarInputNIC(page) {
  const input = page.locator(
    'input#nic[type="text"]'
  ).first();

  await input.waitFor({
    state: "visible",
    timeout: 15000,
  });

  return input;
}

async function encontrarBotonConsultar(page) {
  const botones = page.locator(
    'button[type="submit"]'
  );

  for (let i = 0; i < await botones.count(); i++) {
    const boton = botones.nth(i);

    if (
      await boton.isVisible().catch(() => false) &&
      (
        await boton.innerText()
          .catch(() => "")
      )
        .trim()
        .toUpperCase()
        .includes("CONSULTAR")
    ) {
      return boton;
    }
  }

  throw new Error(
    "No se encontró el botón CONSULTAR."
  );
}

async function consultarUnNIC(page, nic) {
  let general = null;
  const deuda = [];

  const handler = async (response) => {
    const url = response.url();

    try {
      if (
  url.includes("/Pms/vista/")
) {
  console.log(
    "→ Respuesta:",
    url
  );
}
      if (
        url.includes(
          "v_consulta_factura.php"
        )
      ) {
        const texto = await response.text();

        if (texto.trim()) {
          general = texto;
          console.log(
            "✓ Respuesta general capturada"
          );
        }
      }

      if (
        url.includes(
          "v_tabla_factura_consulta_deuda.php"
        )
      ) {
        const texto = await response.text();

        if (texto.trim()) {
          deuda.push(texto);

          console.log(
            "✓ Respuesta deuda capturada"
          );
        }
      }
    } catch (error) {
      console.log(
        "Error leyendo respuesta:",
        error.message
      );
    }
  };

  page.on("response", handler);

  try {
    const input = await encontrarInputNIC(
      page
    );

    await input.fill(String(nic));

    console.log(
      `✓ NIC ${nic} ingresado`
    );

    const boton =
      await encontrarBotonConsultar(page);

    await boton.click();

    console.log(
      `✓ NIC ${nic} enviado`
    );
    console.log(
  "Esperando respuestas de EDEMSA..."
);

   const inicio = Date.now();
const maximo = 10000;

// Esperamos hasta recibir ambas respuestas.
// Para un NIC sin deuda puede no existir respuesta
// de v_tabla_factura_consulta_deuda.php, por lo que
// dejamos unos segundos adicionales después de la
// primera respuesta.

let primeraRespuesta = false;
let momentoPrimeraRespuesta = null;

while (
  Date.now() - inicio < maximo
) {
  const tieneGeneral = !!general;
  const tieneDeuda = deuda.length > 0;

  if (tieneGeneral || tieneDeuda) {
    if (!primeraRespuesta) {
      primeraRespuesta = true;
      momentoPrimeraRespuesta = Date.now();

      console.log(
        "✓ Primera respuesta recibida, esperando respuestas adicionales..."
      );
    }

    // Esperamos 3 segundos desde la primera respuesta
    // para darle tiempo a la otra petición.
    if (
      Date.now() - momentoPrimeraRespuesta >= 3000
    ) {
      break;
    }
  }

  await page.waitForTimeout(250);
}

    return {
      nic: String(nic),
      general,
      deuda,
      estado:
        general || deuda.length > 0
          ? "OK"
          : "SIN_RESPUESTA",
    };
  } catch (error) {
    return {
      nic: String(nic),
      general: null,
      deuda: [],
      estado: "ERROR",
      error: error.message,
    };
  } finally {
    page.off(
      "response",
      handler
    );
  }
}

async function consultarNICs(nics) {
  const browser = await chromium.launch({
    headless: false,
  });

  const context =
    await browser.newContext();

  const page =
    await context.newPage();

  const resultados = [];

  try {
    console.log(
      "\n======================================"
    );
    console.log(
      "      EDEMSA - CONSULTA AUTOMATICA"
    );
    console.log(
      "======================================\n"
    );

    await page.goto(URL, {
      waitUntil:
        "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForTimeout(2000);

    console.log(
      "Resolviendo CAPTCHA..."
    );

    await aplicarCaptchaAuto(page);

    console.log(
      "✓ CAPTCHA procesado"
    );

    await page.waitForTimeout(2000);

    // ==================================================
    // NIC POR NIC
    // ==================================================

    for (let i = 0; i < nics.length; i++) {
      const nic = String(nics[i]);

      console.log(
        `\n======================================`
      );

      console.log(
        `NIC ${i + 1} de ${nics.length}: ${nic}`
      );

      console.log(
        "======================================"
      );

      try {
        // Para consultas posteriores volvemos
        // a login.php, igual que la navegación
        // normal del sitio.

        if (i > 0) {
          console.log(
            "Abriendo nueva consulta..."
          );

          await page.goto(
            "https://oficinavirtual.edemsa.com/login.php",
            {
              waitUntil:
                "domcontentloaded",
              timeout: 60000,
            }
          );

          await page.waitForTimeout(
            2000
          );

          console.log(
            "Resolviendo CAPTCHA..."
          );

          await aplicarCaptchaAuto(
            page
          );

          console.log(
            "✓ CAPTCHA procesado"
          );

          await page.waitForTimeout(
            1500
          );
        }

        const resultado =
          await consultarUnNIC(
            page,
            nic
          );

        resultados.push(resultado);

        console.log(
          `Estado: ${resultado.estado}`
        );

        console.log(
          `General: ${
            resultado.general
              ? "SI"
              : "NO"
          }`
        );

        console.log(
          `Deuda: ${
            resultado.deuda.length > 0
              ? "SI"
              : "NO"
          }`
        );
      } catch (error) {
        resultados.push({
          nic,
          general: null,
          deuda: [],
          estado: "ERROR",
          error: error.message,
        });

        console.log(
          `❌ Error NIC ${nic}:`,
          error.message
        );
      }

      await page.waitForTimeout(
        2000
      );
    }

    return resultados;
  } finally {
    await browser.close();
  }
}

module.exports = {
  consultarNICs,
};