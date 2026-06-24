const pool = require('../src/db');
const config = require('./config');
const { formatoPesos, formatoFecha } = require('./formatear');

async function verificarPatrones(evento) {
    const alertas = [];

    if (evento.tipo_evento === 'transaccion_eliminada') {
        const res = await pool.query(`
            SELECT COUNT(*)::int AS total
            FROM auditoria_eventos
            WHERE tipo_evento = 'transaccion_eliminada'
              AND fecha_hora >= NOW() - ($1 || ' minutes')::interval
        `, [config.patrones.eliminacionesEnMinutos]);

        const total = res.rows[0].total;
        if (total >= config.patrones.eliminacionesUmbral) {
            alertas.push({
                tipo: 'patron_sospechoso',
                mensaje: `👁️ *PATRÓN SOSPECHOSO*\n\nSe han eliminado *${total} transacciones* en los últimos ${config.patrones.eliminacionesEnMinutos} minutos.\n\nRevisa el historial con el comando: *eliminadas*`
            });
        }
    }

    if (evento.tipo_evento === 'ajuste_base' || evento.tipo_evento === 'ajuste_cupo') {
        const res = await pool.query(`
            SELECT COUNT(*)::int AS total
            FROM auditoria_eventos
            WHERE tipo_evento IN ('ajuste_base', 'ajuste_cupo')
              AND DATE(fecha_hora AT TIME ZONE 'America/Bogota') = CURRENT_DATE
        `);

        const total = res.rows[0].total;
        if (total > config.patrones.ajustesPorDiaUmbral) {
            alertas.push({
                tipo: 'patron_sospechoso',
                mensaje: `👁️ *PATRÓN SOSPECHOSO*\n\nYa van *${total} ajustes* de base/cupo hoy.\n\nComando: *ajustes*`
            });
        }
    }

    if (evento.tipo_evento === 'transaccion_eliminada' && evento.datos_antes?.id) {
        const txId = evento.transaccion_id || evento.datos_antes.id;
        const res = await pool.query(`
            SELECT t.fecha_hora, ae.fecha_hora AS eliminada
            FROM transacciones t
            RIGHT JOIN auditoria_eventos ae ON ae.transaccion_id = $1
            WHERE ae.tipo_evento = 'transaccion_eliminada'
            ORDER BY ae.fecha_hora DESC LIMIT 1
        `, [txId]);

        // Si la transacción fue creada y eliminada el mismo día con poco tiempo - ya cubierto por eliminaciones masivas
    }

    if (evento.tipo_evento === 'login_fallido') {
        const res = await pool.query(`
            SELECT COUNT(*)::int AS total
            FROM auditoria_eventos
            WHERE tipo_evento = 'login_fallido'
              AND usuario = $1
              AND fecha_hora >= NOW() - INTERVAL '15 minutes'
        `, [evento.usuario]);

        if (res.rows[0].total >= 3) {
            alertas.push({
                tipo: 'patron_sospechoso',
                mensaje: `👁️ *PATRÓN SOSPECHOSO*\n\n*${res.rows[0].total} intentos fallidos* de login para usuario *${evento.usuario}* en 15 minutos.`
            });
        }
    }

    return alertas;
}

module.exports = { verificarPatrones };
