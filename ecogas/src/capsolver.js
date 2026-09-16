// src/capsolver.js
const axios = require("axios");

// Reemplaza con tu API Key personal de CapSolver
const CAPSOLVER_API_KEY = "CAP-771DD4EABF389A3594B6E61C1CFA8E34BF180E4C7F11207E496A95076276A19C";

/**
 * Obtiene la siteKey de reCAPTCHA directamente desde el DOM de la página
 */
async function obtenerSiteKey(page) {
  const siteKey = await page.evaluate(() => {
    // 1. Buscar en el iframe de reCAPTCHA
    const iframe = document.querySelector('iframe[src*="recaptcha"]');
    if (iframe) {
      const match = iframe.src.match(/[?&]k=([^&]+)/);
      if (match && match[1]) return match[1];
    }

    // 2. Buscar en atributo data-sitekey
    const el = document.querySelector(".g-recaptcha, [data-sitekey]");
    if (el && el.getAttribute("data-sitekey")) {
      return el.getAttribute("data-sitekey");
    }

    return null;
  });

  return siteKey;
}

/**
 * Resuelve el reCAPTCHA v2 de cualquier página invocando a CapSolver
 */
async function resolverCaptcha(page, pageUrl) {
  const siteKey = await obtenerSiteKey(page);
  
  if (!siteKey) {
    throw new Error("No se pudo detectar la siteKey de reCAPTCHA en la página.");
  }

  console.log(`SiteKey detectada (\({siteKey.length} chars):\){siteKey}`);
  console.log("Enviando solicitud a la API de CapSolver...");

  try {
    // Crear tarea en CapSolver
    const createRes = await axios.post("https://api.capsolver.com/createTask", {
      clientKey: CAPSOLVER_API_KEY,
      task: {
        type: "ReCaptchaV2TaskProxyless",
        websiteURL: pageUrl,
        websiteKey: siteKey,
      },
    });

    if (createRes.data.errorId !== 0) {
      throw new Error(`CapSolver Error: ${createRes.data.errorDescription}`);
    }

    const taskId = createRes.data.taskId;
    console.log(`Tarea creada en CapSolver (ID: ${taskId}). Esperando solución...`);

    // Consultar resultado en bucle
    let token = null;
    const maxIntentos = 30;

    for (let i = 0; i < maxIntentos; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const resultRes = await axios.post("https://api.capsolver.com/getTaskResult", {
        clientKey: CAPSOLVER_API_KEY,
        taskId: taskId,
      });

      if (resultRes.data.status === "ready") {
        token = resultRes.data.solution.gRecaptchaResponse;
        break;
      }

      if (resultRes.data.status === "failed") {
        throw new Error("La resolución del CAPTCHA falló en CapSolver.");
      }
    }

    if (token) {
      console.log("✓ CAPTCHA resuelto exitosamente por CapSolver.");
      return token;
    } else {
      throw new Error("Tiempo de espera agotado sin obtener token.");
    }
  } catch (error) {
    console.error("❌ Error resolviendo CAPTCHA:", error.message);
    throw error;
  }
}

module.exports = { resolverCaptcha };