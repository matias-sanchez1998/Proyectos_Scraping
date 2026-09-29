import axios from 'axios';

export async function resolverCaptcha(websiteURL, websiteKey, type = 'ReCaptchaV2TaskProxyless') {
    const CAPSOLVER_API_KEY = process.env.CAPSOLVER_API_KEY;

    if (!CAPSOLVER_API_KEY) {
        console.error('[!] Falta definir CAPSOLVER_API_KEY en el archivo .env');
        return null;
    }

    console.log(`[*] Solicitando resolución a CapSolver...`);

    try {
        const createRes = await axios.post('https://api.capsolver.com/createTask', {
            clientKey: CAPSOLVER_API_KEY,
            task: {
                type: type,
                websiteURL: websiteURL,
                websiteKey: websiteKey,
            },
        });

        if (createRes.data.errorId !== 0) {
            throw new Error(`CapSolver Error: ${createRes.data.errorDescription} (${createRes.data.errorCode})`);
        }

        const taskId = createRes.data.taskId;
        console.log(`[*] Tarea creada en CapSolver (ID: ${taskId}). Esperando solución...`);

        const maxIntentos = 30;
        for (let i = 0; i < maxIntentos; i++) {
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const resultRes = await axios.post('https://api.capsolver.com/getTaskResult', {
                clientKey: CAPSOLVER_API_KEY,
                taskId: taskId,
            });

            if (resultRes.data.status === 'ready') {
                console.log('[+] CAPTCHA resuelto exitosamente por CapSolver.');
                return resultRes.data.solution.gRecaptchaResponse;
            }

            if (resultRes.data.status === 'failed') {
                throw new Error(`La resolución falló en CapSolver: ${resultRes.data.errorDescription || 'Sin detalle'}`);
            }
        }

        throw new Error('Tiempo de espera agotado sin obtener token.');
    } catch (error) {
        console.error('❌ Error resolviendo CAPTCHA:', error.message);
        return null;
    }
}