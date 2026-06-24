# Bot de WhatsApp - Corresponsal

Sistema de alertas y comandos por WhatsApp para detectar actividad sospechosa en la app del corresponsal.

## Requisitos

- Node.js instalado
- PostgreSQL corriendo (misma BD del corresponsal)
- WhatsApp en el celular para escanear el QR la primera vez

## Configuración

1. Edita `bot/config.js` y pon tu número en formato internacional **sin el +**:

```js
numerosAutorizados: [
    '573001234567'  // Ejemplo Colombia
]
```

2. Verifica que `src/db.js` tenga los datos correctos de PostgreSQL.

## Cómo iniciar

Abre **dos terminales**:

```bash
# Terminal 1 - App del corresponsal
node src/app.js

# Terminal 2 - Bot de WhatsApp
npm run bot
```

La primera vez que corras el bot, aparecerá un **código QR** en la terminal. Escanéalo desde WhatsApp → Dispositivos vinculados → Vincular dispositivo.

La sesión se guarda en `.wwebjs_auth/` (no subir a Git).

## Alertas automáticas

El bot envía mensajes cuando ocurre:

| Evento | Nivel |
|--------|-------|
| Ajuste de base | Alerta/Crítico |
| Ajuste de cupo | Alerta/Crítico |
| Transacción eliminada | Crítico |
| Transacción editada | Alerta |
| Cierre con diferencia alta | Crítico |
| Reapertura de caja | Crítico |
| Reset de BD | Crítico |
| Monto alto (>$500.000) | Alerta |
| Actividad nocturna (10pm-6am) | Alerta |
| Login fallido repetido | Patrón sospechoso |
| Varias eliminaciones en poco tiempo | Patrón sospechoso |

## Comandos por WhatsApp

Escribe al número del bot desde un número autorizado:

- `resumen` — Totales del día
- `base` — Base actual en caja
- `cupo` — Saldo por banco
- `caja` — Estado de caja
- `ultimas` — Últimas 10 transacciones
- `ultimas juan` — Movimientos de un cajero
- `alertas` — Alertas del día
- `ajustes` — Ajustes de base/cupo hoy
- `eliminadas` — Borrados del día
- `ayuda` — Lista de comandos

## Estructura de archivos

```
src/
  app.js           ← App corresponsal (con hooks de auditoría)
  auditoria.js     ← Registro de eventos en BD
  bot-whatsapp.js  ← Entrada del bot
bot/
  config.js        ← Tu número y umbrales
  alertas.js       ← Envío de alertas
  comandos.js      ← Respuestas a comandos
  patrones.js      ← Detección de patrones sospechosos
  formatear.js     ← Formato de mensajes
sql/
  auditoria.sql    ← Script SQL de la tabla
.wwebjs_auth/      ← Sesión WhatsApp (generada automáticamente)
```

## Solución de problemas

**El bot no envía alertas**
- Verifica que `npm run bot` esté corriendo
- Verifica tu número en `bot/config.js`
- Revisa que `node src/app.js` también esté activo

**Pide QR cada vez**
- No borres la carpeta `.wwebjs_auth`
- Asegúrate de correr el bot desde la misma carpeta del proyecto

**Sesión desconectada**
- Reinicia: `npm run bot`
- Si persiste, borra `.wwebjs_auth` y escanea QR de nuevo
