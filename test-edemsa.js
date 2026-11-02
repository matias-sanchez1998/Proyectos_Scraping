import { chromium } from "playwright";
import { consultarNIC } from "./src/scrapers/edemsa.js";

const nic = process.argv[2] || "3068797";

let browser;

try {
  browser = await chromium.launch({
    headless: process.env.EDEMSA_HEADLESS === "1",
  });

  const page = await browser.newPage();
  const dato = await consultarNIC(page, nic);

  console.log("\nResultado de EDEMSA para NIC", nic);
  console.log(JSON.stringify(dato, null, 2));
} catch (error) {
  console.error("\nNo se pudo completar la consulta:", error.message);

  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
