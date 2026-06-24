const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('../bot/config');
const { esNumeroAutorizado } = require('../bot/formatear');
const { procesarComando } = require('../bot/comandos');
const { iniciarPollingAlertas } = require('../bot/alertas');
const { initAuditoria } = require('../src/auditoria');

let pollingInterval = null;

async function iniciarBot() {
    console.log('🔧 Inicializando auditoría...');
    await initAuditoria();

    console.log('📱 Iniciando bot de WhatsApp...');
    console.log(`   Números autorizados: ${config.numerosAutorizados.join(', ')}`);

    const client = new Client({
        authStrategy: new LocalAuth({ dataPath: config.dataPath }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    client.on('qr', (qr) => {
        console.log('\n📲 Escanea este QR con WhatsApp (Dispositivos vinculados):\n');
        qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => {
        console.log('✅ WhatsApp autenticado (sesión guardada en .wwebjs_auth)');
    });

    client.on('auth_failure', (msg) => {
        console.error('❌ Fallo de autenticación WhatsApp:', msg);
    });

    client.on('ready', () => {
        console.log('🤖 Bot Corresponsal listo y escuchando');
        console.log('   Comandos: resumen | base | cupo | caja | ultimas | alertas | ayuda');

        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = iniciarPollingAlertas(client, config);
    });

    client.on('message', async (msg) => {
        try {
            if (msg.from.includes('@g.us')) return;

            if (!esNumeroAutorizado(msg.from)) {
                console.log(`⛔ Mensaje ignorado de número no autorizado: ${msg.from}`);
                return;
            }

            const texto = msg.body?.trim();
            if (!texto) return;

            console.log(`📩 Comando recibido: "${texto}" de ${msg.from}`);
            const respuesta = await procesarComando(texto);
            await msg.reply(respuesta);
        } catch (error) {
            console.error('Error procesando mensaje:', error.message);
            try {
                await msg.reply('❌ Error interno procesando el comando. Intenta de nuevo.');
            } catch (_) {}
        }
    });

    client.on('disconnected', (reason) => {
        console.warn('⚠️ WhatsApp desconectado:', reason);
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
        console.log('   Reinicia el bot: npm run bot');
    });

    await client.initialize();
    return client;
}

iniciarBot().catch((err) => {
    console.error('Error fatal iniciando bot:', err);
    process.exit(1);
});
