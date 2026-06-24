const config = require('./config');

const EMOJI_NIVEL = {
    info: 'ℹ️',
    alerta: '⚠️',
    critico: '🚨'
};

const EMOJI_TIPO = {
    ajuste_base: '💵',
    ajuste_cupo: '🏦',
    transaccion_eliminada: '🗑️',
    transaccion_editada: '✏️',
    cierre_caja: '🔒',
    apertura_caja: '🔓',
    reapertura_caja: '⚠️',
    reset_db: '💀',
    login_fallido: '🔐',
    monto_alto: '💰',
    actividad_nocturna: '🌙',
    patron_sospechoso: '👁️',
    usuario_creado: '👤',
    usuario_eliminado: '❌',
    clave_cambiada: '🔑',
    cajon_abierto: '📥'
};

function formatoPesos(valor) {
    if (valor === null || valor === undefined) return '—';
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    }).format(valor);
}

function formatoFecha(fecha) {
    return new Date(fecha).toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatearEvento(evento) {
    const emoji = EMOJI_TIPO[evento.tipo_evento] || EMOJI_NIVEL[evento.nivel] || '📋';
    const titulo = evento.tipo_evento.replace(/_/g, ' ').toUpperCase();

    let msg = `${emoji} *${titulo}*\n`;
    msg += `🕐 ${formatoFecha(evento.fecha_hora)}\n`;

    if (evento.usuario) msg += `👤 Usuario: *${evento.usuario}*\n`;
    if (evento.banco_nombre) msg += `🏦 Banco: ${evento.banco_nombre}\n`;
    if (evento.monto !== null) msg += `💲 Monto: *${formatoPesos(evento.monto)}*\n`;
    if (evento.descripcion) msg += `📝 ${evento.descripcion}\n`;
    if (evento.transaccion_id) msg += `🔢 ID transacción: ${evento.transaccion_id}\n`;

    return msg;
}

function debeEnviarEvento(evento) {
    if (evento.nivel === 'alerta' || evento.nivel === 'critico') return true;
    if (config.enviarEventosInfo) return true;

    const siempreEnviar = [
        'ajuste_base', 'ajuste_cupo', 'transaccion_eliminada',
        'transaccion_editada', 'reapertura_caja', 'reset_db'
    ];
    return siempreEnviar.includes(evento.tipo_evento);
}

function normalizarNumero(from) {
    return from.replace('@c.us', '').replace('@s.whatsapp.net', '');
}

function esNumeroAutorizado(from) {
    const numero = normalizarNumero(from);
    return config.numerosAutorizados.some((autorizado) =>
        numero === autorizado ||
        numero.endsWith(autorizado) ||
        autorizado.endsWith(numero)
    );
}

module.exports = {
    formatoPesos,
    formatoFecha,
    formatearEvento,
    debeEnviarEvento,
    esNumeroAutorizado,
    normalizarNumero
};
