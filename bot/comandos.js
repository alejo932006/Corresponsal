const pool = require('../src/db');
const { formatoPesos, formatoFecha } = require('./formatear');

async function cmdAyuda() {
    return `🤖 *BOT CORRESPONSAL - COMANDOS*

📊 *resumen* — Totales del día
💵 *base* — Base actual en caja
🏦 *cupo* — Saldo por banco
📦 *caja* — Estado de caja (abierta/cerrada)
📋 *ultimas* — Últimas 10 transacciones
📋 *ultimas [usuario]* — Movimientos de un cajero
🚨 *alertas* — Eventos sospechosos de hoy
⚙️ *ajustes* — Ajustes de base/cupo hoy
🗑️ *eliminadas* — Transacciones eliminadas hoy
❓ *ayuda* — Esta lista`;
}

async function cmdResumen() {
    const res = await pool.query(`
        SELECT
            COUNT(*)::int AS total,
            COALESCE(SUM(CASE WHEN tp.afecta_caja = 1 THEN t.monto ELSE 0 END), 0) AS entradas,
            COALESCE(SUM(CASE WHEN tp.afecta_caja = -1 THEN t.monto ELSE 0 END), 0) AS salidas
        FROM transacciones t
        JOIN tipos_transaccion tp ON t.tipo_id = tp.id
        WHERE DATE(t.fecha_hora AT TIME ZONE 'America/Bogota') = CURRENT_DATE
    `);

    const r = res.rows[0];
    return `📊 *RESUMEN DEL DÍA*
📅 ${new Date().toLocaleDateString('es-CO')}

📋 Transacciones: *${r.total}*
📥 Entradas caja: *${formatoPesos(r.entradas)}*
📤 Salidas caja: *${formatoPesos(r.salidas)}*`;
}

async function cmdBase() {
    const caja = await pool.query(`
        SELECT monto_inicial, estado, hora_apertura
        FROM aperturas_caja ORDER BY id DESC LIMIT 1
    `);

    if (!caja.rows.length || caja.rows[0].estado !== 'ABIERTA') {
        return '📦 *BASE EN CAJA*\n\n⛔ No hay caja abierta actualmente.';
    }

    const { monto_inicial, hora_apertura } = caja.rows[0];
    const movs = await pool.query(`
        SELECT COALESCE(SUM(t.monto * tp.afecta_caja), 0) AS total
        FROM transacciones t
        JOIN tipos_transaccion tp ON t.tipo_id = tp.id
        WHERE t.fecha_hora >= $1
    `, [hora_apertura]);

    const base = parseFloat(monto_inicial) + parseFloat(movs.rows[0].total);

    return `💵 *BASE EN CAJA*
🔓 Caja ABIERTA
📌 Base inicial: *${formatoPesos(monto_inicial)}*
💰 Base actual: *${formatoPesos(base)}*`;
}

async function cmdCupo() {
    const res = await pool.query(`
        SELECT b.nombre, COALESCE(SUM(t.monto * tp.afecta_banco), 0) AS saldo
        FROM bancos b
        LEFT JOIN transacciones t ON b.id = t.banco_id
        LEFT JOIN tipos_transaccion tp ON t.tipo_id = tp.id
        GROUP BY b.id, b.nombre
        ORDER BY b.nombre
    `);

    let msg = '🏦 *CUPO POR BANCO*\n\n';
    res.rows.forEach((b) => {
        msg += `• *${b.nombre}*: ${formatoPesos(b.saldo)}\n`;
    });
    return msg.trim();
}

async function cmdCaja() {
    const res = await pool.query(`
        SELECT ac.estado, ac.monto_inicial, ac.hora_apertura, u.nombre AS usuario
        FROM aperturas_caja ac
        JOIN usuarios u ON ac.usuario_id = u.id
        ORDER BY ac.id DESC LIMIT 1
    `);

    if (!res.rows.length) return '📦 *CAJA*\n\nSin historial de aperturas.';

    const c = res.rows[0];
    const estado = c.estado === 'ABIERTA' ? '🔓 ABIERTA' : '🔒 CERRADA';

    return `📦 *ESTADO DE CAJA*
${estado}
👤 Abierta por: *${c.usuario}*
💰 Base inicial: *${formatoPesos(c.monto_inicial)}*
🕐 Apertura: ${formatoFecha(c.hora_apertura)}`;
}

async function cmdUltimas(usuarioFiltro) {
    let query = `
        SELECT t.id, t.monto, t.descripcion, tp.nombre AS tipo,
               u.nombre AS usuario, t.fecha_hora
        FROM transacciones t
        JOIN tipos_transaccion tp ON t.tipo_id = tp.id
        JOIN usuarios u ON t.usuario_id = u.id
        WHERE DATE(t.fecha_hora AT TIME ZONE 'America/Bogota') = CURRENT_DATE
    `;
    const params = [];

    if (usuarioFiltro) {
        params.push(usuarioFiltro);
        query += ` AND u.nombre ILIKE $${params.length}`;
    }

    query += ` ORDER BY t.id DESC LIMIT 10`;

    const res = await pool.query(query, params);
    if (!res.rows.length) return '📋 Sin transacciones hoy.';

    let msg = usuarioFiltro
        ? `📋 *ÚLTIMAS DE ${usuarioFiltro.toUpperCase()}*\n\n`
        : '📋 *ÚLTIMAS 10 TRANSACCIONES*\n\n';

    res.rows.forEach((t) => {
        msg += `• ${formatoFecha(t.fecha_hora)} | *${t.tipo}*\n`;
        msg += `  ${formatoPesos(t.monto)} | 👤 ${t.usuario}\n`;
        if (t.descripcion) msg += `  _${t.descripcion}_\n`;
        msg += '\n';
    });

    return msg.trim();
}

async function cmdAlertas() {
    const res = await pool.query(`
        SELECT tipo_evento, nivel, usuario, descripcion, monto, fecha_hora
        FROM auditoria_eventos
        WHERE nivel IN ('alerta', 'critico')
          AND DATE(fecha_hora AT TIME ZONE 'America/Bogota') = CURRENT_DATE
        ORDER BY fecha_hora DESC
        LIMIT 15
    `);

    if (!res.rows.length) return '✅ Sin alertas críticas hoy.';

    let msg = '🚨 *ALERTAS DE HOY*\n\n';
    res.rows.forEach((e, i) => {
        const icono = e.nivel === 'critico' ? '🔴' : '🟡';
        msg += `${icono} *${i + 1}.* ${e.tipo_evento.replace(/_/g, ' ')}\n`;
        msg += `   🕐 ${formatoFecha(e.fecha_hora)} | 👤 ${e.usuario || '?'}\n`;
        msg += `   ${e.descripcion || ''}\n\n`;
    });

    return msg.trim();
}

async function cmdAjustes() {
    const res = await pool.query(`
        SELECT tipo_evento, usuario, descripcion, monto, banco_nombre, fecha_hora
        FROM auditoria_eventos
        WHERE tipo_evento IN ('ajuste_base', 'ajuste_cupo')
          AND DATE(fecha_hora AT TIME ZONE 'America/Bogota') = CURRENT_DATE
        ORDER BY fecha_hora DESC
    `);

    if (!res.rows.length) return '✅ Sin ajustes de base/cupo hoy.';

    let msg = '⚙️ *AJUSTES DE HOY*\n\n';
    res.rows.forEach((e) => {
        const tipo = e.tipo_evento === 'ajuste_base' ? 'BASE' : 'CUPO';
        msg += `• [${tipo}] ${formatoFecha(e.fecha_hora)}\n`;
        msg += `  👤 ${e.usuario} | ${formatoPesos(e.monto)}\n`;
        if (e.banco_nombre) msg += `  🏦 ${e.banco_nombre}\n`;
        msg += `  ${e.descripcion}\n\n`;
    });

    return msg.trim();
}

async function cmdEliminadas() {
    const res = await pool.query(`
        SELECT usuario, descripcion, monto, banco_nombre, fecha_hora, datos_antes
        FROM auditoria_eventos
        WHERE tipo_evento = 'transaccion_eliminada'
          AND DATE(fecha_hora AT TIME ZONE 'America/Bogota') = CURRENT_DATE
        ORDER BY fecha_hora DESC
    `);

    if (!res.rows.length) return '✅ Sin eliminaciones registradas hoy.';

    let msg = '🗑️ *TRANSACCIONES ELIMINADAS HOY*\n\n';
    res.rows.forEach((e) => {
        msg += `• ${formatoFecha(e.fecha_hora)} | 👤 *${e.usuario}*\n`;
        msg += `  ${formatoPesos(e.monto)} | ${e.descripcion || ''}\n\n`;
    });

    return msg.trim();
}

async function procesarComando(texto) {
    const partes = texto.trim().toLowerCase().split(/\s+/);
    const cmd = partes[0];

    switch (cmd) {
        case 'ayuda':
        case 'help':
        case 'menu':
            return cmdAyuda();
        case 'resumen':
            return cmdResumen();
        case 'base':
            return cmdBase();
        case 'cupo':
        case 'bancos':
            return cmdCupo();
        case 'caja':
            return cmdCaja();
        case 'ultimas':
            return cmdUltimas(partes[1] || null);
        case 'alertas':
            return cmdAlertas();
        case 'ajustes':
            return cmdAjustes();
        case 'eliminadas':
            return cmdEliminadas();
        case 'hola':
        case 'ping':
            return '🤖 Bot Corresponsal activo. Escribe *ayuda* para ver comandos.';
        default:
            return `❓ Comando no reconocido: *${cmd}*\n\nEscribe *ayuda* para ver los comandos disponibles.`;
    }
}

module.exports = { procesarComando };
