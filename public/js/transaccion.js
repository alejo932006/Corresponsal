// ==========================================
// CONFIGURACIÓN GLOBAL Y VARIABLES
// ==========================================
let carritoCliente = []; // Lista temporal de operaciones del cliente actual
let totalGlobal = 0;     // Total a cobrar al cliente actual
let todosLosTipos = [];  // Para guardar la configuración de tipos
let baseActual = 0;      // Para el control de caja (ajustes)

document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar Usuario
    const usuario = localStorage.getItem('usuario_nombre') || 'Usuario';
    document.getElementById('nombreUsuario').textContent = usuario;

    // 2. Cargas Iniciales
    cargarOpciones();        // Bancos y Tipos
    cargarBaseCaja();        // Dinero en efectivo y Seguridad (Caja Abierta)
    cargarMisMovimientos();  // Historial del día (Tabla de abajo)
    cargarSaldosBancos();
    aplicarPermisosRol();
    // 3. Configurar Inputs de Dinero (Formato visual)
    configurarInputMoneda('inputMontoVisual', 'inputMonto');
    configurarInputMoneda('inputPagaCon', 'inputPagaConHidden');

    // 4. EVENTOS DE LA INTERFAZ POS (NUEVO)
    
    // Botón: AGREGAR A LA LISTA (Reemplaza al submit directo)
    document.getElementById('btnAgregar').addEventListener('click', agregarAlCarrito);

    // Botón: COBRAR / FINALIZAR (Abre el modal)
    document.getElementById('btnFinalizar').addEventListener('click', abrirModalCobro);

    // Botón: CONFIRMAR TODO (Guarda en Base de Datos)
    document.getElementById('btnConfirmarTodo').addEventListener('click', guardarTodasLasOperaciones);

    // Botón: Limpiar Lista (Cancelar cliente actual)
    document.getElementById('btnLimpiarLista').addEventListener('click', () => {
        if(confirm("¿Borrar toda la lista del cliente actual?")) {
            carritoCliente = [];
            renderizarCarrito();
        }
    });

    // Eventos del Modal
    document.getElementById('btnCancelarModal').addEventListener('click', () => {
        document.getElementById('modalCobro').style.display = 'none';
    });
    
    // Cálculo de devuelta en tiempo real
    document.getElementById('inputPagaCon').addEventListener('input', calcularDevueltaEnModal);

    // 5. EVENTOS DEL FORMULARIO (EXISTENTES)
    
    // Filtro de Categoría (Radio Buttons)
    const radiosCategoria = document.querySelectorAll('input[name="categoria"]');
    radiosCategoria.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const categoriaSeleccionada = e.target.value;
            filtrarTipos(categoriaSeleccionada);
        });
    });
});

// ==========================================
// LÓGICA DEL CARRITO (POS)
// ==========================================

function agregarAlCarrito() {
    // 1. VALIDACIÓN ESTRICTA DE BANCO (NUEVO)
    const bancoId = document.getElementById('selectBanco').value;
    if (!bancoId || bancoId === "") {
        alert("⚠️ ¡Alto ahí!\n\nDebes seleccionar un BANCO (haz clic en el logo del banco).");
        return; // Detiene la función, no agrega nada.
    }

    // 2. Validar Monto
    const monto = parseInt(document.getElementById('inputMonto').value);
    if (!monto || monto <= 0) {
        alert("⚠️ Por favor ingresa un monto válido.");
        document.getElementById('inputMontoVisual').focus();
        return;
    }

    // 3. Obtener el resto de datos
    const bancoElemento = document.querySelector(`.bank-option[data-id="${bancoId}"]`);
    const bancoNombre = bancoElemento ? bancoElemento.querySelector('.bank-name').innerText : 'Banco';
    
    const tipoSelect = document.getElementById('selectTipo');
    const tipoId = tipoSelect.value;
    const tipoNombre = tipoSelect.options[tipoSelect.selectedIndex].text;
    
    const categoria = document.querySelector('input[name="categoria"]:checked').value;
    const desc = document.getElementById('inputDesc').value;

    // 4. Crear objeto
    const operacion = {
        id_temp: Date.now(),
        banco_id: bancoId,
        banco_nombre: bancoNombre,
        tipo_id: tipoId,
        tipo_nombre: tipoNombre,
        categoria: categoria,
        monto: monto,
        descripcion: desc
    };

    // 5. Agregar y limpiar
    carritoCliente.push(operacion);
    
    document.getElementById('inputMonto').value = '';
    document.getElementById('inputMontoVisual').value = '';
    document.getElementById('inputDesc').value = '';
    document.getElementById('inputMontoVisual').focus(); 

    renderizarCarrito();
}

function renderizarCarrito() {
    const contenedor = document.getElementById('listaOperaciones');
    const lblTotal = document.getElementById('lblTotalCliente');
    const btnFinalizar = document.getElementById('btnFinalizar');
    
    // Elemento opcional: contador de ítems en el header del carrito (si lo tienes en el HTML)
    // const badgeCount = document.querySelector('.cart-header .cart-count'); 

    contenedor.innerHTML = '';
    totalGlobal = 0;

    // Formateador de moneda (Pesos Colombianos sin decimales)
    const formato = new Intl.NumberFormat('es-CO', { 
        style: 'currency', 
        currency: 'COP', 
        maximumFractionDigits: 0 
    });

    // --- 1. ESTADO VACÍO (EMPTY STATE) ---
    if (carritoCliente.length === 0) {
        contenedor.innerHTML = `
            <div class="empty-state" style="text-align:center; color:#95a5a6; margin-top:60px;">
                <span style="font-size:3rem; display:block; opacity:0.5; margin-bottom:10px;">🛒</span>
                <p style="font-weight:600; margin:0;">El carrito está vacío</p>
                <small>Agrega operaciones desde el panel izquierdo</small>
            </div>
        `;
        
        lblTotal.textContent = '$ 0';
        btnFinalizar.disabled = true;
        btnFinalizar.style.opacity = '0.6'; // Efecto visual de deshabilitado
        btnFinalizar.style.cursor = 'not-allowed';
        return;
    }

    // --- 2. GENERAR ÍTEMS ---
    carritoCliente.forEach((op, index) => {
        
        // A. Lógica de Suma/Resta
        const esIngreso = op.categoria === 'RECAUDO'; // Asumo que 'RECAUDO' es entrada de dinero
        
        if (esIngreso) {
            totalGlobal += parseFloat(op.monto);
        } else {
            totalGlobal -= parseFloat(op.monto);
        }

        // B. Estilos Dinámicos
        const colorBorde = esIngreso ? '#2ecc71' : '#e74c3c'; // Verde o Rojo
        const signo = esIngreso ? '+' : '-';
        const colorTexto = esIngreso ? '#27ae60' : '#c0392b';
        const textoCategoria = esIngreso ? 'INGRESO' : 'RETIRO';

        // C. Crear la Tarjeta HTML
        const item = document.createElement('div');
        item.className = 'cart-item'; // Usamos la clase CSS nueva
        
        // Aplicamos estilos base en línea por seguridad (para garantizar el look moderno)
        item.style.cssText = `
            background: white;
            padding: 15px;
            border-radius: 12px;
            margin-bottom: 12px;
            box-shadow: 0 3px 8px rgba(0,0,0,0.04);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-left: 5px solid ${colorBorde}; /* La línea de color lateral */
            transition: transform 0.2s;
        `;

        item.innerHTML = `
            <div class="item-info" style="display:flex; flex-direction:column; gap:2px;">
                <span class="item-type" style="font-weight:bold; font-size:0.95rem; color:#2d3436;">
                    ${op.tipo_nombre}
                </span>
                <small style="color:#7f8c8d; font-size:0.8rem;">${op.banco_nombre}</small>
                <span class="item-desc" style="font-size:0.85rem; color:#95a5a6; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${op.descripcion || 'Sin referencia'}
                </span>
            </div>
            
            <div style="display:flex; align-items:center; gap:15px;">
                <div class="item-price" style="text-align:right;">
                    <div style="font-weight:800; font-size:1.1rem; color:${colorTexto};">
                        ${signo} ${formato.format(op.monto)}
                    </div>
                    <small style="font-size:0.65rem; color:#aaa; font-weight:bold;">${textoCategoria}</small>
                </div>
                
                <button onclick="eliminarDelCarrito(${index})" class="btn-delete-item" title="Eliminar del carrito" style="
                    background: #ffebee;
                    color: #e74c3c;
                    border: none;
                    width: 35px; height: 35px;
                    border-radius: 50%;
                    display: flex; justify-content: center; align-items: center;
                    cursor: pointer;
                    font-size: 1rem;
                    transition: all 0.2s;">
                    🗑️
                </button>
            </div>
        `;
        
        contenedor.appendChild(item);
    });

    // --- 3. ACTUALIZAR TOTALES ---
    lblTotal.textContent = formato.format(totalGlobal);
    
    // Reactivar botón
    btnFinalizar.disabled = false;
    btnFinalizar.style.opacity = '1';
    btnFinalizar.style.cursor = 'pointer';
}

function eliminarDelCarrito(index) {
    // Eliminar del array
    carritoCliente.splice(index, 1);
    
    // Volver a dibujar todo (para recalcular totales y reordenar índices)
    renderizarCarrito();
}

// ==========================================
// MODAL DE COBRO Y GUARDADO
// ==========================================

function abrirModalCobro() {
    const modal = document.getElementById('modalCobro');
    const displayTotal = document.getElementById('modalTotal');
    
    displayTotal.textContent = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(totalGlobal);
    
    // Resetear campos
    document.getElementById('inputPagaCon').value = '';
    document.getElementById('inputPagaConHidden').value = '';
    document.getElementById('modalDevuelta').textContent = '$ 0';

    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('inputPagaCon').focus(), 100);
}

function calcularDevueltaEnModal() {
    const pagado = parseInt(document.getElementById('inputPagaConHidden').value) || 0;
    const devuelta = pagado - totalGlobal;
    
    const display = document.getElementById('modalDevuelta');
    const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    if (devuelta >= 0) {
        display.style.color = '#27ae60'; // Verde
        display.textContent = fmt.format(devuelta);
    } else {
        display.style.color = '#e74c3c'; // Rojo (Falta)
        display.textContent = "Faltan " + fmt.format(Math.abs(devuelta));
    }
}

async function guardarTodasLasOperaciones() {
    const btn = document.getElementById('btnConfirmarTodo');
    const usuario_nombre = localStorage.getItem('usuario_nombre');
    
    btn.disabled = true;
    btn.textContent = "Procesando...";

    try {
        // Enviar operaciones una por una
        for (const op of carritoCliente) {
            const payload = {
                banco_id: op.banco_id,
                tipo_id: op.tipo_id,
                monto: op.monto,
                descripcion: op.descripcion,
                usuario_nombre: usuario_nombre
            };

            const response = await fetch('/api/transacciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            if (!data.success) {
                // Si falla una, alertamos y paramos (o podrías manejarlo diferente)
                throw new Error(`Error en operación de ${op.banco_nombre}: ${data.message}`);
            }
        }

        // Si todo sale bien
        alert('✅ ¡Cliente procesado correctamente!');
        
        // Limpieza y cierre
        carritoCliente = [];
        renderizarCarrito();
        document.getElementById('modalCobro').style.display = 'none';
        
        // Resetear formulario completo
        document.getElementById('formTransaccion').reset();
        document.querySelectorAll('.bank-option').forEach(b => b.classList.remove('selected'));
        document.getElementById('groupTipo').style.display = 'none';

        // Actualizar datos de fondo
        cargarBaseCaja();
        cargarMisMovimientos();

    } catch (error) {
        console.error(error);
        alert('Hubo un error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "✅ CONFIRMAR Y GUARDAR";
    }
}

// ==========================================
// FUNCIONES AUXILIARES Y CARGAS (Tu código mejorado)
// ==========================================

async function cargarOpciones() {
    try {
        const res = await fetch('/api/config-formulario');
        const data = await res.json();

        if (data.success) {
            // A. CARGAR BANCOS (IGUAL QUE ANTES)
            const grid = document.getElementById('gridBancos');
            const hiddenInput = document.getElementById('selectBanco');
            grid.innerHTML = '';

            data.bancos.forEach(banco => {
                const div = document.createElement('div');
                div.className = 'bank-option';
                div.setAttribute('data-id', banco.id); 
                
                // Iconos
                let icon = '🏦';
                const n = banco.nombre.toLowerCase();
                if(n.includes('bancolombia')) icon = '🟨';
                else if(n.includes('nequi')) icon = '📱';
                else if(n.includes('daviplata')) icon = '🔴';
                else if(n.includes('bogota')) icon = '🔵';

                div.innerHTML = `
                    <span class="bank-icon">${icon}</span>
                    <span class="bank-name">${banco.nombre}</span>
                `;

                div.addEventListener('click', () => {
                    document.querySelectorAll('.bank-option').forEach(b => b.classList.remove('selected'));
                    div.classList.add('selected');
                    hiddenInput.value = banco.id;
                });

                grid.appendChild(div);
            });

            // B. GUARDAR TIPOS Y FILTRAR INMEDIATAMENTE (ESTO ES LO NUEVO)
            todosLosTipos = data.tipos;

            // Buscamos cuál radio está marcado por defecto (generalmente RECAUDO)
            const radioActivo = document.querySelector('input[name="categoria"]:checked');
            if (radioActivo) {
                // Forzamos la carga de la lista
                filtrarTipos(radioActivo.value);
            }
        }
    } catch (error) {
        console.error('Error cargando opciones:', error);
    }
}

function filtrarTipos(categoria) {
    const selectTipo = document.getElementById('selectTipo');
    const divTipo = document.getElementById('groupTipo');

    selectTipo.innerHTML = '<option value="">Seleccione una opción...</option>';

    const tiposFiltrados = todosLosTipos.filter(t => t.categoria === categoria);

    tiposFiltrados.forEach(tipo => {
        const opt = document.createElement('option');
        opt.value = tipo.id;
        opt.textContent = tipo.nombre;
        selectTipo.appendChild(opt);
    });

    divTipo.style.display = 'block';
    divTipo.classList.add('animate-fade');
}

// Formato de Dinero (Input Visual -> Hidden)
function configurarInputMoneda(idVisual, idHidden) {
    const visual = document.getElementById(idVisual);
    const hidden = document.getElementById(idHidden);

    if(!visual || !hidden) return;

    visual.addEventListener('input', (e) => {
        let valor = e.target.value.replace(/\D/g, '');
        if (valor === '') {
            hidden.value = '';
            e.target.value = '';
        } else {
            hidden.value = valor;
            e.target.value = new Intl.NumberFormat('es-CO', { 
                style: 'currency', 
                currency: 'COP', 
                maximumFractionDigits: 0 
            }).format(valor);
        }
    });
}

// ==========================================
// SEGURIDAD Y CONTROL DE CAJA (Tu código existente)
// ==========================================

async function cargarBaseCaja() {
    const usuario = localStorage.getItem('usuario_nombre');
    try {
        const res = await fetch(`/api/base-caja?usuario=${usuario}`);
        const data = await res.json();

        if (data.success) {
            // BLOQUEO DE SEGURIDAD
            if (!data.cajaAbierta) {
                alert("⚠️ ATENCIÓN: No has realizado la APERTURA DE CAJA hoy.\n\nEl sistema te redirigirá para que ingreses la base inicial.");
                window.location.href = 'caja.html';
                return;
            }

            const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
            baseActual = data.base; 
            
            // Actualizar widget si existe en el HTML
            const txtBase = document.getElementById('txtBaseActual');
            if(txtBase) {
                txtBase.textContent = formato.format(data.base);
                document.getElementById('txtBaseInicial').textContent = `Base Inicial: ${formato.format(data.baseInicial)}`;
            }
        }
    } catch (error) { console.error(error); }
}

async function cargarMisMovimientos() {
    const usuario = localStorage.getItem('usuario_nombre');
    const container = document.getElementById('listaMovimientos');
    // Si no existe el contenedor (porque cambiamos el HTML), no hacemos nada
    if(!container) return;

    try {
        const res = await fetch(`/api/mis-movimientos?usuario=${usuario}`);
        const data = await res.json();

        if (data.success) {
            container.innerHTML = ''; 
            const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
            
            if (data.movimientos.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding: 20px; color: #a0aec0;">Sin movimientos hoy</div>';
                return;
            }

            data.movimientos.forEach(mov => {
                let icon = '📄';
                if(mov.tipo.includes('Nequi')) icon = '📱';
                else if(mov.tipo.includes('Retiro')) icon = '💸';

                const div = document.createElement('div');
                div.className = 'feed-item';
                div.innerHTML = `
                    <div class="feed-left">
                        <span class="feed-time">${mov.hora}</span>
                        <div class="feed-info">
                            <h4>${icon} ${mov.tipo}</h4>
                            <p>${mov.descripcion}</p>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div class="feed-amount">${formato.format(mov.monto)}</div>
                        <div style="margin-top:5px;">
                            <button onclick="editarTx(${mov.id}, '${mov.descripcion}', ${mov.monto})" style="cursor:pointer; border:none; color:#3498db;" title="Editar">✏️</button>
                            <button onclick="eliminarTx(${mov.id})" style="cursor:pointer; border:none; color:red;" title="Eliminar">🗑️</button>
                        </div>
                    </div>
                `;
                container.appendChild(div);
            });
            
            // Actualizar contadores si existen
            const badge = document.getElementById('contadorMovimientos');
            if(badge) badge.textContent = data.movimientos.length;
        }
    } catch (error) { console.error("Error historial:", error); }
}

// Funciones de Edición/Eliminación (Se mantienen igual)
async function eliminarTx(id) {
    if(!confirm("¿Estás seguro de ELIMINAR esta transacción?")) return;
    try {
        const res = await fetch(`/api/transacciones/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            alert("🗑️ Eliminada");
            cargarMisMovimientos();
            cargarBaseCaja();
        } else { alert("Error: " + data.message); }
    } catch (e) { alert("Error de conexión"); }
}

async function editarTx(id, descActual, montoActual) {
    const nuevoMonto = prompt("Editar Monto:", montoActual);
    if (nuevoMonto === null) return;
    const nuevaDesc = prompt("Editar Descripción:", descActual);
    if (nuevaDesc === null) return;

    try {
        const res = await fetch(`/api/transacciones/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monto: parseFloat(nuevoMonto), descripcion: nuevaDesc })
        });
        if ((await res.json()).success) {
            alert("✅ Actualizada");
            cargarMisMovimientos();
            cargarBaseCaja();
        }
    } catch (e) { alert("Error de conexión"); }
}

// Ajuste de Base (Se mantiene)
async function ajustarBase() {
    const realStr = prompt(`El sistema dice: $${baseActual}\n\n¿Cuánto dinero hay FÍSICAMENTE?`);
    if (!realStr) return;
    const real = parseFloat(realStr);
    const diferencia = real - baseActual;

    if (diferencia === 0) return alert("¡La caja cuadra perfectamente!");

    if (confirm(`Diferencia: ${diferencia > 0 ? "SOBRAN" : "FALTAN"} $${Math.abs(diferencia)}.\n\n¿Crear ajuste automático?`)) {
        // ID TIPO AJUSTE (Asegúrate de que sea correcto en tu BD)
        const ID_TIPO_AJUSTE = 10; 
        const usuario = localStorage.getItem('usuario_nombre');

        await fetch('/api/transacciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo_id: ID_TIPO_AJUSTE, 
                banco_id: 1, 
                monto: diferencia, 
                descripcion: `Ajuste (Sistema: ${baseActual} vs Físico: ${real})`,
                usuario_nombre: usuario
            })
        });
        alert("Ajuste realizado.");
        cargarBaseCaja();
        cargarMisMovimientos();
    }
}

async function cargarSaldosBancos() {
    const container = document.getElementById('listaSaldosBancos');
    if(!container) return;

    try {
        // IMPORTANTE: Debe apuntar a /api/bancos-saldos (No a config-formulario)
        const res = await fetch('/api/bancos-saldos'); 
        
        if (!res.ok) throw new Error("No se encontró la ruta de saldos");

        const data = await res.json();

        if (data.success) {
            container.innerHTML = '';
            
            data.bancos.forEach(banco => {
                // Protección contra NaN: Si saldo es null o invalido, usar 0
                const saldoActual = isNaN(parseFloat(banco.saldo)) ? 0 : parseFloat(banco.saldo);
                
                // Formato moneda
                const saldoTexto = new Intl.NumberFormat('es-CO', { 
                    style: 'currency', currency: 'COP', maximumFractionDigits: 0 
                }).format(saldoActual);

                // Iconos
                let icon = '🏦';
                const n = banco.nombre.toLowerCase();
                if(n.includes('bancolombia')) icon = '🟨';
                if(n.includes('nequi')) icon = '📱';
                if(n.includes('daviplata')) icon = '🔴';
                if(n.includes('bogota')) icon = '🔵';

                const div = document.createElement('div');
                div.className = 'saldo-item';
                div.innerHTML = `
                    <div class="bank-info-row">
                        <span class="bank-mini-icon">${icon}</span>
                        <span class="bank-name-small">${banco.nombre}</span>
                    </div>
                    <div class="saldo-actions">
                        <span class="monto-saldo">${saldoTexto}</span>
                        <button class="btn-adjust-mini" onclick="ajustarCupoBanco(${banco.id}, '${banco.nombre}', ${saldoActual})">⚙️</button>
                    </div>
                `;
                container.appendChild(div);
            });
        }
    } catch (error) {
        console.error("Error cargando saldos:", error);
        container.innerHTML = '<div class="loading-text" style="color:red">Error de conexión (Revise app.js)</div>';
    }
}

async function ajustarCupoBanco(bancoId, nombreBanco, saldoActual) {
    // 1. Preguntar el valor REAL
    const nuevoValorStr = prompt(`Ajuste de Cupo - ${nombreBanco}\n\nEl sistema dice: $${saldoActual}\n\n¿Cuánto dinero hay REALMENTE en la plataforma?`);
    
    if (nuevoValorStr === null) return; // Cancelado
    
    const nuevoValor = parseInt(nuevoValorStr.replace(/\D/g, '')); // Limpiar símbolos
    if (isNaN(nuevoValor)) return alert("Por favor ingresa un número válido.");

    const diferencia = nuevoValor - saldoActual;

    if (diferencia === 0) return alert("El saldo está cuadrado, no es necesario ajustar.");

    // 2. Determinar si es un ajuste positivo o negativo
    const tipoAjuste = diferencia > 0 ? 'SOBRANTE' : 'FALTANTE';
    const mensajeConfirmacion = `Vas a ajustar el saldo de ${nombreBanco}.\n\n` +
                                `Sistema: ${saldoActual}\n` +
                                `Real: ${nuevoValor}\n` +
                                `Diferencia: ${diferencia > 0 ? '+' : ''}${diferencia}\n\n` +
                                `¿Confirmar ajuste?`;

    if (!confirm(mensajeConfirmacion)) return;

    // 3. Enviar transacción de ajuste
    try {
        const usuario = localStorage.getItem('usuario_nombre');
        
        // IMPORTANTE: Necesitas un ID de tipo de transacción para "AJUSTE DE CUPO" en tu base de datos.
        // Asumiremos que el ID 99 es "Ajuste Contable" (Crea este tipo en tu BD si no existe).
        const ID_TIPO_AJUSTE = 11; // <--- CAMBIA ESTO POR EL ID REAL DE TU TIPO "AJUSTE" O "CUADRE"

        // Si la diferencia es positiva, entra dinero al banco (RECAUDO interno).
        // Si es negativa, sale dinero (TESORERIA interna).
        // Sin embargo, para simplificar, enviaremos el monto tal cual y el backend sumará algebraicamente.
        
        // Truco: Para ajustar, insertamos una transacción por la diferencia exacta.
        
        const payload = {
            banco_id: bancoId,
            tipo_id: ID_TIPO_AJUSTE, 
            monto: Math.abs(diferencia), // Enviamos siempre positivo, la categoría define si suma o resta
            categoria: diferencia > 0 ? 'RECAUDO' : 'TESORERIA', // Recaudo suma al banco, Tesoreria resta
            descripcion: `Ajuste de Cupo (Manual): ${saldoActual} -> ${nuevoValor}`,
            usuario_nombre: usuario
        };

        const res = await fetch('/api/transacciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (data.success) {
            alert("✅ Ajuste realizado con éxito.");
            cargarSaldosBancos(); // Recargar la lista visual
        } else {
            alert("❌ Error: " + data.message);
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión al ajustar.");
    }
}

function aplicarPermisosRol() {
    const rol = localStorage.getItem('usuario_rol');

    if (rol !== 'admin') {
        // 1. Ocultar botones de Ajustar Base y Cupo
        const botonesAjuste = document.querySelectorAll('.btn-mini-tool, .btn-adjust-mini, .btn-adjust');
        botonesAjuste.forEach(btn => btn.style.display = 'none');

        // 2. Ocultar botones de Eliminar/Editar en el historial
        // Como el historial se carga dinámicamente, usaremos CSS para ocultarlos 
        // o modificaremos la función cargarMisMovimientos.
        
        // Forma rápida vía CSS inyectado:
        const style = document.createElement('style');
        style.innerHTML = `
            .btn-delete-item, button[title="Eliminar"], button[title="Editar"] { 
                display: none !important; 
            }
        `;
        document.head.appendChild(style);
        
        // 3. Ocultar enlace a Usuarios en el menú
        const linkUsuarios = document.getElementById('linkUsuarios');
        if(linkUsuarios) linkUsuarios.style.display = 'none';
    }
}