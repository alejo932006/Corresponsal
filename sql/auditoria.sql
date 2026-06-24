-- Tabla de auditoría para el bot de WhatsApp del Corresponsal
-- También se crea automáticamente al iniciar app.js (src/auditoria.js)

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
