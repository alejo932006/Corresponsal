const pool = require('../src/db');
const { formatearEvento, debeEnviarEvento } = require('./formatear');
const { verificarPatrones } = require('./patrones');

async function obtenerEventosPendientes() {
    const res = await pool.query(`
        SELECT *
        FROM auditoria_eventos
        WHERE notificado_whatsapp = FALSE
        ORDER BY id ASC
        LIMIT 20
    `);
    return res.rows;
}

async function marcarNotificado(id) {
    await pool.query(
        'UPDATE auditoria_eventos SET notificado_whatsapp = TRUE WHERE id = $1',
        [id]
    );
}

async function procesarColaAlertas(client, enviarA) {
    const eventos = await obtenerEventosPendientes();

    for (const evento of eventos) {
        try {
            if (debeEnviarEvento(evento)) {
                const mensaje = formatearEvento(evento);
                for (const numero of enviarA) {
                    const chatId = numero.includes('@') ? numero : `${numero}@c.us`;
                    await client.sendMessage(chatId, mensaje);
                }
            }

            await marcarNotificado(evento.id);

            const patrones = await verificarPatrones(evento);
            for (const patron of patrones) {
                for (const numero of enviarA) {
                    const chatId = numero.includes('@') ? numero : `${numero}@c.us`;
                    await client.sendMessage(chatId, patron.mensaje);
                }
            }
        } catch (error) {
            console.error(`Error enviando alerta ID ${evento.id}:`, error.message);
        }
    }
}

function iniciarPollingAlertas(client, config) {
    const destinos = config.numerosAutorizados;

    const tick = () => {
        procesarColaAlertas(client, destinos).catch((err) => {
            console.error('Error en polling de alertas:', err.message);
        });
    };

    tick();
    return setInterval(tick, config.pollIntervalMs);
}

module.exports = {
    obtenerEventosPendientes,
    marcarNotificado,
    procesarColaAlertas,
    iniciarPollingAlertas
};
