/* src/app.js */
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('./db'); // Importamos la conexión
const app = express();
const fs = require('fs');
const { exec } = require('child_process');

// Middleware
app.use(express.json()); 
app.use(express.static(path.join(__dirname, '../public'))); 

// --- RUTA DE LOGIN (MODO DEBUG) ---
app.post('/api/login', async (req, res) => {
    const { usuario, password } = req.body;
    console.log('--- INTENTO DE LOGIN ---');
    console.log(`Usuario recibido: "${usuario}"`);

    try {
        const resultado = await pool.query('SELECT * FROM usuarios WHERE nombre = $1', [usuario]);
        
        if (resultado.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
        }

        const usuarioEncontrado = resultado.rows[0];
        const passwordCorrecta = await bcrypt.compare(password, usuarioEncontrado.password_hash);

        if (passwordCorrecta) {
            res.json({ 
                success: true, 
                message: 'Bienvenido', 
                usuario: usuarioEncontrado.nombre,
                rol: usuarioEncontrado.rol 
            });
        } else {
            res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
        }

    } catch (error) {
        console.error('Error login:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// --- RUTA: VALIDAR PASSWORD DE ADMIN (PARA AJUSTES DE SALDO) ---
app.post('/api/validar-admin', async (req, res) => {
    const { password } = req.body;
    
    // Protección básica: que llegue algo
    if (!password) {
        return res.json({ success: false, message: 'Contraseña vacía' });
    }

    try {
        // 1. Buscamos TODOS los usuarios que sean administradores
        const resultado = await pool.query("SELECT password_hash FROM usuarios WHERE rol = 'admin'");
        
        if (resultado.rows.length === 0) {
            return res.json({ success: false, message: 'Error: No existe ningún usuario con rol "admin" en el sistema.' });
        }

        // 2. Probamos la contraseña contra CADA administrador encontrado
        // (Esto es útil si tienes varios admins y quieres que cualquiera pueda autorizar)
        let passwordCorrecta = false;

        for (const admin of resultado.rows) {
            const match = await bcrypt.compare(password, admin.password_hash);
            if (match) {
                passwordCorrecta = true;
                break; // Encontramos uno que coincide, dejamos de buscar
            }
        }

        if (passwordCorrecta) {
            res.json({ success: true, message: 'Acceso autorizado' });
        } else {
            res.json({ success: false, message: 'Contraseña de administrador incorrecta' });
        }

    } catch (error) {
        console.error('Error validando admin:', error);
        res.status(500).json({ success: false, message: 'Error del servidor al validar' });
    }
});

// --- RUTA PARA OBTENER EL RESUMEN DEL DASHBOARD (VERSIÓN FINAL) ---
app.get('/api/resumen', async (req, res) => {
    try {
        // 1. SALDO GLOBAL BANCOS (Histórico total)
        // Solo traemos el saldo del banco, la deuda la calculamos abajo por turno
        const queryGlobales = `
            SELECT SUM(t.monto * tp.afecta_banco) as saldo_banco
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id;
        `;
        const resGlobales = await pool.query(queryGlobales);
        
        // 2. OBTENER DATOS DE LA CAJA ACTUAL (ÚLTIMO TURNO)
        const queryCaja = `
            SELECT monto_inicial, hora_apertura 
            FROM aperturas_caja 
            ORDER BY id DESC LIMIT 1
        `;
        const resCaja = await pool.query(queryCaja);
        
        let saldoCajaReal = 0;
        let fechaInicioTurno = new Date(); // Fecha por defecto si no hay caja

        if (resCaja.rows.length > 0) {
            const { monto_inicial, hora_apertura } = resCaja.rows[0];
            
            // ¡CLAVE! Guardamos la hora exacta en que se abrió esta caja
            fechaInicioTurno = hora_apertura;

            // Calculamos saldo de caja (movimientos desde esa hora)
            const queryMovsCaja = `
                SELECT SUM(t.monto * tp.afecta_caja) as movimientos
                FROM transacciones t
                JOIN tipos_transaccion tp ON t.tipo_id = tp.id
                WHERE t.fecha_hora >= $1
            `;
            const resMovs = await pool.query(queryMovsCaja, [hora_apertura]);
            
            saldoCajaReal = parseFloat(monto_inicial) + (parseFloat(resMovs.rows[0].movimientos) || 0);
        }

        // 3. CÁLCULO DE DEUDA INTERNA (POR TURNO)
        // Sumamos solo los pagos a proveedores (7 y 13) realizados DESDE la apertura de caja
        const queryDeuda = `
            SELECT COALESCE(SUM(monto), 0) as total_deuda
            FROM transacciones
            WHERE tipo_id IN (7, 13) 
            AND fecha_hora >= $1 
        `;
        const resDeuda = await pool.query(queryDeuda, [fechaInicioTurno]);
        const deudaInterna = parseFloat(resDeuda.rows[0].total_deuda);

        // 4. ÚLTIMOS MOVIMIENTOS
        const queryMovimientos = `
            SELECT 
                to_char(t.fecha_hora, 'HH12:MI AM') as hora,
                tp.nombre as tipo,
                t.descripcion,
                t.monto,
                tp.afecta_caja,       
                u.nombre as usuario   
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id 
            ORDER BY t.id DESC
            LIMIT 20;
        `;
        const movimientos = await pool.query(queryMovimientos);

        const totales = {
            saldo_caja: saldoCajaReal,
            saldo_banco: resGlobales.rows[0].saldo_banco || 0,
            deuda_empresa: deudaInterna // <--- Muestra solo lo pagado en este turno
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

// --- RUTA CONFIG FORMULARIO ---
app.get('/api/config-formulario', async (req, res) => {
    try {
        const bancos = await pool.query('SELECT * FROM bancos ORDER BY nombre');
        const tipos = await pool.query('SELECT * FROM tipos_transaccion ORDER BY id');
        res.json({ success: true, bancos: bancos.rows, tipos: tipos.rows });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// --- MIS MOVIMIENTOS ---
//
// --- MIS MOVIMIENTOS (AHORA: MOVIMIENTOS GLOBALES DEL TURNO) ---
app.get('/api/mis-movimientos', async (req, res) => {
    // Nota: Ya no usamos "req.query.usuario" para filtrar, queremos ver todo.
    try {
        // 1. Buscamos el último turno GLOBAL del sistema (sin importar usuario)
        const queryTurno = `
            SELECT hora_apertura, estado FROM aperturas_caja
            ORDER BY id DESC LIMIT 1
        `;
        const resTurno = await pool.query(queryTurno);
        
        if (resTurno.rows.length === 0) {
            return res.json({ success: true, movimientos: [] });
        }

        const turno = resTurno.rows[0];

        // Opcional: Si quieres ver el historial aunque la caja esté cerrada, quita este if.
        // Por ahora, lo dejamos para que muestre movimientos solo del turno ABIERTO.
        if (turno.estado !== 'ABIERTA') {
            return res.json({ success: true, movimientos: [] });
        }

        const horaInicioTurno = turno.hora_apertura;

        // 2. Traemos las transacciones de TODOS los usuarios desde esa hora
        const query = `
        SELECT 
            t.id,
            to_char(t.fecha_hora, 'HH12:MI AM') as hora,
            tp.nombre as tipo,
            t.monto,
            t.descripcion,
            tp.afecta_caja,
            u.nombre as usuario  -- Importante: Aquí verás quién hizo la operación
        FROM transacciones t
        JOIN tipos_transaccion tp ON t.tipo_id = tp.id
        JOIN usuarios u ON t.usuario_id = u.id
        WHERE t.fecha_hora >= $1  -- FILTRO ÚNICO: Desde que se abrió la caja
        ORDER BY t.id DESC
        `;
        
        // Ejecutamos la consulta pasando solo la hora de inicio
        const resultado = await pool.query(query, [horaInicioTurno]);
        res.json({ success: true, movimientos: resultado.rows });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});

// En src/app.js -> Busque app.post('/api/apertura-caja', ...)

//
app.post('/api/apertura-caja', async (req, res) => {
    const { usuario_nombre, monto } = req.body;
    try {
        const userRes = await pool.query('SELECT id FROM usuarios WHERE nombre = $1', [usuario_nombre]);
        if (userRes.rows.length === 0) return res.status(400).json({ success: false, message: 'Usuario no encontrado' });
        
        const userId = userRes.rows[0].id;

        // 1. Buscamos SI EXISTE ALGUNA caja abierta en TODO EL SISTEMA (Global)
        // Quitamos el filtro "usuario_id = $1"
        const checkAbierta = await pool.query(`
            SELECT ac.id, ac.fecha::text as fecha_str, u.nombre as quien_abrio 
            FROM aperturas_caja ac
            JOIN usuarios u ON ac.usuario_id = u.id
            WHERE ac.estado = 'ABIERTA'
        `);

        if (checkAbierta.rows.length > 0) {
            const cajaAbierta = checkAbierta.rows[0];
            return res.status(400).json({ 
                success: false, 
                message: `⛔ Ya hay una caja ABIERTA por ${cajaAbierta.quien_abrio} (Fecha: ${cajaAbierta.fecha_str}). No puedes abrir otra.` 
            });
        }

        // 2. Insertamos el NUEVO turno
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
//
app.get('/api/base-caja', async (req, res) => {
    // La variable usuario ya no la usamos para filtrar la caja
    try {
        // Obtenemos la última caja del sistema
        const queryInicial = `
            SELECT monto_inicial, estado, hora_apertura 
            FROM aperturas_caja
            ORDER BY id DESC LIMIT 1
        `;
        const resInicial = await pool.query(queryInicial);
        
        if (resInicial.rows.length === 0) {
             return res.json({ success: true, base: 0, baseInicial: 0, cajaAbierta: false });
        }

        const datosCaja = resInicial.rows[0];
        const baseInicial = parseFloat(datosCaja.monto_inicial);
        const cajaAbierta = datosCaja.estado === 'ABIERTA';

        if (!cajaAbierta) {
            return res.json({ success: true, base: 0, baseInicial: 0, cajaAbierta: false });
        }

        // Sumar movimientos GLOBALES desde esa apertura (sin filtrar por usuario)
        const queryMovimientos = `
            SELECT SUM(t.monto * tp.afecta_caja) as total_movimientos
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            WHERE t.fecha_hora >= $1
        `;
        
        const resMov = await pool.query(queryMovimientos, [datosCaja.hora_apertura]);
        const movimientos = parseFloat(resMov.rows[0].total_movimientos) || 0;
        const totalEnCaja = baseInicial + movimientos;

        res.json({ success: true, base: totalEnCaja, baseInicial, cajaAbierta });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});

// --- REABRIR CAJA (CORREGIDO: GLOBAL) ---
app.post('/api/reabrir-caja', async (req, res) => {
    // Ya no necesitamos 'usuario_nombre' para filtrar, 
    // queremos reabrir la última caja del sistema sea de quien sea.
    try {
        // 1. Buscar la ÚLTIMA caja registrada en todo el sistema
        const lastBoxQuery = `
            SELECT id, estado FROM aperturas_caja
            ORDER BY id DESC LIMIT 1
        `;
        const lastBoxRes = await pool.query(lastBoxQuery);

        if (lastBoxRes.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'No existe historial de cajas para reabrir.' });
        }

        const caja = lastBoxRes.rows[0];

        // Opcional: Validar si ya está abierta
        if (caja.estado === 'ABIERTA') {
            return res.json({ success: true, message: 'La caja ya está abierta.' });
        }

        // 2. Reabrir esa caja específica (Limpiamos los datos de cierre)
        const queryUpdate = `
            UPDATE aperturas_caja 
            SET estado = 'ABIERTA', 
                fecha_cierre = NULL, 
                monto_final_sistema = NULL, 
                monto_final_real = NULL, 
                diferencia = NULL
            WHERE id = $1
        `;
        
        await pool.query(queryUpdate, [caja.id]);
        res.json({ success: true, message: 'Caja reabierta correctamente' });

    } catch (error) {
        console.error('Error reabriendo:', error);
        res.status(500).json({ success: false, message: 'No se pudo reabrir' });
    }
});

// En src/app.js -> Busque app.get('/api/estado-caja', ...)

//
app.get('/api/estado-caja', async (req, res) => {
    // NOTA: Ya no filtramos por usuario, miramos la última caja global del sistema
    try {
        const query = `
            SELECT ac.*, u.nombre as nombre_usuario_apertura 
            FROM aperturas_caja ac
            JOIN usuarios u ON ac.usuario_id = u.id
            ORDER BY ac.id DESC LIMIT 1 
        `;
        const resultado = await pool.query(query);

        if (resultado.rows.length === 0) {
            return res.json({ estado: 'SIN_APERTURA' });
        }

        const datos = resultado.rows[0];
        
        if (datos.estado === 'ABIERTA') {
             // Calculamos saldo sumando movimientos de TODOS los usuarios desde esa hora
             const queryMovs = `
                SELECT SUM(t.monto * tp.afecta_caja) as total
                FROM transacciones t
                JOIN tipos_transaccion tp ON t.tipo_id = tp.id
                WHERE t.fecha_hora >= $1
            `;
            const resMovs = await pool.query(queryMovs, [datos.hora_apertura]);
            const movimientos = parseFloat(resMovs.rows[0].total) || 0;
            datos.saldo_actual_calculado = parseFloat(datos.monto_inicial) + movimientos;
        }

        res.json({ estado: datos.estado, datos: datos });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// En src/app.js -> Busque app.post('/api/cerrar-caja', ...)

app.post('/api/cerrar-caja', async (req, res) => {
    const { usuario_nombre, monto_fisico } = req.body;
    
    try {
        // 1. Buscamos la caja ABIERTA del SISTEMA
        const querySaldo = `
            SELECT 
                ac.id,
                ac.monto_inicial,
                ac.hora_apertura
            FROM aperturas_caja ac
            WHERE ac.estado = 'ABIERTA'
            ORDER BY ac.id DESC LIMIT 1
        `;
        
        const resSaldo = await pool.query(querySaldo);
        
        if (resSaldo.rows.length === 0) {
            return res.status(400).json({ success: false, message: 'No hay caja abierta para cerrar.' });
        }

        const caja = resSaldo.rows[0];
        const inicial = parseFloat(caja.monto_inicial);

        // Calcular movimientos GLOBALES desde la hora de apertura
        const queryMovs = `
             SELECT COALESCE(SUM(t.monto * tp.afecta_caja), 0) as total
             FROM transacciones t
             JOIN tipos_transaccion tp ON t.tipo_id = tp.id
             WHERE t.fecha_hora >= $1
        `;
        const resMovs = await pool.query(queryMovs, [caja.hora_apertura]);
        
        const movs = parseFloat(resMovs.rows[0].total);
        const saldoSistema = inicial + movs;
        const diferencia = parseFloat(monto_fisico) - saldoSistema;

        // 2. Actualizar la tabla usando el ID específico que encontramos
        const queryUpdate = `
            UPDATE aperturas_caja 
            SET fecha_cierre = CURRENT_TIMESTAMP,
                monto_final_sistema = $1,
                monto_final_real = $2,
                diferencia = $3,
                estado = 'CERRADA'
            WHERE id = $4
        `;

        await pool.query(queryUpdate, [saldoSistema, monto_fisico, diferencia, caja.id]);

        res.json({ success: true, saldoSistema, diferencia });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al cerrar' });
    }
});

// --- NUEVA TRANSACCIÓN ---
app.post('/api/transacciones', async (req, res) => {
    let { tipo_id, banco_id, descripcion, monto, usuario_nombre } = req.body;

    if (!banco_id || banco_id === "") {
        return res.status(400).json({ success: false, message: '⚠️ Error: No se ha seleccionado ningún Banco.' });
    }
    
    banco_id = parseInt(banco_id); 
    tipo_id = parseInt(tipo_id);

    try {
        const usuarioRes = await pool.query('SELECT id FROM usuarios WHERE nombre = $1', [usuario_nombre]);
        if (usuarioRes.rows.length === 0) return res.status(400).json({ success: false, message: 'Usuario no válido' });
        const usuarioId = usuarioRes.rows[0].id;

        // MODIFICADO: Chequear caja abierta solo por estado, no por fecha
        const cajaCheck = await pool.query(`
            SELECT id FROM aperturas_caja 
            WHERE estado = 'ABIERTA' 
            LIMIT 1
        `);

        if (cajaCheck.rows.length === 0) {
            return res.json({ success: false, message: 'CAJA CERRADA: Nadie ha abierto caja aún.' });
        }

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

// --- RUTA: OBTENER DATOS PARA EL REPORTE DE CIERRE (CON ORDEN EXACTO) ---
// --- RUTA: OBTENER DATOS PARA EL REPORTE DE CIERRE (CORREGIDO: GLOBAL POR DÍA) ---
app.get('/api/reporte-cierre', async (req, res) => {
    const { fecha } = req.query; // Ya no usamos 'usuario' para filtrar
    try {
        const fechaFiltro = fecha || new Date().toISOString().split('T')[0];

        // 1. Resumen Agrupado (GLOBAL)
        // Se quitó: AND u.nombre = $1
        const queryAgrupado = `
            SELECT tp.nombre as concepto, SUM(t.monto) as total_valor, COUNT(*) as cantidad
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE DATE(t.fecha_hora) = $1
            GROUP BY tp.nombre
            ORDER BY total_valor DESC
        `;
        // Pasamos solo [fechaFiltro]
        const resAgrupado = await pool.query(queryAgrupado, [fechaFiltro]);

        // 2. Detalle Ordenado (GLOBAL)
        // Se quitó: AND u.nombre = $1
        const queryDetalle = `
            SELECT 
                to_char(t.fecha_hora, 'HH12:MI AM') as hora,
                tp.nombre as tipo,
                t.descripcion,
                t.monto,
                tp.afecta_caja,
                u.nombre as usuario
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE DATE(t.fecha_hora) = $1
            ORDER BY 
                CASE 
                    WHEN tp.nombre = 'Retiro Cliente' THEN 1
                    WHEN tp.nombre = 'Depósitos o Consignación' THEN 2
                    WHEN tp.nombre = 'Recarga Nequi' THEN 2
                    WHEN tp.nombre = 'Pago Servicios Públicos' THEN 2
                    WHEN tp.nombre = 'Pago de Cartera o Crédito' THEN 2
                    WHEN tp.nombre = 'Pago Tarjeta de Crédito' THEN 2
                    WHEN tp.nombre = 'Pago Proveedor (Deuda)' THEN 3
                    WHEN tp.nombre = 'Entrada Tesorería (Fondeo)' THEN 4
                    WHEN tp.nombre = 'Retiro Oficina (Cierre)' THEN 4
                    WHEN tp.nombre = 'Ajuste / Descuadre Caja' THEN 5
                    ELSE 6
                END ASC,
                t.fecha_hora ASC
        `;
        // Pasamos solo [fechaFiltro]
        const resDetalle = await pool.query(queryDetalle, [fechaFiltro]);

        res.json({
            success: true,
            resumen: resAgrupado.rows,
            detalle: resDetalle.rows,
            fecha: fechaFiltro 
        });

    } catch (error) {
        console.error("Error en reporte cierre:", error);
        res.status(500).json({ success: false });
    }
});

// --- RESET DB ---
app.post('/api/admin/reset-db', async (req, res) => {
    const { confirmacion } = req.body;
    if (confirmacion !== 'BORRAR TODO') {
        return res.status(400).json({ success: false, message: 'Código de confirmación incorrecto.' });
    }

    try {
        const backupDir = path.join(__dirname, '../backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

        const fecha = new Date().toISOString().replace(/[:.]/g, '-');
        const archivoBackup = path.join(backupDir, `respaldo_antes_de_reset_${fecha}.sql`);

        const DB_USER = 'postgres';
        const DB_PASS = '0534';
        const DB_NAME = 'Corresponsal';

        const comandoBackup = `SET PGPASSWORD=${DB_PASS}&& pg_dump -U ${DB_USER} -h localhost -F c -b -v -f "${archivoBackup}" ${DB_NAME}`;

        exec(comandoBackup, async (error) => {
            if (error) {
                console.error(`Error en backup: ${error.message}`);
                return res.status(500).json({ success: false, message: 'Falló la copia de seguridad. No se borró nada.' });
            }

            try {
                await pool.query('TRUNCATE TABLE transacciones, aperturas_caja RESTART IDENTITY CASCADE');
                res.json({ 
                    success: true, 
                    message: 'Sistema reseteado exitosamente. Se creó un respaldo.' 
                });
            } catch (dbError) {
                res.status(500).json({ success: false, message: 'Error al vaciar las tablas.' });
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: 'Error del servidor.' });
    }
});

// --- BORRAR Y EDITAR (Restringido al día para seguridad, o se puede abrir también) ---
app.delete('/api/transacciones/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM transacciones WHERE id = $1', [id]);
        res.json({ success: true, message: 'Eliminada correctamente' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al eliminar' });
    }
});

app.put('/api/transacciones/:id', async (req, res) => {
    const { id } = req.params;
    const { monto, descripcion } = req.body;
    try {
        await pool.query(
            'UPDATE transacciones SET monto = $1, descripcion = $2 WHERE id = $3',
            [monto, descripcion, id]
        );
        res.json({ success: true, message: 'Actualizada correctamente' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al actualizar' });
    }
});

// --- REPORTES RANGO ---
app.get('/api/reportes-rango', async (req, res) => {
    const { usuario, inicio, fin, tipo } = req.query;

    try {
        if (!inicio || !fin) return res.status(400).json({ success: false, message: 'Faltan fechas' });

        let filtroTipo = "";
        // Nota: Asumimos que quieres el reporte GLOBAL (sin filtrar por usuario)
        const params = [inicio, fin]; 
        
        // --- LÓGICA PARA INTERPRETAR LA OPCIÓN UNIFICADA ---
        if (tipo && tipo !== 'TODOS') {
            if (tipo === 'PROVEEDORES') {
                // Si seleccionaron la opción amarilla, buscamos TODO lo que diga "Proveedor"
                filtroTipo = " AND tp.nombre ILIKE '%Proveedor%'";
            } else {
                // Si es cualquier otra opción normal, buscamos por su ID
                filtroTipo = " AND t.tipo_id = $3";
                params.push(tipo);
            }
        }
        // ---------------------------------------------------

        // (El resto de la consulta sigue igual...)
        const queryResumen = `
            SELECT 
                COUNT(*) as cantidad_total,
                SUM(t.monto) as volumen_negociado,
                SUM(CASE WHEN tp.afecta_caja = 1 THEN t.monto ELSE 0 END) as total_entradas,
                SUM(CASE WHEN tp.afecta_caja = -1 THEN t.monto ELSE 0 END) as total_salidas
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE t.fecha_hora::date BETWEEN $1 AND $2
              ${filtroTipo}
        `;
        // ... Ejecución de query y respuesta ...
        const resumen = await pool.query(queryResumen, params);
        
        // Consulta detalle (recuerda aplicar también el filtroTipo aquí)
        const queryDetalle = `
            SELECT 
                t.id,
                to_char(t.fecha_hora, 'YYYY-MM-DD HH12:MI AM') as fecha,
                tp.nombre as tipo,
                t.descripcion,
                t.monto,
                tp.afecta_caja,
                u.nombre as usuario
            FROM transacciones t
            JOIN tipos_transaccion tp ON t.tipo_id = tp.id
            JOIN usuarios u ON t.usuario_id = u.id
            WHERE t.fecha_hora::date BETWEEN $1 AND $2
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

// --- SALDOS BANCOS ---
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
        const bancosConSaldo = resultado.rows.map(b => ({ ...b, saldo: parseFloat(b.saldo) }));
        res.json({ success: true, bancos: bancosConSaldo });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/usuarios', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, rol FROM usuarios ORDER BY id');
        res.json({ success: true, usuarios: result.rows });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/usuarios', async (req, res) => {
    const { nombre, password, rol } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO usuarios (nombre, password_hash, rol) VALUES ($1, $2, $3)', [nombre, hash, rol]);
        res.json({ success: true, message: 'Usuario creado' });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// --- HISTORIAL DE COMPENSACIONES ---
app.get('/api/compensaciones', async (req, res) => {
    const { usuario } = req.query;
    try {
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
        res.status(500).json({ success: false });
    }
});

// --- RUTA: VERIFICAR PASSWORD ADMIN (Para abrir cajón) ---
app.post('/api/admin/verificar-password', async (req, res) => {
    const { password } = req.body;
    try {
        // 1. Buscamos las contraseñas de TODOS los administradores
        const result = await pool.query("SELECT password_hash FROM usuarios WHERE rol = 'admin'");
        
        let accesoConcedido = false;

        // 2. Probamos la clave ingresada contra cada administrador encontrado
        for (const user of result.rows) {
            const match = await bcrypt.compare(password, user.password_hash);
            if (match) {
                accesoConcedido = true;
                break; // ¡Encontramos coincidencia!
            }
        }

        if (accesoConcedido) {
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Contraseña incorrecta' });
        }

    } catch (error) {
        console.error('Error verificando admin:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// --- RUTA: ABRIR CAJÓN (CON AUTENTICACIÓN) ---
app.post('/api/admin/abrir-cajon', (req, res) => {
    const { exec } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    const tempFile = path.join(__dirname, 'temp_cajon.bin');
    // Código Epson: ESC p 0 25 250
    const comandoApertura = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);

    try {
        fs.writeFileSync(tempFile, comandoApertura);

        // DATOS DE CONEXIÓN (Modifica si cambiaste usuario/clave)
        const IP = "192.168.0.254"; 
        const IMPRESORA = "IMPREPOS";
        const USUARIO = "cajero";
        const CLAVE = "1234";
        
        const rutaRed = `\\\\${IP}\\${IMPRESORA}`;

        // COMANDO TRIPLE:
        // 1. Borrar conexiones viejas (para evitar conflictos)
        // 2. Conectar usando el usuario y clave
        // 3. Copiar el archivo
        const comandoCMD = `NET USE "${rutaRed}" /DELETE /Y & NET USE "${rutaRed}" "${CLAVE}" /USER:"${USUARIO}" & COPY /B "${tempFile}" "${rutaRed}"`;

        console.log("Autenticando y enviando...");

        exec(comandoCMD, { windowsHide: true }, (error, stdout, stderr) => {
            try { fs.unlinkSync(tempFile); } catch(e){} 

            if (error) {
                console.error('Error:', error.message);
                if (!res.headersSent) {
                    return res.status(500).json({ success: false, message: 'Error de autenticación: ' + error.message });
                }
                return;
            }

            console.log("Resultado:", stdout);
            if (!res.headersSent) {
                res.json({ success: true, message: 'Cajón abierto con autenticación' });
            }
        });

    } catch (e) {
        console.error(e);
        if (!res.headersSent) res.status(500).json({ success: false });
    }
});

// ==========================================
// GESTIÓN DE USUARIOS (CORRESPONSAL)
// ==========================================

// ELIMINAR USUARIO
// ==========================================
// RUTAS FALTANTES PARA GESTIÓN DE USUARIOS
// ==========================================

// 1. ELIMINAR USUARIO
app.delete('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        res.json({ success: true, message: 'Usuario eliminado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al eliminar usuario' });
    }
});

// 2. CAMBIAR CONTRASEÑA
app.put('/api/usuarios/:id/clave', async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    
    try {
        // Encriptamos la nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        
        await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, id]);
        res.json({ success: true, message: 'Contraseña actualizada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error al actualizar contraseña' });
    }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});