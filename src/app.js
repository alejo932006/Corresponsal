const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('./db'); // Importamos la conexión
const app = express();
const fs = require('fs');
const { exec } = require('child_process');

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
            // AHORA DEVOLVEMOS TAMBIÉN EL ROL
            res.json({ 
                success: true, 
                message: 'Bienvenido', 
                usuario: usuarioEncontrado.nombre,
                rol: usuarioEncontrado.rol // <--- NUEVO
            });
        }

    } catch (error) {
        console.error('💥 Error grave del servidor:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// --- RUTA PARA OBTENER EL RESUMEN DEL DASHBOARD (CORREGIDA) ---
app.get('/api/resumen', async (req, res) => {
    try {
        // 1. Obtener Saldos Globales (Banco y Deuda son acumulativos, no se borran al cerrar caja)
        const queryGlobales = `
            SELECT 
                SUM(t.monto * tp.afecta_banco) as saldo_banco,
                SUM(CASE WHEN tp.genera_deuda = TRUE THEN t.monto ELSE 0 END) as deuda_empresa
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id;
        `;
        const resGlobales = await pool.query(queryGlobales);
        
        // 2. Obtener Saldo de Caja REAL (Base Actual + Movimientos del Turno)
        // Buscamos la última caja abierta (o cerrada hoy) para saber la Base
        const queryCaja = `
            SELECT monto_inicial, hora_apertura 
            FROM aperturas_caja 
            WHERE fecha = CURRENT_DATE 
            ORDER BY id DESC LIMIT 1
        `;
        const resCaja = await pool.query(queryCaja);
        
        let saldoCajaReal = 0;

        if (resCaja.rows.length > 0) {
            const { monto_inicial, hora_apertura } = resCaja.rows[0];
            
            // Sumamos solo las transacciones hechas DESPUÉS de esa apertura
            const queryMovsCaja = `
                SELECT SUM(t.monto * tp.afecta_caja) as movimientos
                FROM transacciones t
                JOIN tipos_transaccion tp ON t.tipo_id = tp.id
                WHERE t.fecha_hora >= $1
            `;
            const resMovs = await pool.query(queryMovsCaja, [hora_apertura]);
            
            // Fórmula: Lo que puse al inicio + lo que moví
            saldoCajaReal = parseFloat(monto_inicial) + (parseFloat(resMovs.rows[0].movimientos) || 0);
        }

        // 3. Obtener los últimos 5 movimientos para la tabla
        const queryMovimientos = `
            SELECT 
                to_char(t.fecha_hora, 'HH12:MI AM') as hora,
                tp.nombre as tipo,
                t.descripcion,
                t.monto
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            ORDER BY t.id DESC
            LIMIT 20;
        `;
        const movimientos = await pool.query(queryMovimientos);

        // Preparamos el objeto de respuesta combinando todo
        const totales = {
            saldo_caja: saldoCajaReal, // ¡Ahora sí incluye la base!
            saldo_banco: resGlobales.rows[0].saldo_banco || 0,
            deuda_empresa: resGlobales.rows[0].deuda_empresa || 0
        };

        res.json({
            success: true,
            totales: totales,
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

// src/app.js

app.get('/api/mis-movimientos', async (req, res) => {
    const { usuario } = req.query; 
    try {
        // 1. Buscamos hora de apertura Y EL ESTADO del turno
        const queryTurno = `
            SELECT hora_apertura, estado FROM aperturas_caja ac
            JOIN usuarios u ON ac.usuario_id = u.id
            WHERE u.nombre = $1 AND ac.fecha = CURRENT_DATE
            ORDER BY ac.id DESC LIMIT 1
        `;
        const resTurno = await pool.query(queryTurno, [usuario]);
        
        // Si no ha abierto nunca hoy, lista vacía
        if (resTurno.rows.length === 0) {
            return res.json({ success: true, movimientos: [] });
        }

        const turno = resTurno.rows[0];

        // --- CORRECCIÓN CLAVE ---
        // Si el último turno registrado ya está CERRADO, no mostrar nada.
        if (turno.estado !== 'ABIERTA') {
            return res.json({ success: true, movimientos: [] });
        }
        // ------------------------

        const horaInicioTurno = turno.hora_apertura;

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
              AND t.fecha_hora >= $2
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

// --- RUTA: APERTURA DE CAJA (CORREGIDA CON AUTO-CIERRE) ---
app.post('/api/apertura-caja', async (req, res) => {
    const { usuario_nombre, monto } = req.body;
    try {
        const userRes = await pool.query('SELECT id FROM usuarios WHERE nombre = $1', [usuario_nombre]);
        
        // Validación extra por si el usuario no existe
        if (userRes.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Usuario no encontrado' });
        }
        
        const userId = userRes.rows[0].id;

        // 1. Buscamos SI EXISTE ALGUNA caja abierta (de cualquier fecha)
        // Usamos ::text para comparar fechas fácilmente como strings 'YYYY-MM-DD'
        const checkAbierta = await pool.query(`
            SELECT id, fecha::text as fecha_str FROM aperturas_caja 
            WHERE usuario_id = $1 AND estado = 'ABIERTA'
        `, [userId]);

        // Obtenemos la fecha de hoy en formato YYYY-MM-DD para comparar
        // Nota: Ajusta esto si tu servidor está en una zona horaria muy distinta
        const hoy = new Date().toISOString().split('T')[0]; 

        if (checkAbierta.rows.length > 0) {
            const cajaAbierta = checkAbierta.rows[0];
            
            // CASO A: Ya abriste caja HOY. No dejamos abrir otra.
            if (cajaAbierta.fecha_str === hoy) {
                 return res.status(400).json({ success: false, message: 'Ya tienes una caja abierta hoy. Ve al panel principal.' });
            }

            // CASO B: Es una caja VIEJA olvidada. La cerramos automáticamente para desbloquearte.
            console.log(`⚠️ Sistema: Cerrando caja antigua olvidada del día ${cajaAbierta.fecha_str} (ID: ${cajaAbierta.id})`);
            
            await pool.query(`
                UPDATE aperturas_caja 
                SET estado = 'CERRADA_AUTO',  -- Marcamos que fue automático por si acaso
                    fecha_cierre = CURRENT_TIMESTAMP, 
                    diferencia = 0,
                    monto_final_real = monto_final_sistema -- Asumimos cierre perfecto para no dejar nulls
                WHERE id = $1
            `, [cajaAbierta.id]);
            
            // ¡El código continúa abajo para abrir la NUEVA caja!
        }

        // 2. Insertamos el NUEVO turno de hoy
        const query = `
            INSERT INTO aperturas_caja (usuario_id, fecha, monto_inicial, estado)
            VALUES ($1, CURRENT_DATE, $2, 'ABIERTA');
        `;
        await pool.query(query, [userId, monto]);
        
        res.json({ success: true, message: 'Caja abierta exitosamente' });

    } catch (error) {
        console.error('Error apertura:', error);
        res.status(500).json({ success: false, message: 'Error al abrir caja' });
    }
});

// --- RUTA: OBTENER BASE ACTUAL EN TIEMPO REAL ---
app.get('/api/base-caja', async (req, res) => {
    const { usuario } = req.query;
    try {
        // 1. Buscamos la caja, y AÑADIMOS 'hora_apertura' a la consulta
        const queryInicial = `
            SELECT monto_inicial, estado, hora_apertura FROM aperturas_caja ac
            JOIN usuarios u ON ac.usuario_id = u.id
            WHERE u.nombre = $1 AND ac.fecha = CURRENT_DATE
            ORDER BY ac.id DESC LIMIT 1
        `;
        const resInicial = await pool.query(queryInicial, [usuario]);
        
        if (resInicial.rows.length === 0) {
             return res.json({ success: true, base: 0, baseInicial: 0, cajaAbierta: false });
        }

        const datosCaja = resInicial.rows[0];
        const baseInicial = parseFloat(datosCaja.monto_inicial);
        const cajaAbierta = datosCaja.estado === 'ABIERTA';

        // 2. Sumar movimientos SOLO DESDE LA HORA DE APERTURA
        const queryMovimientos = `
            SELECT SUM(t.monto * tp.afecta_caja) as total_movimientos
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE u.nombre = $1 
              AND t.fecha_hora >= $2  -- <--- CORRECCIÓN CLAVE AQUÍ
        `;
        
        // Pasamos la hora_apertura como parámetro ($2)
        const resMov = await pool.query(queryMovimientos, [usuario, datosCaja.hora_apertura]);
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
    let { tipo_id, banco_id, descripcion, monto, usuario_nombre } = req.body;

    // VALIDACIÓN DE SEGURIDAD PARA EVITAR EL ERROR ""
    if (!banco_id || banco_id === "") {
        console.error("Error: Se intentó guardar sin banco_id");
        return res.status(400).json({ success: false, message: '⚠️ Error: No se ha seleccionado ningún Banco.' });
    }
    
    // Asegurarnos de que sean números
    banco_id = parseInt(banco_id); 
    tipo_id = parseInt(tipo_id);

    try {
        // 1. Obtener ID del usuario
        const usuarioRes = await pool.query('SELECT id FROM usuarios WHERE nombre = $1', [usuario_nombre]);
        
        if (usuarioRes.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Usuario no válido' });
        }
        const usuarioId = usuarioRes.rows[0].id;

        // 🛑 GUARDIA DE SEGURIDAD (CAJA ABIERTA)
        const cajaCheck = await pool.query(`
            SELECT id FROM aperturas_caja 
            WHERE usuario_id = $1 AND fecha = CURRENT_DATE AND estado = 'ABIERTA'
        `, [usuarioId]);

        if (cajaCheck.rows.length === 0) {
            return res.json({ success: false, message: 'CAJA CERRADA: Abre caja primero.' });
        }

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
        res.status(500).json({ success: false, message: 'Error en base de datos: ' + error.message });
    }
});

// --- RUTA: OBTENER DATOS PARA EL REPORTE DE CIERRE ---
// --- RUTA: OBTENER DATOS PARA EL REPORTE DE CIERRE (CON FILTRO DE FECHA) ---
app.get('/api/reporte-cierre', async (req, res) => {
    const { usuario, fecha } = req.query; // Ahora recibimos 'fecha'
    try {
        // Si no envían fecha, usamos la de HOY por defecto
        // Formato YYYY-MM-DD para PostgreSQL
        const fechaFiltro = fecha || new Date().toISOString().split('T')[0];

        // 1. Obtener Totales Agrupados por Tipo de Transacción
        const queryAgrupado = `
            SELECT tp.nombre as concepto, SUM(t.monto) as total_valor, COUNT(*) as cantidad
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE u.nombre = $1 AND DATE(t.fecha_hora) = $2
            GROUP BY tp.nombre
            ORDER BY total_valor DESC
        `;
        const resAgrupado = await pool.query(queryAgrupado, [usuario, fechaFiltro]);

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
            WHERE u.nombre = $1 AND DATE(t.fecha_hora) = $2
            ORDER BY t.id ASC
        `;
        const resDetalle = await pool.query(queryDetalle, [usuario, fechaFiltro]);

        res.json({
            success: true,
            resumen: resAgrupado.rows,
            detalle: resDetalle.rows,
            fecha: fechaFiltro // Devolvemos la fecha que se usó
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});

// --- RUTA: RESETEAR BASE DE DATOS (CON BACKUP PREVIO) ---
app.post('/api/admin/reset-db', async (req, res) => {
    const { confirmacion } = req.body;

    // 1. Medida de seguridad básica
    if (confirmacion !== 'BORRAR TODO') {
        return res.status(400).json({ success: false, message: 'Código de confirmación incorrecto.' });
    }

    try {
        // 2. Preparar carpeta de backups
        const backupDir = path.join(__dirname, '../backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
        }

        const fecha = new Date().toISOString().replace(/[:.]/g, '-');
        const archivoBackup = path.join(backupDir, `respaldo_antes_de_reset_${fecha}.sql`);

        // IMPORTANTE: Datos de conexión (Asegúrate que coincidan con tu db.js)
        // En Windows, pg_dump debe estar en las variables de entorno o usar la ruta completa
        const DB_USER = 'postgres';
        const DB_PASS = '0534'; // Tu contraseña
        const DB_NAME = 'Corresponsal';

        // 3. COMANDO PARA CREAR BACKUP (pg_dump)
        // Nota: En Windows seteamos la contraseña así: SET PGPASSWORD=...
        const comandoBackup = `SET PGPASSWORD=${DB_PASS}&& pg_dump -U ${DB_USER} -h localhost -F c -b -v -f "${archivoBackup}" ${DB_NAME}`;

        console.log("Iniciando respaldo...");

        exec(comandoBackup, async (error, stdout, stderr) => {
            if (error) {
                console.error(`Error en backup: ${error.message}`);
                return res.status(500).json({ success: false, message: 'Falló la copia de seguridad. No se borró nada.' });
            }

            console.log("Respaldo exitoso. Procediendo a borrar datos...");

            // 4. BORRAR DATOS (Solo transacciones y cajas, mantenemos configuración)
            try {
                await pool.query('TRUNCATE TABLE transacciones, aperturas_caja RESTART IDENTITY CASCADE');
                console.log("Datos borrados correctamente.");
                
                res.json({ 
                    success: true, 
                    message: 'Sistema reseteado exitosamente. Se creó un respaldo en la carpeta /backups.' 
                });
            } catch (dbError) {
                console.error(dbError);
                res.status(500).json({ success: false, message: 'Error al vaciar las tablas.' });
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error del servidor.' });
    }
});

// --- RUTA: ELIMINAR TRANSACCIÓN ---
app.delete('/api/transacciones/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Validar que la transacción sea de HOY (Seguridad)
        // No queremos borrar cosas de días pasados porque descuadramos cierres antiguos.
        const check = await pool.query('SELECT fecha_hora FROM transacciones WHERE id = $1', [id]);
        
        if (check.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Transacción no encontrada' });
        }
        
        // Convertimos fechas a string simple para comparar (YYYY-MM-DD)
        const fechaTx = new Date(check.rows[0].fecha_hora).toDateString();
        const hoy = new Date().toDateString();

        if (fechaTx !== hoy) {
            return res.status(400).json({ success: false, message: 'Solo puedes eliminar movimientos del día actual.' });
        }

        // 2. Borrar
        await pool.query('DELETE FROM transacciones WHERE id = $1', [id]);
        res.json({ success: true, message: 'Eliminada correctamente' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al eliminar' });
    }
});

// --- RUTA: EDITAR TRANSACCIÓN (Monto y Descripción) ---
app.put('/api/transacciones/:id', async (req, res) => {
    const { id } = req.params;
    const { monto, descripcion } = req.body;

    try {
        // 1. Validar fecha (Igual que arriba)
        const check = await pool.query('SELECT fecha_hora FROM transacciones WHERE id = $1', [id]);
        if (check.rows.length === 0) return res.status(404).json({ success: false });

        const fechaTx = new Date(check.rows[0].fecha_hora).toDateString();
        const hoy = new Date().toDateString();

        if (fechaTx !== hoy) {
            return res.status(400).json({ success: false, message: 'Solo puedes editar movimientos del día actual.' });
        }

        // 2. Actualizar
        await pool.query(
            'UPDATE transacciones SET monto = $1, descripcion = $2 WHERE id = $3',
            [monto, descripcion, id]
        );
        res.json({ success: true, message: 'Actualizada correctamente' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al actualizar' });
    }
});

// --- RUTA: REPORTES POR RANGO Y TIPO ---
app.get('/api/reportes-rango', async (req, res) => {
    const { usuario, inicio, fin, tipo } = req.query; // Recibimos 'tipo'

    try {
        if (!inicio || !fin) {
            return res.status(400).json({ success: false, message: 'Faltan fechas' });
        }

        // Construcción dinámica de la consulta (Para filtrar si eligieron un tipo)
        let filtroTipo = "";
        const params = [usuario, inicio, fin];

        if (tipo && tipo !== 'TODOS') {
            filtroTipo = " AND t.tipo_id = $4";
            params.push(tipo);
        }

        // 1. Obtener Resumen (Totales) con el filtro aplicado
        const queryResumen = `
            SELECT 
                COUNT(*) as cantidad_total,
                SUM(t.monto) as volumen_negociado,
                SUM(CASE WHEN tp.afecta_caja = 1 THEN t.monto ELSE 0 END) as total_entradas,
                SUM(CASE WHEN tp.afecta_caja = -1 THEN t.monto ELSE 0 END) as total_salidas
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE u.nombre = $1 
              AND t.fecha_hora::date BETWEEN $2 AND $3
              ${filtroTipo}
        `;
        const resumen = await pool.query(queryResumen, params);

        // 2. Obtener Lista Detallada con el filtro aplicado
        const queryDetalle = `
            SELECT 
                t.id,
                to_char(t.fecha_hora, 'YYYY-MM-DD HH12:MI AM') as fecha,
                tp.nombre as tipo,
                t.descripcion,
                t.monto,
                tp.afecta_caja
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE u.nombre = $1 
              AND t.fecha_hora::date BETWEEN $2 AND $3
              ${filtroTipo}
            ORDER BY t.fecha_hora DESC
        `;
        const detalle = await pool.query(queryDetalle, params);

        res.json({
            success: true,
            resumen: resumen.rows[0],
            movimientos: detalle.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error generando reporte' });
    }
});

// --- RUTA NUEVA: OBTENER SALDOS INDIVIDUALES POR BANCO ---
// --- RUTA NUEVA: OBTENER SALDOS INDIVIDUALES POR BANCO ---
app.get('/api/bancos-saldos', async (req, res) => {
    try {
        const query = `
            SELECT 
                b.id, 
                b.nombre,
                COALESCE(SUM(t.monto * tp.afecta_banco), 0) as saldo
            FROM bancos b
            LEFT JOIN transacciones t ON b.id = t.banco_id
            LEFT JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            GROUP BY b.id, b.nombre
            ORDER BY b.nombre;
        `;
        
        const resultado = await pool.query(query);
        
        // Convertir a números para evitar errores de texto
        const bancosConSaldo = resultado.rows.map(b => ({
            ...b,
            saldo: parseFloat(b.saldo)
        }));

        res.json({ success: true, bancos: bancosConSaldo });

    } catch (error) {
        console.error('Error calculando saldos bancarios:', error);
        res.status(500).json({ success: false, message: 'Error al obtener saldos' });
    }
});

// --- NUEVA RUTA: LISTAR USUARIOS ---
app.get('/api/usuarios', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, rol FROM usuarios ORDER BY id');
        res.json({ success: true, usuarios: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});

// --- NUEVA RUTA: CREAR USUARIO ---
app.post('/api/usuarios', async (req, res) => {
    const { nombre, password, rol } = req.body;
    try {
        // Encriptar contraseña
        const hash = await bcrypt.hash(password, 10);
        
        await pool.query(
            'INSERT INTO usuarios (nombre, password_hash, rol) VALUES ($1, $2, $3)',
            [nombre, hash, rol]
        );
        
        res.json({ success: true, message: 'Usuario creado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error creando usuario' });
    }
});

// --- RUTA: HISTORIAL DE COMPENSACIONES ---
app.get('/api/compensaciones', async (req, res) => {
    const { usuario } = req.query;
    try {
        // Buscamos solo las transacciones que sean de tipo "Compensación"
        const query = `
            SELECT 
                t.id,
                to_char(t.fecha_hora, 'YYYY-MM-DD HH12:MI AM') as fecha,
                b.nombre as banco,
                t.descripcion,
                t.monto
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            LEFT JOIN bancos b ON t.banco_id = b.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE u.nombre = $1 
              AND tp.nombre ILIKE '%Compensación%' 
            ORDER BY t.fecha_hora DESC
            LIMIT 50
        `;
        const result = await pool.query(query, [usuario]);
        res.json({ success: true, movimientos: result.rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

// Iniciar servidor
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});