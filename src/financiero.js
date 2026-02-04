const express = require('express');
const { Pool, Client } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('./db'); // Reutilizamos tu conexión existente

const app = express();
const PORT = 3001; // Puerto exclusivo para el Sistema Financiero

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public_financiero'))); // Carpeta frontend separada

// --- RUTA: LOGIN PROFESIONAL ---
app.post('/api/auth/login', async (req, res) => {
    const { usuario, password } = req.body;

    try {
        // 1. Buscar usuario activo
        const query = 'SELECT * FROM financiero_usuarios WHERE usuario = $1 AND estado = true';
        const result = await pool.query(query, [usuario]);

        if (result.rows.length === 0) {
            // Retardo artificial de 500ms para evitar ataques de fuerza bruta (Timing Attacks)
            await new Promise(resolve => setTimeout(resolve, 500));
            return res.status(401).json({ success: false, message: 'Credenciales inválidas o usuario inactivo.' });
        }

        const user = result.rows[0];

        // 2. Verificar contraseña con Bcrypt
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            await new Promise(resolve => setTimeout(resolve, 500));
            return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
        }

        // 3. Actualizar "ultimo_login"
        await pool.query('UPDATE financiero_usuarios SET ultimo_login = NOW() WHERE id = $1', [user.id]);

        // 4. Responder con datos seguros (sin devolver el password)
        res.json({
            success: true,
            message: 'Bienvenido al Sistema Financiero',
            user: {
                id: user.id,
                nombre: user.nombre_completo,
                usuario: user.usuario,
                rol: user.rol
            }
        });

    } catch (error) {
        console.error('Error en Login:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
});

// --- OBTENER HISTORIAL CAJA DIARIO (CON FILTRO Y PAGINACIÓN) ---
app.get('/api/financiero/caja-diario', async (req, res) => {
    const busqueda = req.query.busqueda || '';
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    try {
        let query = '';
        let params = [];

        if (busqueda) {
            // Buscamos por descripción o categoría (insensible a mayúsculas)
            query = `
                SELECT * FROM financiero_caja_diario 
                WHERE descripcion ILIKE $1 OR categoria ILIKE $1
                ORDER BY fecha DESC, hora DESC, id DESC 
                LIMIT $2 OFFSET $3
            `;
            params = [`%${busqueda}%`, limit, offset];
        } else {
            // Carga normal sin filtros
            query = `
                SELECT * FROM financiero_caja_diario 
                ORDER BY fecha DESC, hora DESC, id DESC 
                LIMIT $1 OFFSET $2
            `;
            params = [limit, offset];
        }

        const result = await pool.query(query, params);
        res.json({ success: true, datos: result.rows });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al cargar historial' });
    }
});


// 2. GUARDAR NUEVO REGISTRO
app.post('/api/financiero/caja-diario', async (req, res) => {
    const { fecha, hora, descripcion, entrada, salida, usuario_id } = req.body;
    
    try {
        const query = `
            INSERT INTO financiero_caja_diario (fecha, hora, descripcion, entrada, salida, usuario_id)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        // Si no envían fecha/hora, Postgres usa las DEFAULT (Hoy y Ahora)
        // Convertimos vacíos a 0 para entrada/salida
        const valEntrada = entrada || 0;
        const valSalida = salida || 0;

        await pool.query(query, [
            fecha || new Date(), 
            hora || new Date().toLocaleTimeString('en-US', { hour12: false }), 
            descripcion, 
            valEntrada, 
            valSalida, 
            usuario_id
        ]);

        res.json({ success: true, message: 'Registrado correctamente' });
    } catch (error) {
        console.error('Error guardando:', error);
        res.status(500).json({ success: false, message: 'Error al guardar registro' });
    }
});

// --- NUEVA RUTA: OBTENER SALDO TOTAL EXACTO ---
app.get('/api/financiero/saldo-total', async (req, res) => {
    try {
        const query = 'SELECT COALESCE(SUM(entrada - salida), 0) as total FROM financiero_caja_diario';
        const result = await pool.query(query);
        res.json({ success: true, total: result.rows[0].total });
    } catch (error) {
        res.status(500).json({ success: false, total: 0 });
    }
});

// --- NUEVA RUTA: AJUSTAR SALDO (Crear movimiento de cuadre) ---
app.post('/api/financiero/ajustar-saldo', async (req, res) => {
    const { nuevo_saldo_real, usuario_id } = req.body;
    
    try {
        // 1. Calcular saldo actual del sistema
        const resSaldo = await pool.query('SELECT COALESCE(SUM(entrada - salida), 0) as total FROM financiero_caja_diario');
        const saldoSistema = parseFloat(resSaldo.rows[0].total);
        const saldoReal = parseFloat(nuevo_saldo_real);
        
        const diferencia = saldoReal - saldoSistema;

        if (diferencia === 0) {
            return res.json({ success: true, message: 'El saldo ya está cuadrado.' });
        }

        // 2. Determinar si es Entrada (Sobra plata) o Salida (Falta plata)
        let entrada = 0;
        let salida = 0;
        let descripcion = '';

        if (diferencia > 0) {
            entrada = diferencia;
            descripcion = 'Ajuste de Saldo (Sobrante / Inicial)';
        } else {
            salida = Math.abs(diferencia);
            descripcion = 'Ajuste de Saldo (Faltante / Corrección)';
        }

        // 3. Insertar el movimiento de ajuste
        const queryInsert = `
            INSERT INTO financiero_caja_diario (fecha, hora, descripcion, entrada, salida, usuario_id)
            VALUES (CURRENT_DATE, CURRENT_TIME, $1, $2, $3, $4)
        `;
        
        await pool.query(queryInsert, [descripcion, entrada, salida, usuario_id]);

        res.json({ success: true, message: 'Saldo ajustado correctamente' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al ajustar saldo' });
    }
});

// ==========================================
// MÓDULO BANCOLOMBIA
// ==========================================

// 1. OBTENER REGISTROS BANCOLOMBIA
// 1. OBTENER REGISTROS BANCOLOMBIA (CON PAGINACIÓN)
app.get('/api/financiero/bancolombia', async (req, res) => {
    // Recibimos los parámetros, si no llegan, usamos valores por defecto
    const limit = parseInt(req.query.limit) || 50; 
    const offset = parseInt(req.query.offset) || 0;

    try {
        const query = `
            SELECT 
                b.id,
                to_char(b.fecha, 'YYYY-MM-DD') as fecha,
                to_char(b.hora, 'HH12:MI AM') as hora,
                u.usuario as usuario_nombre,
                b.descripcion,
                b.entrada,
                b.salida,
                SUM(b.entrada - b.salida) OVER (ORDER BY b.fecha ASC, b.hora ASC, b.id ASC) as saldo
            FROM financiero_bancolombia b
            LEFT JOIN financiero_usuarios u ON b.usuario_id = u.id
            ORDER BY b.fecha DESC, b.hora DESC, b.id DESC
            LIMIT $1 OFFSET $2; -- Usamos variables para paginar
        `;
        // Pasamos limit y offset a la consulta
        const result = await pool.query(query, [limit, offset]);
        res.json({ success: true, datos: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al obtener bancolombia' });
    }
});

// 2. GUARDAR REGISTRO BANCOLOMBIA
app.post('/api/financiero/bancolombia', async (req, res) => {
    const { fecha, hora, descripcion, entrada, salida, usuario_id } = req.body;
    try {
        const query = `
            INSERT INTO financiero_bancolombia (fecha, hora, descripcion, entrada, salida, usuario_id)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await pool.query(query, [
            fecha || new Date(), 
            hora || new Date().toLocaleTimeString('en-US', { hour12: false }), 
            descripcion, 
            entrada || 0, 
            salida || 0, 
            usuario_id
        ]);
        res.json({ success: true, message: 'Transacción Bancolombia guardada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al guardar' });
    }
});

// 3. OBTENER SALDO TOTAL BANCOLOMBIA
app.get('/api/financiero/bancolombia/saldo', async (req, res) => {
    try {
        const query = 'SELECT COALESCE(SUM(entrada - salida), 0) as total FROM financiero_bancolombia';
        const result = await pool.query(query);
        res.json({ success: true, total: result.rows[0].total });
    } catch (error) {
        res.status(500).json({ success: false, total: 0 });
    }
});

// 4. AJUSTAR SALDO BANCOLOMBIA
app.post('/api/financiero/bancolombia/ajustar', async (req, res) => {
    const { nuevo_saldo_real, usuario_id } = req.body;
    try {
        const resSaldo = await pool.query('SELECT COALESCE(SUM(entrada - salida), 0) as total FROM financiero_bancolombia');
        const saldoSistema = parseFloat(resSaldo.rows[0].total);
        const saldoReal = parseFloat(nuevo_saldo_real);
        const diferencia = saldoReal - saldoSistema;

        if (diferencia === 0) return res.json({ success: true, message: 'Saldo ya está cuadrado.' });

        let entrada = 0, salida = 0, descripcion = '';
        if (diferencia > 0) {
            entrada = diferencia;
            descripcion = 'Ajuste Bancolombia (Sobrante/Inicial)';
        } else {
            salida = Math.abs(diferencia);
            descripcion = 'Ajuste Bancolombia (Faltante/Corrección)';
        }

        await pool.query(
            `INSERT INTO financiero_bancolombia (fecha, hora, descripcion, entrada, salida, usuario_id)
             VALUES (CURRENT_DATE, CURRENT_TIME, $1, $2, $3, $4)`,
            [descripcion, entrada, salida, usuario_id]
        );

        res.json({ success: true, message: 'Saldo Bancolombia ajustado' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al ajustar' });
    }
});

// ==========================================
// MÓDULO DAVIVIENDA
// ==========================================

// 1. OBTENER REGISTROS DAVIVIENDA
app.get('/api/financiero/davivienda', async (req, res) => {
    try {
        const query = `
            SELECT 
                d.id,
                to_char(d.fecha, 'YYYY-MM-DD') as fecha,
                to_char(d.hora, 'HH12:MI AM') as hora,
                u.usuario as usuario_nombre,
                d.descripcion,
                d.entrada,
                d.salida,
                SUM(d.entrada - d.salida) OVER (ORDER BY d.fecha ASC, d.hora ASC, d.id ASC) as saldo
            FROM financiero_davivienda d
            LEFT JOIN financiero_usuarios u ON d.usuario_id = u.id
            ORDER BY d.fecha DESC, d.hora DESC, d.id DESC
            LIMIT 100;
        `;
        const result = await pool.query(query);
        res.json({ success: true, datos: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al obtener Davivienda' });
    }
});

// 2. GUARDAR REGISTRO DAVIVIENDA
app.post('/api/financiero/davivienda', async (req, res) => {
    const { fecha, hora, descripcion, entrada, salida, usuario_id } = req.body;
    try {
        const query = `
            INSERT INTO financiero_davivienda (fecha, hora, descripcion, entrada, salida, usuario_id)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await pool.query(query, [
            fecha || new Date(), 
            hora || new Date().toLocaleTimeString('en-US', { hour12: false }), 
            descripcion, 
            entrada || 0, 
            salida || 0, 
            usuario_id
        ]);
        res.json({ success: true, message: 'Transacción Davivienda guardada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al guardar' });
    }
});

// 3. OBTENER SALDO TOTAL DAVIVIENDA
app.get('/api/financiero/davivienda/saldo', async (req, res) => {
    try {
        const query = 'SELECT COALESCE(SUM(entrada - salida), 0) as total FROM financiero_davivienda';
        const result = await pool.query(query);
        res.json({ success: true, total: result.rows[0].total });
    } catch (error) {
        res.status(500).json({ success: false, total: 0 });
    }
});

// 4. AJUSTAR SALDO DAVIVIENDA
app.post('/api/financiero/davivienda/ajustar', async (req, res) => {
    const { nuevo_saldo_real, usuario_id } = req.body;
    try {
        const resSaldo = await pool.query('SELECT COALESCE(SUM(entrada - salida), 0) as total FROM financiero_davivienda');
        const saldoSistema = parseFloat(resSaldo.rows[0].total);
        const saldoReal = parseFloat(nuevo_saldo_real);
        const diferencia = saldoReal - saldoSistema;

        if (diferencia === 0) return res.json({ success: true, message: 'Saldo ya está cuadrado.' });

        let entrada = 0, salida = 0, descripcion = '';
        if (diferencia > 0) {
            entrada = diferencia;
            descripcion = 'Ajuste Davivienda (Sobrante/Inicial)';
        } else {
            salida = Math.abs(diferencia);
            descripcion = 'Ajuste Davivienda (Faltante/Corrección)';
        }

        await pool.query(
            `INSERT INTO financiero_davivienda (fecha, hora, descripcion, entrada, salida, usuario_id)
             VALUES (CURRENT_DATE, CURRENT_TIME, $1, $2, $3, $4)`,
            [descripcion, entrada, salida, usuario_id]
        );

        res.json({ success: true, message: 'Saldo Davivienda ajustado' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al ajustar' });
    }
});

// ==========================================
// MÓDULO CORRESPONSAL (CIERRES)
// ==========================================

// 1. OBTENER REGISTROS CORRESPONSAL
app.get('/api/financiero/corresponsal', async (req, res) => {
    try {
        const query = `
            SELECT 
                c.id,
                to_char(c.fecha, 'YYYY-MM-DD') as fecha,
                to_char(c.hora, 'HH12:MI AM') as hora,
                u.usuario as usuario_nombre,
                c.descripcion,
                c.deposito,
                c.recaudo,
                c.pago_tc,
                c.pago_cartera,
                c.retiro,
                c.compensacion,
                -- FÓRMULA: (Sumas) - (Restas) ACUMULADO
                SUM(
                    (c.deposito + c.recaudo + c.pago_tc + c.pago_cartera) - 
                    (c.retiro + c.compensacion)
                ) OVER (ORDER BY c.fecha ASC, c.hora ASC, c.id ASC) as saldo
            FROM financiero_corresponsal c
            LEFT JOIN financiero_usuarios u ON c.usuario_id = u.id
            ORDER BY c.fecha DESC, c.hora DESC, c.id DESC
            LIMIT 50;
        `;
        const result = await pool.query(query);
        res.json({ success: true, datos: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al obtener corresponsal' });
    }
});

// 2. GUARDAR CIERRE CORRESPONSAL
app.post('/api/financiero/corresponsal', async (req, res) => {
    const { 
        fecha, hora, descripcion, 
        deposito, recaudo, pago_tc, pago_cartera, 
        retiro, compensacion, 
        usuario_id 
    } = req.body;

    try {
        const query = `
            INSERT INTO financiero_corresponsal 
            (fecha, hora, descripcion, deposito, recaudo, pago_tc, pago_cartera, retiro, compensacion, usuario_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;
        
        await pool.query(query, [
            fecha || new Date(),
            hora || new Date().toLocaleTimeString('en-US', { hour12: false }),
            descripcion || 'Cierre Diario',
            deposito || 0,
            recaudo || 0,
            pago_tc || 0,
            pago_cartera || 0,
            retiro || 0,
            compensacion || 0,
            usuario_id
        ]);

        res.json({ success: true, message: 'Cierre guardado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al guardar cierre' });
    }
});

// 3. OBTENER SALDO TOTAL CORRESPONSAL
app.get('/api/financiero/corresponsal/saldo', async (req, res) => {
    try {
        const query = `
            SELECT COALESCE(SUM(
                (deposito + recaudo + pago_tc + pago_cartera) - (retiro + compensacion)
            ), 0) as total 
            FROM financiero_corresponsal
        `;
        const result = await pool.query(query);
        res.json({ success: true, total: result.rows[0].total });
    } catch (error) {
        res.status(500).json({ success: false, total: 0 });
    }
});

// 4. AJUSTAR SALDO CORRESPONSAL
app.post('/api/financiero/corresponsal/ajustar', async (req, res) => {
    const { nuevo_saldo_real, usuario_id } = req.body;
    try {
        // Calcular saldo actual
        const querySaldo = `
            SELECT COALESCE(SUM(
                (deposito + recaudo + pago_tc + pago_cartera) - (retiro + compensacion)
            ), 0) as total 
            FROM financiero_corresponsal
        `;
        const resSaldo = await pool.query(querySaldo);
        const saldoSistema = parseFloat(resSaldo.rows[0].total);
        const saldoReal = parseFloat(nuevo_saldo_real);
        const diferencia = saldoReal - saldoSistema;

        if (diferencia === 0) return res.json({ success: true, message: 'Saldo ya está cuadrado.' });

        // Para ajustar, usaremos las columnas "Deposito" (para sumar) o "Retiro" (para restar)
        // y pondremos una descripción clara.
        let deposito = 0, retiro = 0, descripcion = '';

        if (diferencia > 0) {
            deposito = diferencia;
            descripcion = 'Ajuste Manual (Sobrante)';
        } else {
            retiro = Math.abs(diferencia);
            descripcion = 'Ajuste Manual (Faltante)';
        }

        await pool.query(
            `INSERT INTO financiero_corresponsal (fecha, hora, descripcion, deposito, retiro, usuario_id)
             VALUES (CURRENT_DATE, CURRENT_TIME, $1, $2, $3, $4)`,
            [descripcion, deposito, retiro, usuario_id]
        );

        res.json({ success: true, message: 'Saldo ajustado correctamente' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al ajustar' });
    }
});

// ==========================================
// RUTAS DE EDICIÓN Y ELIMINADO (PARA TODOS)
// ==========================================

// --- ELIMINAR REGISTRO (Genérico para cualquier tabla) ---
// Se llama así: DELETE /api/financiero/caja-diario/15
// --- ELIMINAR REGISTRO (Genérico Actualizado) ---
app.delete('/api/financiero/:modulo/:id', async (req, res, next) => {
    const { modulo, id } = req.params;
    let tabla = '';

    // Mapeo de tablas
    if (modulo === 'caja-diario') tabla = 'financiero_caja_diario';
    else if (modulo === 'bancolombia') tabla = 'financiero_bancolombia';
    else if (modulo === 'davivienda') tabla = 'financiero_davivienda';
    else if (modulo === 'corresponsal') tabla = 'financiero_corresponsal';
    else if (modulo === 'cuentas-cobrar') tabla = 'financiero_cuentas_cobrar';
    
    // --- NUEVOS MÓDULOS AGREGADOS ---
    else if (modulo === 'compras') tabla = 'financiero_compras'; 
    else if (modulo === 'pnl') tabla = 'financiero_movimientos_pnl'; 
    
    // Si no es ninguno de los anteriores, usamos next() para ver si hay una ruta específica abajo
    else return next(); 

    try {
        await pool.query(`DELETE FROM ${tabla} WHERE id = $1`, [id]);
        res.json({ success: true, message: 'Registro eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al eliminar' });
    }
});

// --- EDITAR CAJA DIARIO, BANCOLOMBIA O DAVIVIENDA ---
app.put('/api/financiero/:modulo/:id', async (req, res) => {
    const { modulo, id } = req.params;
    const { fecha, hora, descripcion, entrada, salida } = req.body;
    let tabla = '';

    if (modulo === 'caja-diario') tabla = 'financiero_caja_diario';
    else if (modulo === 'bancolombia') tabla = 'financiero_bancolombia';
    else if (modulo === 'davivienda') tabla = 'financiero_davivienda';
    else return res.status(400).json({ success: false, message: 'Módulo inválido para esta ruta' });

    try {
        const query = `
            UPDATE ${tabla}
            SET fecha = $1, hora = $2, descripcion = $3, entrada = $4, salida = $5
            WHERE id = $6
        `;
        await pool.query(query, [fecha, hora, descripcion, entrada || 0, salida || 0, id]);
        res.json({ success: true, message: 'Registro actualizado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al actualizar' });
    }
});

// --- EDITAR CORRESPONSAL (Tiene columnas especiales) ---
app.put('/api/financiero/corresponsal/:id', async (req, res) => {
    const { id } = req.params;
    const { 
        fecha, hora, descripcion, 
        deposito, recaudo, pago_tc, pago_cartera, 
        retiro, compensacion 
    } = req.body;

    try {
        const query = `
            UPDATE financiero_corresponsal
            SET fecha=$1, hora=$2, descripcion=$3, 
                deposito=$4, recaudo=$5, pago_tc=$6, pago_cartera=$7,
                retiro=$8, compensacion=$9
            WHERE id = $10
        `;
        await pool.query(query, [
            fecha, hora, descripcion, 
            deposito||0, recaudo||0, pago_tc||0, pago_cartera||0, 
            retiro||0, compensacion||0, 
            id
        ]);
        res.json({ success: true, message: 'Cierre actualizado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al actualizar corresponsal' });
    }
});

// ==========================================
// MÓDULO CUENTAS POR COBRAR (TERCEROS)
// ==========================================

// 1. OBTENER REGISTROS
app.get('/api/financiero/cuentas-cobrar', async (req, res) => {
    try {
        const query = `
            SELECT 
                c.id,
                to_char(c.fecha, 'YYYY-MM-DD') as fecha,
                to_char(c.hora, 'HH24:MI') as hora, -- Formato 24h para facilitar edición
                u.usuario as usuario_nombre,
                c.cliente_nombre,
                c.cliente_documento,
                c.descripcion,
                c.entrada,
                c.salida,
                -- Saldo acumulado global (Liquidez de terceros en tu poder)
                SUM(c.entrada - c.salida) OVER (ORDER BY c.fecha ASC, c.hora ASC, c.id ASC) as saldo
            FROM financiero_cuentas_cobrar c
            LEFT JOIN financiero_usuarios u ON c.usuario_id = u.id
            ORDER BY c.fecha DESC, c.hora DESC, c.id DESC
            LIMIT 100;
        `;
        const result = await pool.query(query);
        res.json({ success: true, datos: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al obtener datos' });
    }
});

// 2. GUARDAR REGISTRO
app.post('/api/financiero/cuentas-cobrar', async (req, res) => {
    const { fecha, hora, cliente_nombre, cliente_documento, descripcion, entrada, salida, usuario_id } = req.body;
    try {
        const query = `
            INSERT INTO financiero_cuentas_cobrar 
            (fecha, hora, cliente_nombre, cliente_documento, descripcion, entrada, salida, usuario_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        await pool.query(query, [
            fecha || new Date(), 
            hora || new Date().toLocaleTimeString('en-US', { hour12: false }), 
            cliente_nombre,
            cliente_documento,
            descripcion, 
            entrada || 0, 
            salida || 0, 
            usuario_id
        ]);
        res.json({ success: true, message: 'Movimiento registrado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al guardar' });
    }
});

// 3. EDITAR REGISTRO
app.put('/api/financiero/cuentas-cobrar/:id', async (req, res) => {
    const { id } = req.params;
    const { fecha, hora, cliente_nombre, cliente_documento, descripcion, entrada, salida } = req.body;
    try {
        const query = `
            UPDATE financiero_cuentas_cobrar
            SET fecha=$1, hora=$2, cliente_nombre=$3, cliente_documento=$4, descripcion=$5, entrada=$6, salida=$7
            WHERE id = $8
        `;
        await pool.query(query, [fecha, hora, cliente_nombre, cliente_documento, descripcion, entrada||0, salida||0, id]);
        res.json({ success: true, message: 'Actualizado correctamente' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al actualizar' });
    }
});

// 4. ELIMINAR REGISTRO
app.delete('/api/financiero/cuentas-cobrar/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM financiero_cuentas_cobrar WHERE id = $1', [id]);
        res.json({ success: true, message: 'Registro eliminado' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al eliminar' });
    }
});

// 5. OBTENER SALDO TOTAL (Dinero que tienes guardado de la gente)
app.get('/api/financiero/cuentas-cobrar/saldo', async (req, res) => {
    try {
        const query = 'SELECT COALESCE(SUM(entrada - salida), 0) as total FROM financiero_cuentas_cobrar';
        const result = await pool.query(query);
        res.json({ success: true, total: result.rows[0].total });
    } catch (error) {
        res.status(500).json({ success: false, total: 0 });
    }
});

// 6. AJUSTAR SALDO
app.post('/api/financiero/cuentas-cobrar/ajustar', async (req, res) => {
    const { nuevo_saldo_real, usuario_id } = req.body;
    try {
        const resSaldo = await pool.query('SELECT COALESCE(SUM(entrada - salida), 0) as total FROM financiero_cuentas_cobrar');
        const saldoSistema = parseFloat(resSaldo.rows[0].total);
        const saldoReal = parseFloat(nuevo_saldo_real);
        const diferencia = saldoReal - saldoSistema;

        if (diferencia === 0) return res.json({ success: true, message: 'Saldo ya está cuadrado.' });

        let entrada = 0, salida = 0, descripcion = '';
        if (diferencia > 0) {
            entrada = diferencia;
            descripcion = 'Ajuste Global (Sobrante)';
        } else {
            salida = Math.abs(diferencia);
            descripcion = 'Ajuste Global (Faltante)';
        }

        await pool.query(
            `INSERT INTO financiero_cuentas_cobrar (fecha, hora, cliente_nombre, cliente_documento, descripcion, entrada, salida, usuario_id)
             VALUES (CURRENT_DATE, CURRENT_TIME, 'SISTEMA', '000', $1, $2, $3, $4)`,
            [descripcion, entrada, salida, usuario_id]
        );

        res.json({ success: true, message: 'Saldo ajustado' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al ajustar' });
    }
});

// --- NUEVO: OBTENER RESUMEN DE CLIENTES (Para el directorio) ---
// --- OBTENER RESUMEN DE CLIENTES (MEJORADO) ---
app.get('/api/financiero/clientes-resumen', async (req, res) => {
    try {
        const query = `
            SELECT 
                cliente_nombre, 
                cliente_documento, 
                SUM(entrada - salida) as saldo
            FROM financiero_cuentas_cobrar
            WHERE cliente_nombre IS NOT NULL AND cliente_nombre <> ''
            GROUP BY cliente_documento, cliente_nombre
            -- ORDENAMIENTO INTELIGENTE:
            -- 1. Primero los que tienen saldo diferente de 0 (ABS(saldo) > 0)
            -- 2. Luego por nombre alfabéticamente
            ORDER BY (CASE WHEN SUM(entrada - salida) <> 0 THEN 0 ELSE 1 END) ASC, cliente_nombre ASC
        `;
        const result = await pool.query(query);
        res.json({ success: true, datos: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al cargar clientes' });
    }
});

// --- NUEVO: HISTORIAL ESPECÍFICO DE UN CLIENTE ---
app.get('/api/financiero/cuentas-cobrar/historial-cliente', async (req, res) => {
    const { doc, nombre } = req.query;
    try {
        const query = `
            SELECT 
                id,
                to_char(fecha, 'YYYY-MM-DD') as fecha,
                to_char(hora, 'HH24:MI') as hora,
                descripcion,
                entrada,
                salida
            FROM financiero_cuentas_cobrar
            WHERE 
                (cliente_documento = $1 AND cliente_documento <> '') 
                OR 
                (cliente_nombre = $2)
            ORDER BY fecha DESC, hora DESC
        `;
        const result = await pool.query(query, [doc || '', nombre]);
        res.json({ success: true, datos: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al obtener historial' });
    }
});

// ==========================================
// MÓDULO RESULTADOS (CIERRE Y ARQUEO)
// ==========================================

// 1. OBTENER SALDOS EN TIEMPO REAL (CORREGIDO)
app.get('/api/financiero/resultados/metricas-actuales', async (req, res) => {
    try {
        // A. Saldo Caja Diario
        const resCaja = await pool.query('SELECT COALESCE(SUM(entrada - salida), 0) as total FROM financiero_caja_diario');
        
        // B. Saldo Corresponsal
        const resCorr = await pool.query(`
            SELECT COALESCE(SUM(
                (deposito + recaudo + pago_tc + pago_cartera) - (retiro + compensacion)
            ), 0) as total FROM financiero_corresponsal
        `);

        // C. CÁLCULO UNIFICADO POR CLIENTE (SINTAXIS SQL CORREGIDA)
        const resTerceros = await pool.query(`
            WITH SaldosPorCliente AS (
                SELECT 
                    cliente_documento, 
                    cliente_nombre,
                    SUM(entrada - salida) as saldo_neto
                FROM financiero_cuentas_cobrar
                WHERE cliente_nombre IS NOT NULL AND cliente_nombre <> ''
                GROUP BY cliente_documento, cliente_nombre
            )
            SELECT 
                -- Corrección: El FILTER va DENTRO del COALESCE
                COALESCE(SUM(ABS(saldo_neto)) FILTER (WHERE saldo_neto < 0), 0) as total_cobrar,
                COALESCE(SUM(saldo_neto) FILTER (WHERE saldo_neto > 0), 0) as total_pagar
            FROM SaldosPorCliente
        `);

        // D. Bancos
        const resBancos = await pool.query(`
            SELECT 
                (SELECT COALESCE(SUM(entrada - salida), 0) FROM financiero_bancolombia) +
                (SELECT COALESCE(SUM(entrada - salida), 0) FROM financiero_davivienda) as total_bancos
        `);

        res.json({
            success: true,
            caja_diario: parseFloat(resCaja.rows[0].total),
            corresponsal: parseFloat(resCorr.rows[0].total),
            
            // Asignamos los valores calculados
            terceros_cobrar: parseFloat(resTerceros.rows[0].total_cobrar || 0), 
            terceros_pagar: parseFloat(resTerceros.rows[0].total_pagar || 0),
            
            total_bancos: parseFloat(resBancos.rows[0].total_bancos)
        });

    } catch (error) {
        console.error('Error calculando métricas:', error);
        res.status(500).json({ success: false, message: 'Error calculando métricas' });
    }
});

// 2. GUARDAR CIERRE/RESULTADO
app.post('/api/financiero/resultados', async (req, res) => {
    const { 
        fecha, hora, usuario_id,
        saldo_caja_diario, saldo_cuentas_por_pagar, saldo_cuentas_por_cobrar, bases_caja,
        resultado_sistema, total_fisico, diferencia, detalles_fisicos, observaciones
    } = req.body;

    try {
        const query = `
            INSERT INTO financiero_resultados 
            (fecha, hora, usuario_id, saldo_caja_diario, saldo_cuentas_por_pagar, saldo_cuentas_por_cobrar, bases_caja, resultado_sistema, total_fisico, diferencia, detalles_fisicos, observaciones)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
        await pool.query(query, [
            fecha, hora, usuario_id,
            saldo_caja_diario || 0, saldo_cuentas_por_pagar || 0, saldo_cuentas_por_cobrar || 0, bases_caja || 0,
            resultado_sistema || 0, total_fisico || 0, diferencia || 0, 
            JSON.stringify(detalles_fisicos || {}), observaciones
        ]);
        
        res.json({ success: true, message: 'Cierre guardado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al guardar cierre' });
    }
});

// 3. OBTENER HISTORIAL DE RESULTADOS
app.get('/api/financiero/resultados', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.*, u.usuario as usuario_nombre 
            FROM financiero_resultados r
            LEFT JOIN financiero_usuarios u ON r.usuario_id = u.id
            ORDER BY r.fecha DESC, r.hora DESC LIMIT 50
        `);
        res.json({ success: true, datos: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al obtener historial' });
    }
});

// ==========================================
// MÓDULO ERP EXTERNO Y SINCRONIZACIÓN
// ==========================================

// 1. CONSULTAR Y COMPARAR (ERP vs LOCAL)
app.get('/api/financiero/erp/deudas-empleados', async (req, res) => {
    const clientERP = new Client({
        host: '192.168.0.100',
        port: 5432,
        user: 'Backup',
        password: 'UYsdfsw2A5Z4',
        database: 'postgres',
        ssl: false
    });

    try {
        // A. Obtener datos del ERP
        await clientERP.connect();
        const queryERP = `
            SELECT 
                TRIM(m.mcnvincula) as nit,
                COALESCE(v.vinnombre, '--- NOMBRE NO ENCONTRADO ---') as nombre,
                SUM(m.mcnsaldodb - m.mcnsaldocr) as total_deuda
            FROM manager.mngmcn m
            LEFT JOIN manager.vinculado v ON TRIM(v.vincedula) = TRIM(m.mcnvincula)
            WHERE m.mcncuenta LIKE '13%' 
            GROUP BY m.mcnvincula, v.vinnombre
            HAVING SUM(m.mcnsaldodb - m.mcnsaldocr) > 1000 
            ORDER BY total_deuda DESC;
        `;
        const resultERP = await clientERP.query(queryERP);
        await clientERP.end();

        // B. Obtener datos LOCALES (Tus saldos actuales)
        const queryLocal = `
            SELECT cliente_documento, SUM(entrada - salida) as saldo_local
            FROM financiero_cuentas_cobrar
            WHERE cliente_documento IS NOT NULL
            GROUP BY cliente_documento
        `;
        const resultLocal = await pool.query(queryLocal);

        // C. Cruzar información (Comparar)
        const listaComparada = resultERP.rows.map(erp => {
            // Buscamos si este NIT existe en lo local
            const local = resultLocal.rows.find(l => l.cliente_documento === erp.nit);
            const saldoLocal = local ? parseFloat(local.saldo_local) : 0;
            const saldoERP = parseFloat(erp.total_deuda);
            
            return {
                nit: erp.nit,
                nombre: erp.nombre,
                saldo_erp: saldoERP,
                saldo_local: saldoLocal,
                diferencia: saldoERP - saldoLocal, // Cuánto falta para igualar
                existe_local: !!local
            };
        });

        res.json({ success: true, datos: listaComparada });

    } catch (error) {
        console.error('Error ERP:', error);
        try { await clientERP.end(); } catch(e) {}
        res.status(500).json({ success: false, message: 'Error consultando ERP' });
    }
});

// 2. SINCRONIZAR (Cargar saldos del ERP a tu sistema)
app.post('/api/financiero/erp/sincronizar', async (req, res) => {
    const { clientes, usuario_id } = req.body; // Recibe lista de clientes a ajustar

    try {
        let contador = 0;

        for (const c of clientes) {
            // Calculamos cuánto falta para llegar al saldo del ERP
            // NOTA: Volvemos a consultar saldo local por seguridad
            const resSaldo = await pool.query(`
                SELECT COALESCE(SUM(entrada - salida), 0) as total 
                FROM financiero_cuentas_cobrar 
                WHERE cliente_documento = $1`, 
                [c.nit]
            );
            const saldoActual = parseFloat(resSaldo.rows[0].total);
            const saldoObjetivo = parseFloat(c.saldo_erp);
            const diferencia = saldoObjetivo - saldoActual;

            if (Math.abs(diferencia) > 0) {
                let entrada = 0, salida = 0;
                
                // Si Diferencia > 0: El ERP tiene más deuda (o saldo a favor, según perspectiva).
                // En este módulo "Cuentas por Cobrar" (Saldo negativo = deuda), la lógica es:
                // Si SaldoObjetivo (ERP) es DEUDA ($ 50.000) y SaldoActual es $0:
                // Debemos restar (Salida) para que quede en deuda? 
                // OJO: En tu script, "total_deuda" es positivo. 
                // En tu sistema local, decidimos que "ROJO/NEGATIVO" es deuda (TE DEBEN).
                // Entonces, si el ERP dice "Deuda 50.000", tu sistema debe quedar en "-50.000".
                
                // AJUSTE DE LÓGICA: 
                // Vamos a asumir que quieres que el valor NUMÉRICO coincida. 
                // Si en ERP dice "50.000" (Deuda), quieres ver "50.000" en tu tarjeta.
                // Como definimos antes:
                // Verde (+) = Tienes dinero de ellos.
                // Rojo (-) = Te deben.
                
                // El script del ERP trae "Deuda". Por tanto, el objetivo es un saldo NEGATIVO.
                const objetivoReal = -Math.abs(saldoObjetivo); 
                const ajuste = objetivoReal - saldoActual;

                if (Math.abs(ajuste) < 1) continue; // Ignorar centavos

                if (ajuste > 0) {
                    entrada = ajuste; // Sumar (Abonar a la deuda)
                } else {
                    salida = Math.abs(ajuste); // Restar (Aumentar la deuda)
                }

                await pool.query(`
                    INSERT INTO financiero_cuentas_cobrar 
                    (fecha, hora, cliente_nombre, cliente_documento, descripcion, entrada, salida, usuario_id)
                    VALUES (CURRENT_DATE, CURRENT_TIME, $1, $2, 'Sincronización Automática ERP', $3, $4, $5)
                `, [c.nombre, c.nit, entrada, salida, usuario_id]);
                
                contador++;
            }
        }

        res.json({ success: true, message: `Sincronización completada. ${contador} clientes actualizados.` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al sincronizar' });
    }
});

// ==========================================
// MÓDULO ERP - PROVEEDORES (COMPRAS)
// ==========================================

app.get('/api/financiero/erp/proveedores', async (req, res) => {
    // Configuración de conexión (Igual que tu script)
    const clientERP = new Client({
        host: '192.168.0.100',
        port: 5432,
        user: 'Backup',
        password: 'UYsdfsw2A5Z4',
        database: 'postgres',
        ssl: false
    });

    try {
        await clientERP.connect();

        // TU CONSULTA DEL ARCHIVO Proveedores.js
        const query = `
            SELECT 
                TRIM(m.mcnvincula) as nit,
                COALESCE(v.vinnombre, '--- NOMBRE NO ENCONTRADO ---') as nombre,
                CAST(m.mcnnumedoc AS VARCHAR) as numero_factura,
                TO_CHAR(m.mcnfecha, 'YYYY-MM-DD') as fecha_factura,
                SUM(m.mcnsaldocr - m.mcnsaldodb) as saldo_pendiente
            FROM manager.mngmcn m
            LEFT JOIN manager.vinculado v ON v.vincedula = m.mcnvincula
            WHERE m.mcncuenta LIKE '22%' 
            GROUP BY m.mcnvincula, v.vinnombre, m.mcntipodoc, m.mcnnumedoc, m.mcnfecha
            HAVING SUM(m.mcnsaldocr - m.mcnsaldodb) > 100
            ORDER BY m.mcnfecha ASC;
        `;

        const result = await clientERP.query(query);
        await clientERP.end();

        // Obtener también las compras LOCALES para comparar en el frontend
        // Solo traemos lo necesario para el cruce
        const localQuery = `SELECT nit, numero_factura, valor FROM financiero_compras`;
        const localResult = await pool.query(localQuery);

        res.json({ 
            success: true, 
            erp: result.rows,
            local: localResult.rows 
        });

    } catch (error) {
        console.error('Error ERP Proveedores:', error);
        try { await clientERP.end(); } catch(e) {}
        
        // MODO PRUEBA (Por si falla la conexión mientras desarrollas)
        if (error.code === 'EHOSTUNREACH' || error.code === 'ETIMEDOUT') {
            return res.json({
                success: true,
                erp: [
                    { nit: '900111222', nombre: 'DISTRIBUIDORA EJEMPLO ERP', numero_factura: 'FEC-100', fecha_factura: '2023-10-25', saldo_pendiente: 500000 },
                    { nit: '800555666', nombre: 'PROVEEDORES S.A.S', numero_factura: 'A-5050', fecha_factura: '2023-11-01', saldo_pendiente: 120000 }
                ],
                local: []
            });
        }

        res.status(500).json({ success: false, message: 'Error consultando ERP Proveedores' });
    }
});

// ==========================================
// MÓDULO COMPRAS DE MERCANCÍA
// ==========================================

// 1. OBTENER LISTA DE COMPRAS
// 1. OBTENER LISTA DE COMPRAS (Con filtro de estado)
app.get('/api/financiero/compras', async (req, res) => {
    const estado = req.query.estado || 'PENDIENTE'; // Por defecto trae las pendientes
    
    try {
        const query = `
            SELECT id, nombre_proveedor, nit, numero_factura, valor, 
                   to_char(fecha_ingreso, 'YYYY-MM-DD') as fecha_ingreso,
                   plazo_dias,
                   to_char(fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento,
                   estado,
                   to_char(fecha_pago, 'YYYY-MM-DD HH12:MI AM') as fecha_pago_formato
            FROM financiero_compras
            WHERE estado = $1
            ORDER BY fecha_ingreso DESC, id DESC LIMIT 100
        `;
        const result = await pool.query(query, [estado]);
        res.json({ success: true, datos: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al cargar compras' });
    }
});

// 2. GUARDAR COMPRA Y REGISTRAR AUTOMÁTICAMENTE EN UTILIDAD
app.post('/api/financiero/compras', async (req, res) => {
    const { usuario_id, nombre_proveedor, nit, numero_factura, valor, fecha_ingreso, plazo_dias, fecha_vencimiento } = req.body;
    
    try {
        // --- PASO 1: Guardar en la tabla de Compras (Para cuentas por pagar) ---
        const queryCompra = `
            INSERT INTO financiero_compras 
            (usuario_id, nombre_proveedor, nit, numero_factura, valor, fecha_ingreso, plazo_dias, fecha_vencimiento)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        await pool.query(queryCompra, [
            usuario_id, nombre_proveedor, nit, numero_factura, valor, fecha_ingreso, plazo_dias, fecha_vencimiento
        ]);

        // --- PASO 2: Guardar automáticamente en PnL (Para restar en Utilidad) ---
        // Creamos una descripción automática, ej: "Compra: Colanta (Fact. 123)"
        const descripcionPnL = `Compra: ${nombre_proveedor} (Fact. ${numero_factura})`;
        
        // Usamos la categoría "Mercancía General" por defecto, o puedes poner "Compras Proveedor"
        const queryPnL = `
            INSERT INTO financiero_movimientos_pnl (usuario_id, fecha, tipo, categoria, descripcion, valor)
            VALUES ($1, $2, 'COSTO', 'Mercancía General', $3, $4)
        `;
        
        await pool.query(queryPnL, [
            usuario_id, 
            fecha_ingreso, // Usamos la misma fecha de ingreso de la factura
            descripcionPnL, 
            valor
        ]);

        res.json({ success: true, message: 'Compra registrada y cargada al costo correctamente' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al guardar compra' });
    }
});

// NUEVA RUTA: MARCAR COMO PAGADA
app.put('/api/financiero/compras/:id/pagar', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(`
            UPDATE financiero_compras 
            SET estado = 'PAGADA', fecha_pago = NOW() 
            WHERE id = $1
        `, [id]);
        res.json({ success: true, message: 'Factura marcada como pagada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al actualizar estado' });
    }
});

// ACTUALIZADO: Solo muestra las que NO están pagadas
app.get('/api/financiero/compras/alertas', async (req, res) => {
    try {
        const query = `
            SELECT id, nombre_proveedor, numero_factura, valor, 
                   to_char(fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento,
                   (fecha_vencimiento - CURRENT_DATE) as dias_restantes
            FROM financiero_compras
            WHERE fecha_vencimiento <= (CURRENT_DATE + 3) 
            AND (estado = 'PENDIENTE' OR estado IS NULL) -- <--- ESTA ES LA CLAVE
            ORDER BY fecha_vencimiento ASC
        `;
        const result = await pool.query(query);
        res.json({ success: true, datos: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error consultando alertas' });
    }
});

// 4. ELIMINAR COMPRA
app.delete('/api/financiero/compras/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM financiero_compras WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Factura eliminada' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al eliminar' });
    }
});

// ==========================================
// MÓDULO PNL (GANANCIAS Y PÉRDIDAS)
// ==========================================

// 1. OBTENER RESUMEN DEL MES ACTUAL
app.get('/api/financiero/pnl/resumen', async (req, res) => {
    try {
        // Filtramos por el mes y año actual
        const query = `
            SELECT 
                COALESCE(SUM(CASE WHEN tipo = 'VENTA' THEN valor ELSE 0 END), 0) as total_ventas,
                COALESCE(SUM(CASE WHEN tipo = 'COSTO' THEN valor ELSE 0 END), 0) as total_costos,
                COALESCE(SUM(CASE WHEN tipo = 'GASTO' THEN valor ELSE 0 END), 0) as total_gastos
            FROM financiero_movimientos_pnl
            WHERE date_part('month', fecha) = date_part('month', CURRENT_DATE)
            AND date_part('year', fecha) = date_part('year', CURRENT_DATE)
        `;
        const result = await pool.query(query);
        const data = result.rows[0];

        // Calculamos Utilidad
        const utilidad = parseFloat(data.total_ventas) - parseFloat(data.total_costos) - parseFloat(data.total_gastos);

        res.json({
            success: true,
            ventas: parseFloat(data.total_ventas),
            costos: parseFloat(data.total_costos),
            gastos: parseFloat(data.total_gastos),
            utilidad: utilidad
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error calculando PnL' });
    }
});

// 2. LISTAR MOVIMIENTOS (Historial)
app.get('/api/financiero/pnl/movimientos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM financiero_movimientos_pnl 
            ORDER BY fecha DESC, id DESC LIMIT 50
        `);
        res.json({ success: true, datos: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error cargando historial' });
    }
});

// 3. REGISTRAR MOVIMIENTO (Venta, Compra o Gasto)
app.post('/api/financiero/pnl', async (req, res) => {
    const { usuario_id, fecha, tipo, categoria, descripcion, valor } = req.body;
    try {
        await pool.query(`
            INSERT INTO financiero_movimientos_pnl (usuario_id, fecha, tipo, categoria, descripcion, valor)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [usuario_id, fecha, tipo, categoria, descripcion, valor]);
        
        res.json({ success: true, message: 'Registro guardado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al guardar' });
    }
});

// 4. ELIMINAR MOVIMIENTO
app.delete('/api/financiero/pnl/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM financiero_movimientos_pnl WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al eliminar' });
    }
});

// 5. FILTRAR POR RANGO DE FECHAS (Resumen + Movimientos)
app.get('/api/financiero/pnl/filtrar', async (req, res) => {
    const { inicio, fin } = req.query;

    try {
        // A. Calcular Totales para las Tarjetas
        const queryResumen = `
            SELECT 
                COALESCE(SUM(CASE WHEN tipo = 'VENTA' THEN valor ELSE 0 END), 0) as total_ventas,
                COALESCE(SUM(CASE WHEN tipo = 'COSTO' THEN valor ELSE 0 END), 0) as total_costos,
                COALESCE(SUM(CASE WHEN tipo = 'GASTO' THEN valor ELSE 0 END), 0) as total_gastos
            FROM financiero_movimientos_pnl
            WHERE fecha BETWEEN $1 AND $2
        `;
        const resultResumen = await pool.query(queryResumen, [inicio, fin]);
        const data = resultResumen.rows[0];
        const utilidad = parseFloat(data.total_ventas) - parseFloat(data.total_costos) - parseFloat(data.total_gastos);

        // B. Obtener la Lista de Movimientos
        const queryLista = `
            SELECT * FROM financiero_movimientos_pnl 
            WHERE fecha BETWEEN $1 AND $2
            ORDER BY fecha DESC, id DESC
        `;
        const resultLista = await pool.query(queryLista, [inicio, fin]);

        res.json({
            success: true,
            resumen: {
                ventas: parseFloat(data.total_ventas),
                costos: parseFloat(data.total_costos),
                gastos: parseFloat(data.total_gastos),
                utilidad: utilidad
            },
            movimientos: resultLista.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al filtrar' });
    }
});

// --- RUTA: CALCULAR TOTALES POR TURNO (CORREGIDA RECAUDOS) ---
app.get('/api/financiero/corresponsal/calculo-dia', async (req, res) => {
    try {
        // 1. OBTENER HORA DE APERTURA
        const queryCaja = `SELECT hora_apertura FROM aperturas_caja ORDER BY id DESC LIMIT 1`;
        const resCaja = await pool.query(queryCaja);
        
        let fechaInicio = new Date();
        if (resCaja.rows.length > 0) {
            fechaInicio = resCaja.rows[0].hora_apertura;
        } else {
            fechaInicio.setHours(0,0,0,0);
        }

        // 2. CALCULAR TOTALES
        const query = `
            SELECT 
                -- 1. DEPÓSITOS 
                COALESCE(SUM(CASE 
                    WHEN tp.nombre ILIKE '%Depósito%' 
                      OR tp.nombre ILIKE '%Consignación%' 
                      OR tp.nombre ILIKE '%Pago Proveedor (Consignación)%' 
                    THEN t.monto ELSE 0 END), 0) as deposito,

                -- 2. RECAUDOS (CORREGIDO: Excluye lo que ya tiene casilla propia)
                COALESCE(SUM(CASE 
                    WHEN (
                           tp.nombre ILIKE '%Servicios Públicos%' 
                        OR (tp.nombre ILIKE '%Pago Proveedor%' AND tp.nombre NOT ILIKE '%(Consignación)%') 
                        OR tp.nombre ILIKE '%Recarga Nequi%'  
                        OR tp.categoria = 'RECAUDO' -- Atrapa Fondeo y otros...
                    )
                    -- PERO EXCLUIMOS LO QUE YA TIENE SU PROPIA CASILLA:
                    AND tp.nombre NOT ILIKE '%Tarjeta de Crédito%'  -- No sumar TC aquí
                    AND tp.nombre NOT ILIKE '%Cartera%'             -- No sumar Cartera aquí
                    AND tp.nombre NOT ILIKE '%Crédito%'             -- No sumar Créditos aquí
                    AND tp.nombre NOT ILIKE '%Depósito%'            -- No sumar Depósitos aquí
                    AND tp.nombre NOT ILIKE '%Consignación%'        -- No sumar Consignaciones aquí
                    
                    THEN t.monto ELSE 0 END), 0) as recaudo,

                -- 3. PAGO TC (Tarjeta de Crédito)
                COALESCE(SUM(CASE 
                    WHEN tp.nombre ILIKE '%Tarjeta de Crédito%' 
                    THEN t.monto ELSE 0 END), 0) as pago_tc,

                -- 4. CARTERA (Créditos, excluyendo tarjeta)
                COALESCE(SUM(CASE 
                    WHEN tp.nombre ILIKE '%Cartera%' 
                      OR (tp.nombre ILIKE '%Crédito%' AND tp.nombre NOT ILIKE '%Tarjeta%') 
                    THEN t.monto ELSE 0 END), 0) as pago_cartera,

                -- 5. RETIROS (Solo Clientes)
                COALESCE(SUM(CASE 
                    WHEN tp.nombre ILIKE '%Retiro Cliente%' 
                    THEN t.monto ELSE 0 END), 0) as retiro,

                -- 6. COMPENSACIÓN 
                COALESCE(SUM(CASE 
                    WHEN tp.nombre ILIKE '%Compensación%' 
                    THEN t.monto ELSE 0 END), 0) as compensacion

            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            WHERE t.fecha_hora >= $1
        `;

        const result = await pool.query(query, [fechaInicio]);
        res.json({ success: true, datos: result.rows[0] });

    } catch (error) {
        console.error('Error calculando automáticos:', error);
        res.status(500).json({ success: false, message: 'Error al calcular totales' });
    }
});

// --- RUTA: DETALLE DE COMPENSACIONES DEL DÍA ---
app.get('/api/financiero/corresponsal/compensaciones-hoy', async (req, res) => {
    try {
        const query = `
            SELECT 
                to_char(t.fecha_hora, 'HH12:MI AM') as hora,
                u.nombre as usuario,
                t.descripcion,
                t.monto
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE DATE(t.fecha_hora) = CURRENT_DATE 
              AND tp.nombre ILIKE '%Compensación%'
            ORDER BY t.fecha_hora DESC
        `;
        const result = await pool.query(query);
        res.json({ success: true, datos: result.rows });
    } catch (error) {
        console.error('Error fetching compensations:', error);
        res.status(500).json({ success: false, message: 'Error al consultar datos' });
    }
});

// ==========================================
// MÓDULO GESTIÓN DE USUARIOS Y SEGURIDAD
// ==========================================

// 1. LISTAR USUARIOS
app.get('/api/financiero/usuarios', async (req, res) => {
    try {
        // Mostramos todos menos el password
        const result = await pool.query('SELECT id, usuario, nombre_completo, estado FROM financiero_usuarios ORDER BY id ASC');
        res.json({ success: true, datos: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error cargando usuarios' });
    }
});

// 2. CREAR USUARIO (Sin roles, simple)
app.post('/api/financiero/usuarios', async (req, res) => {
    const { nombre, usuario, password } = req.body;
    try {
        // Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        await pool.query(
            `INSERT INTO financiero_usuarios (nombre_completo, usuario, password_hash) VALUES ($1, $2, $3)`,
            [nombre, usuario, hash]
        );
        res.json({ success: true, message: 'Usuario creado exitosamente' });
    } catch (error) {
        console.error(error);
        if(error.code === '23505') return res.json({ success: false, message: 'El usuario ya existe' });
        res.status(500).json({ success: false, message: 'Error creando usuario' });
    }
});

// 3. CAMBIAR CLAVE DE USUARIO (Reset)
app.put('/api/financiero/usuarios/:id/clave', async (req, res) => {
    const { password } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        await pool.query('UPDATE financiero_usuarios SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
        res.json({ success: true, message: 'Contraseña actualizada' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error actualizando clave' });
    }
});

// 4. ELIMINAR USUARIO
app.delete('/api/financiero/usuarios/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM financiero_usuarios WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Usuario eliminado' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error eliminando usuario' });
    }
});

// 5. CAMBIAR CLAVE ADMINISTRATIVA GLOBAL
app.post('/api/financiero/config/clave-admin', async (req, res) => {
    const { nueva_clave } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(nueva_clave, salt);

        // Usamos "UPSERT" (Insertar o Actualizar si ya existe)
        await pool.query(`
            INSERT INTO financiero_config (clave, valor) VALUES ('clave_admin', $1)
            ON CONFLICT (clave) DO UPDATE SET valor = $1
        `, [hash]);

        res.json({ success: true, message: 'Clave Administrativa actualizada correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error guardando clave admin' });
    }
});

// --- AGREGAR ESTO EN src/financiero.js (Sección Cuentas por Cobrar) ---

// 7. ELIMINAR CLIENTE COMPLETO (Borra todo el historial de ese documento)
app.delete('/api/financiero/cuentas-cobrar/eliminar-cliente/:doc', async (req, res) => {
    const { doc } = req.params;
    try {
        // Borramos todas las operaciones donde aparezca ese documento
        await pool.query('DELETE FROM financiero_cuentas_cobrar WHERE cliente_documento = $1', [doc]);
        res.json({ success: true, message: 'Cliente y sus movimientos eliminados correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al eliminar cliente' });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🏦 Sistema Financiero corriendo en: http://localhost:${PORT}`);
});