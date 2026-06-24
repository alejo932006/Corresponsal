/**
 * Configuración del bot de WhatsApp - Corresponsal
 * Edita numerosAutorizados con tu número en formato internacional sin +
 * Ejemplo Colombia: 573001234567
 */
module.exports = {
    // Números que pueden recibir alertas y enviar comandos
    numerosAutorizados: [
        '573001234567'  // <-- CAMBIA ESTO por tu número real
    ],

    // Carpeta de sesión de whatsapp-web.js (NO subir a Git)
    dataPath: '.wwebjs_auth',

    // Cada cuántos ms revisa eventos nuevos en auditoría
    pollIntervalMs: 4000,

    // Si false, solo envía alertas de nivel 'alerta' y 'critico'
    enviarEventosInfo: false,

    // Umbrales para patrones sospechosos
    patrones: {
        eliminacionesEnMinutos: 30,
        eliminacionesUmbral: 3,
        ajustesPorDiaUmbral: 2
    }
};
