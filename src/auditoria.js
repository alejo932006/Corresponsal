const pool = require('./db');

const NIVEL = {
    INFO: 'info',
    ALERTA: 'alerta',
    CRITICO: 'critico'
};

const TIPO = {
    LOGIN_OK: 'login_ok',
    LOGIN_FALLIDO: 'login_fallido',
    TRANSACCION_CREADA: 'transaccion_creada',
    AJUSTE_BASE: 'ajuste_base',
    AJUSTE_CUPO: 'ajuste_cupo',
    TRANSACCION_EDITADA: 'transaccion_editada',
    TRANSACCION_ELIMINADA: 'transaccion_eliminada',
    APERTURA_CAJA: 'apertura_caja',
    CIERRE_CAJA: 'cierre_caja',
    REAPERTURA_CAJA: 'reapertura_caja',
    RESET_DB: 'reset_db',
    USUARIO_CREADO: 'usuario_creado',
    USUARIO_ELIMINADO: 'usuario_eliminado',
    CLAVE_CAMBIADA: 'clave_cambiada',
    CAJON_ABIERTO: 'cajon_abierto',
    MONTO_ALTO: 'monto_alto',
    ACTIVIDAD_NOCTURNA: 'actividad_nocturna'
};

async function initAuditoria() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS auditoria_eventos (
            id SERIAL PRIMARY KEY,
            fecha_hora TIMESTAMPTZ DEFAULT NOW(),
            tipo_evento VARCHAR(80) NOT NULL,
            nivel VARCHAR(20) DEFAULT 'info',
            usuario VARCHAR(100),
            descripcion TEXT,
            monto DECIMAL(15,2),
            transaccion_id INTEGER,
            banco_id INTEGER,
            banco_nombre VARCHAR(100),
            datos_antes JSONB,
            datos_despues JSONB,
            notificado_whatsapp BOOLEAN DEFAULT FALSE,
            ip VARCHAR(45)
        );

        CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria_eventos (fecha_hora DESC);
        CREATE INDEX IF NOT EXISTS idx_auditoria_notificado ON auditoria_eventos (notificado_whatsapp) WHERE notificado_whatsapp = FALSE;
        CREATE INDEX IF NOT EXISTS idx_auditoria_tipo ON auditoria_eventos (tipo_evento);
    `);
    console.log('✅ Tabla auditoria_eventos lista');
}

async function obtenerTransaccionCompleta(id) {
    const result = await pool.query(`
        SELECT
            t.id, t.monto, t.descripcion, t.tipo_id, t.banco_id,
            t.fecha_hora, tp.nombre AS tipo_nombre,
            u.nombre AS usuario, b.nombre AS banco_nombre
        FROM transacciones t
        JOIN tipos_transaccion tp ON t.tipo_id = tp.id
        JOIN usuarios u ON t.usuario_id = u.id
        LEFT JOIN bancos b ON t.banco_id = b.id
        WHERE t.id = $1
    `, [id]);
    return result.rows[0] || null;
}

async function registrarEvento({
    tipo_evento,
    nivel = NIVEL.INFO,
    usuario = null,
    descripcion = null,
    monto = null,
    transaccion_id = null,
    banco_id = null,
    banco_nombre = null,
    datos_antes = null,
    datos_despues = null,
    ip = null
}) {
    try {
        const result = await pool.query(`
            INSERT INTO auditoria_eventos (
                tipo_evento, nivel, usuario, descripcion, monto,
                transaccion_id, banco_id, banco_nombre,
                datos_antes, datos_despues, ip
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING id
        `, [
            tipo_evento,
            nivel,
            usuario,
            descripcion,
            monto,
            transaccion_id,
            banco_id,
            banco_nombre,
            datos_antes ? JSON.stringify(datos_antes) : null,
            datos_despues ? JSON.stringify(datos_despues) : null,
            ip
        ]);

        const eventoId = result.rows[0].id;

        try {
            await pool.query(`SELECT pg_notify('auditoria_nueva', $1)`, [String(eventoId)]);
        } catch (_) {
            // pg_notify es opcional
        }

        return eventoId;
    } catch (error) {
        console.error('Error registrando auditoría:', error.message);
        return null;
    }
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
}

function esHorarioNocturno() {
    const hora = new Date().getHours();
    return hora >= 22 || hora < 6;
}

const UMBRAL_MONTO_ALTO = 500000;
const UMBRAL_AJUSTE_CRITICO = 100000;
const UMBRAL_DIFERENCIA_CIERRE = 50000;

async function auditarNuevaTransaccion(req, { tipo_id, banco_id, descripcion, monto, usuario_nombre }, transaccionId) {
    const ip = getClientIp(req);
    const tipoId = parseInt(tipo_id);
    const montoNum = parseFloat(monto);

    let bancoNombre = null;
    if (banco_id) {
        const b = await pool.query('SELECT nombre FROM bancos WHERE id = $1', [banco_id]);
        bancoNombre = b.rows[0]?.nombre || null;
    }

    let tipoNombre = null;
    const t = await pool.query('SELECT nombre FROM tipos_transaccion WHERE id = $1', [tipo_id]);
    tipoNombre = t.rows[0]?.nombre || null;

    if (tipoId === 10) {
        await registrarEvento({
            tipo_evento: TIPO.AJUSTE_BASE,
            nivel: Math.abs(montoNum) >= UMBRAL_AJUSTE_CRITICO ? NIVEL.CRITICO : NIVEL.ALERTA,
            usuario: usuario_nombre,
            descripcion: descripcion || `Ajuste de base: ${montoNum}`,
            monto: montoNum,
            transaccion_id: transaccionId,
            banco_id,
            banco_nombre: bancoNombre,
            datos_despues: { tipo_id: tipoId, tipo_nombre: tipoNombre, descripcion },
            ip
        });
        return;
    }

    if (tipoId === 11 || (descripcion && descripcion.includes('Ajuste Cupo'))) {
        await registrarEvento({
            tipo_evento: TIPO.AJUSTE_CUPO,
            nivel: Math.abs(montoNum) >= UMBRAL_AJUSTE_CRITICO ? NIVEL.CRITICO : NIVEL.ALERTA,
            usuario: usuario_nombre,
            descripcion: descripcion || `Ajuste de cupo: ${montoNum}`,
            monto: montoNum,
            transaccion_id: transaccionId,
            banco_id,
            banco_nombre: bancoNombre,
            datos_despues: { tipo_id: tipoId, tipo_nombre: tipoNombre, descripcion },
            ip
        });
        return;
    }

    await registrarEvento({
        tipo_evento: TIPO.TRANSACCION_CREADA,
        nivel: NIVEL.INFO,
        usuario: usuario_nombre,
        descripcion: `${tipoNombre || 'Transacción'}: ${descripcion || 'Sin descripción'}`,
        monto: montoNum,
        transaccion_id: transaccionId,
        banco_id,
        banco_nombre: bancoNombre,
        datos_despues: { tipo_id: tipoId, tipo_nombre: tipoNombre, descripcion },
        ip
    });

    if (Math.abs(montoNum) >= UMBRAL_MONTO_ALTO) {
        await registrarEvento({
            tipo_evento: TIPO.MONTO_ALTO,
            nivel: NIVEL.ALERTA,
            usuario: usuario_nombre,
            descripcion: `Monto alto: $${montoNum.toLocaleString('es-CO')} - ${tipoNombre}`,
            monto: montoNum,
            transaccion_id: transaccionId,
            banco_id,
            banco_nombre: bancoNombre,
            ip
        });
    }

    if (esHorarioNocturno()) {
        await registrarEvento({
            tipo_evento: TIPO.ACTIVIDAD_NOCTURNA,
            nivel: NIVEL.ALERTA,
            usuario: usuario_nombre,
            descripcion: `Transacción en horario nocturno: ${tipoNombre} $${montoNum.toLocaleString('es-CO')}`,
            monto: montoNum,
            transaccion_id: transaccionId,
            ip
        });
    }
}

module.exports = {
    NIVEL,
    TIPO,
    UMBRAL_DIFERENCIA_CIERRE,
    initAuditoria,
    registrarEvento,
    obtenerTransaccionCompleta,
    auditarNuevaTransaccion,
    getClientIp
};
