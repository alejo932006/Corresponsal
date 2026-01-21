const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('./db'); // Importamos la conexión
const app = express();

// Middleware
app.use(express.json()); // Para entender los datos JSON que envía el formulario
app.use(express.static(path.join(__dirname, '../public'))); // Para mostrar tu HTML/CSS

// --- RUTA DE LOGIN (MODO DEBUG) ---
app.post('/api/login', async (req, res) => {
    const { usuario, password } = req.body;
    
    // 1. Ver qué datos llegaron del formulario
    console.log('--- INTENTO DE LOGIN ---');
    console.log(`Usuario recibido: "${usuario}"`);
    console.log(`Password recibido: "${password}"`);

    try {
        const resultado = await pool.query('SELECT * FROM usuarios WHERE nombre = $1', [usuario]);
        
        // 2. Ver si la base de datos encontró algo
        if (resultado.rows.length === 0) {
            console.log('❌ Error: Usuario no encontrado en la Base de Datos.');
            return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
        }

        const usuarioEncontrado = resultado.rows[0];
        console.log('✅ Usuario encontrado en BD:', usuarioEncontrado.nombre);
        console.log('🔑 Hash en BD:', usuarioEncontrado.password_hash);

        // 3. Comparar contraseñas
        const passwordCorrecta = await bcrypt.compare(password, usuarioEncontrado.password_hash);
        console.log(`¿La contraseña coincide?: ${passwordCorrecta ? 'SI' : 'NO'}`);

        if (passwordCorrecta) {
            res.json({ success: true, message: 'Bienvenido', usuario: usuarioEncontrado.nombre });
        } else {
            console.log('❌ Error: La contraseña no coincide con el hash.');
            res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
        }

    } catch (error) {
        console.error('💥 Error grave del servidor:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// --- RUTA PARA OBTENER EL RESUMEN DEL DASHBOARD ---
app.get('/api/resumen', async (req, res) => {
    try {
        // 1. Calcular Saldos Totales
        // Sumamos (monto * factor) para ver el impacto real
        const querySaldos = `
            SELECT 
                SUM(t.monto * tp.afecta_caja) as saldo_caja,
                SUM(t.monto * tp.afecta_banco) as saldo_banco,
                SUM(CASE WHEN tp.genera_deuda = TRUE THEN t.monto ELSE 0 END) as deuda_empresa
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id;
        `;
        
        const saldos = await pool.query(querySaldos);

        // 2. Obtener los últimos 5 movimientos para la tabla
        const queryMovimientos = `
            SELECT 
                to_char(t.fecha_hora, 'HH12:MI AM') as hora,
                tp.nombre as tipo,
                t.descripcion,
                t.monto
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            ORDER BY t.id DESC
            LIMIT 5;
        `;

        const movimientos = await pool.query(queryMovimientos);

        // Enviamos todo al frontend
        res.json({
            success: true,
            totales: saldos.rows[0],
            movimientos: movimientos.rows
        });

    } catch (error) {
        console.error('Error calculando resumen:', error);
        res.status(500).json({ success: false, message: 'Error al calcular datos' });
    }
});

// --- RUTA PARA OBTENER DATOS DEL FORMULARIO (BANCOS Y TIPOS) ---
app.get('/api/config-formulario', async (req, res) => {
    try {
        const bancos = await pool.query('SELECT * FROM bancos ORDER BY nombre');
        const tipos = await pool.query('SELECT * FROM tipos_transaccion ORDER BY id');
        
        res.json({ success: true, bancos: bancos.rows, tipos: tipos.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});

// --- RUTA PARA GUARDAR LA NUEVA TRANSACCIÓN ---
app.post('/api/transacciones', async (req, res) => {
    const { tipo_id, banco_id, descripcion, monto, usuario_nombre } = req.body;

    try {
        // 1. Necesitamos el ID del usuario, no su nombre. Lo buscamos.
        // (En un sistema real usaríamos el ID de la sesión, pero por ahora lo buscamos así)
        const usuarioRes = await pool.query('SELECT id FROM usuarios WHERE nombre = $1', [usuario_nombre]);
        
        if (usuarioRes.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Usuario no válido' });
        }
        const usuarioId = usuarioRes.rows[0].id;

        // 2. Insertamos la transacción
        const query = `
            INSERT INTO transacciones (tipo_id, banco_id, usuario_id, descripcion, monto)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `;
        
        await pool.query(query, [tipo_id, banco_id, usuarioId, descripcion, monto]);

        res.json({ success: true, message: 'Transacción guardada con éxito' });

    } catch (error) {
        console.error('Error guardando:', error);
        res.status(500).json({ success: false, message: 'Error en base de datos' });
    }
});

// src/app.js

app.get('/api/mis-movimientos', async (req, res) => {
    const { usuario } = req.query; 
    try {
        // 1. Buscamos a qué hora empezó el turno ACTUAL (o el último que cerró)
        const queryTurno = `
            SELECT hora_apertura FROM aperturas_caja ac
            JOIN usuarios u ON ac.usuario_id = u.id
            WHERE u.nombre = $1 AND ac.fecha = CURRENT_DATE
            ORDER BY ac.id DESC LIMIT 1
        `;
        const resTurno = await pool.query(queryTurno, [usuario]);
        
        // Si no ha abierto nunca hoy, lista vacía
        if (resTurno.rows.length === 0) {
            return res.json({ success: true, movimientos: [] });
        }

        const horaInicioTurno = resTurno.rows[0].hora_apertura;

        // 2. Traemos solo las transacciones hechas DESPUÉS de esa hora
        const query = `
            SELECT 
                t.id,
                to_char(t.fecha_hora, 'HH12:MI AM') as hora,
                tp.nombre as tipo,
                t.monto,
                t.descripcion
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE u.nombre = $1 
              AND t.fecha_hora >= $2  -- <--- ESTO LIMPIA LA LISTA EN EL NUEVO TURNO
            ORDER BY t.id DESC
        `;
        
        const resultado = await pool.query(query, [usuario, horaInicioTurno]);
        res.json({ success: true, movimientos: resultado.rows });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});

// src/app.js

app.post('/api/apertura-caja', async (req, res) => {
    const { usuario_nombre, monto } = req.body;
    try {
        const userRes = await pool.query('SELECT id FROM usuarios WHERE nombre = $1', [usuario_nombre]);
        const userId = userRes.rows[0].id;

        // 1. Verificamos si YA hay una caja ABIERTA (para no dejar abrir dos a la vez)
        const checkAbierta = await pool.query(`
            SELECT id FROM aperturas_caja 
            WHERE usuario_id = $1 AND estado = 'ABIERTA'
        `, [userId]);

        if (checkAbierta.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Ya tienes una caja abierta. Ciérrala primero.' });
        }

        // 2. Insertamos el NUEVO turno (Sin ON CONFLICT)
        const query = `
            INSERT INTO aperturas_caja (usuario_id, fecha, monto_inicial, estado)
            VALUES ($1, CURRENT_DATE, $2, 'ABIERTA');
        `;
        await pool.query(query, [userId, monto]);
        res.json({ success: true });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al abrir caja' });
    }
});

// --- RUTA: OBTENER BASE ACTUAL EN TIEMPO REAL ---
app.get('/api/base-caja', async (req, res) => {
    const { usuario } = req.query;
    try {
        // 1. Modificamos la consulta para pedir también el ESTADO
        const queryInicial = `
            SELECT monto_inicial, estado FROM aperturas_caja ac
            JOIN usuarios u ON ac.usuario_id = u.id
            WHERE u.nombre = $1 AND ac.fecha = CURRENT_DATE
            ORDER BY ac.id DESC LIMIT 1
        `;
        const resInicial = await pool.query(queryInicial, [usuario]);
        
        const baseInicial = resInicial.rows.length > 0 ? parseFloat(resInicial.rows[0].monto_inicial) : 0;
        
        // --- AQUÍ ESTABA EL DETALLE ---
        // Antes: const cajaAbierta = resInicial.rows.length > 0;
        // Ahora: Verificamos que exista Y que el estado sea explícitamente 'ABIERTA'
        const cajaAbierta = resInicial.rows.length > 0 && resInicial.rows[0].estado === 'ABIERTA';

        // 2. Sumar movimientos (El resto del código sigue igual)
        const queryMovimientos = `
            SELECT SUM(t.monto * tp.afecta_caja) as total_movimientos
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE u.nombre = $1 AND DATE(t.fecha_hora) = CURRENT_DATE
        `;
        const resMov = await pool.query(queryMovimientos, [usuario]);
        const movimientos = parseFloat(resMov.rows[0].total_movimientos) || 0;

        const totalEnCaja = baseInicial + movimientos;

        res.json({ success: true, base: totalEnCaja, baseInicial, cajaAbierta });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});

// --- RUTA: REABRIR CAJA (Para corregir cierres accidentales) ---
// src/app.js

app.post('/api/reabrir-caja', async (req, res) => {
    const { usuario_nombre } = req.body;
    try {
        // Buscamos el ID de la ÚLTIMA caja cerrada de hoy
        const lastBoxQuery = `
            SELECT ac.id FROM aperturas_caja ac
            JOIN usuarios u ON ac.usuario_id = u.id
            WHERE u.nombre = $1 AND ac.fecha = CURRENT_DATE
            ORDER BY ac.id DESC LIMIT 1
        `;
        const lastBoxRes = await pool.query(lastBoxQuery, [usuario_nombre]);

        if (lastBoxRes.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'No hay cajas para reabrir' });
        }

        const boxId = lastBoxRes.rows[0].id;

        // Reabrimos SOLO esa caja específica
        const query = `
            UPDATE aperturas_caja 
            SET estado = 'ABIERTA', fecha_cierre = NULL, monto_final_sistema = NULL, 
                monto_final_real = NULL, diferencia = NULL
            WHERE id = $1
        `;
        
        await pool.query(query, [boxId]);
        res.json({ success: true, message: 'Caja reabierta correctamente' });

    } catch (error) {
        console.error('Error reabriendo:', error);
        res.status(500).json({ success: false, message: 'No se pudo reabrir' });
    }
});

// --- RUTA: OBTENER ESTADO DE CAJA HOY ---
app.get('/api/estado-caja', async (req, res) => {
    const { usuario } = req.query;
    try {
        // Agregamos ORDER BY id DESC para obtener siempre el último estado
        const query = `
            SELECT ac.* FROM aperturas_caja ac
            JOIN usuarios u ON ac.usuario_id = u.id
            WHERE u.nombre = $1 AND ac.fecha = CURRENT_DATE
            ORDER BY ac.id DESC LIMIT 1 
        `;
        const resultado = await pool.query(query, [usuario]);

        if (resultado.rows.length === 0) {
            return res.json({ estado: 'SIN_APERTURA' });
        }

        const datos = resultado.rows[0];
        
        // Calcular saldo del turno actual
        if (datos.estado === 'ABIERTA') {
             const queryMovs = `
                SELECT SUM(t.monto * tp.afecta_caja) as total
                FROM transacciones t
                JOIN tipos_transaccion tp ON t.tipo_id = tp.id
                JOIN usuarios u ON t.usuario_id = u.id
                WHERE u.nombre = $1 
                  AND t.fecha_hora >= $2 -- Solo sumar movimientos de ESTE turno
            `;
            const resMovs = await pool.query(queryMovs, [usuario, datos.hora_apertura]);
            const movimientos = parseFloat(resMovs.rows[0].total) || 0;
            datos.saldo_actual_calculado = parseFloat(datos.monto_inicial) + movimientos;
        }

        res.json({ estado: datos.estado, datos: datos });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// --- RUTA: REALIZAR CIERRE DE CAJA ---
app.post('/api/cerrar-caja', async (req, res) => {
    const { usuario_nombre, monto_fisico } = req.body; // monto_fisico es lo que contó el cajero
    
    try {
        // 1. Calcular primero cuánto DEBERÍA haber (Saldo Sistema)
        // Reusamos la lógica de saldo actual
        const querySaldo = `
            SELECT 
                ac.monto_inicial,
                (SELECT COALESCE(SUM(t.monto * tp.afecta_caja), 0)
                 FROM transacciones t
                 JOIN tipos_transaccion tp ON t.tipo_id = tp.id
                 JOIN usuarios u2 ON t.usuario_id = u2.id
                 WHERE u2.nombre = $1 AND DATE(t.fecha_hora) = CURRENT_DATE
                ) as movimientos
            FROM aperturas_caja ac
            JOIN usuarios u ON ac.usuario_id = u.id
            WHERE u.nombre = $1 AND ac.fecha = CURRENT_DATE AND ac.estado = 'ABIERTA'
            ORDER BY ac.id DESC LIMIT 1
        `;
        
        const resSaldo = await pool.query(querySaldo, [usuario_nombre]);
        
        if (resSaldo.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'No hay caja abierta para cerrar.' });
        }

        const inicial = parseFloat(resSaldo.rows[0].monto_inicial);
        const movs = parseFloat(resSaldo.rows[0].movimientos);
        const saldoSistema = inicial + movs;
        
        const diferencia = parseFloat(monto_fisico) - saldoSistema;

        // 2. Actualizar la tabla cerrando la caja
        const queryUpdate = `
            UPDATE aperturas_caja 
            SET fecha_cierre = CURRENT_TIMESTAMP,
                monto_final_sistema = $1,
                monto_final_real = $2,
                diferencia = $3,
                estado = 'CERRADA'
            FROM usuarios u
            WHERE aperturas_caja.usuario_id = u.id 
              AND u.nombre = $4 
              AND aperturas_caja.fecha = CURRENT_DATE
        `;

        await pool.query(queryUpdate, [saldoSistema, monto_fisico, diferencia, usuario_nombre]);

        res.json({ success: true, saldoSistema, diferencia });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al cerrar' });
    }
});

// --- RUTA PARA GUARDAR LA NUEVA TRANSACCIÓN ---
app.post('/api/transacciones', async (req, res) => {
    const { tipo_id, banco_id, descripcion, monto, usuario_nombre } = req.body;

    try {
        // 1. Obtener ID del usuario
        const usuarioRes = await pool.query('SELECT id FROM usuarios WHERE nombre = $1', [usuario_nombre]);
        
        if (usuarioRes.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Usuario no válido' });
        }
        const usuarioId = usuarioRes.rows[0].id;

        // =========================================================================
        // 🛑 GUARDIA DE SEGURIDAD (NUEVO BLOQUE)
        // Verificamos si este usuario tiene una caja ABIERTA hoy.
        // =========================================================================
        const cajaCheck = await pool.query(`
            SELECT id FROM aperturas_caja 
            WHERE usuario_id = $1 
              AND fecha = CURRENT_DATE 
              AND estado = 'ABIERTA'
        `, [usuarioId]);

        if (cajaCheck.rows.length === 0) {
            // Si no hay caja abierta, RECHAZAMOS la operación inmediatamente.
            return res.json({ 
                success: false, 
                message: 'CAJA CERRADA: No puedes realizar operaciones sin abrir caja primero.' 
            });
        }
        // =========================================================================

        // 2. Si pasó el guardia, Insertamos la transacción (Tu código normal)
        const query = `
            INSERT INTO transacciones (tipo_id, banco_id, usuario_id, descripcion, monto)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `;
        
        await pool.query(query, [tipo_id, banco_id, usuarioId, descripcion, monto]);

        res.json({ success: true, message: 'Transacción guardada con éxito' });

    } catch (error) {
        console.error('Error guardando:', error);
        res.status(500).json({ success: false, message: 'Error en base de datos' });
    }
});

// --- RUTA: OBTENER DATOS PARA EL REPORTE DE CIERRE ---
app.get('/api/reporte-cierre', async (req, res) => {
    const { usuario } = req.query;
    try {
        // 1. Obtener Totales Agrupados por Tipo de Transacción
        const queryAgrupado = `
            SELECT tp.nombre as concepto, SUM(t.monto) as total_valor, COUNT(*) as cantidad
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE u.nombre = $1 AND DATE(t.fecha_hora) = CURRENT_DATE
            GROUP BY tp.nombre
            ORDER BY total_valor DESC
        `;
        const resAgrupado = await pool.query(queryAgrupado, [usuario]);

        // 2. Obtener Lista Detallada
        const queryDetalle = `
            SELECT 
                to_char(t.fecha_hora, 'HH12:MI AM') as hora,
                tp.nombre as tipo,
                t.descripcion,
                t.monto
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE u.nombre = $1 AND DATE(t.fecha_hora) = CURRENT_DATE
            ORDER BY t.id ASC
        `;
        const resDetalle = await pool.query(queryDetalle, [usuario]);

        res.json({
            success: true,
            resumen: resAgrupado.rows,
            detalle: resDetalle.rows,
            fecha: new Date().toLocaleDateString('es-CO')
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});


// Iniciar servidor
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});