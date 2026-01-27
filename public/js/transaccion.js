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
    // aplicarPermisosRol();
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

    // --- NUEVO: EVENTO BOTÓN ABRIR CAJÓN ---
    const btnCajon = document.getElementById('btnAbrirCajon');
    if (btnCajon) {
        btnCajon.addEventListener('click', async () => {
            // 1. Pedir contraseña
            const password = prompt("🔒 SEGURIDAD\n\nEsta acción requiere autorización.\nIngrese contraseña de Administrador:");
            
            if (!password) return; // Si cancela, no hacemos nada

            try {
                // 2. Verificar con el servidor
                const res = await fetch('/api/admin/verificar-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });

                const data = await res.json();

                if (data.success) {
                    // 3. ¡Si es correcto, disparamos el cajón!
                    abrirCajonMonedero();
                } else {
                    alert("⛔ ACCESO DENEGADO: Contraseña incorrecta.");
                }

            } catch (error) {
                console.error(error);
                alert("Error de conexión verificando permisos.");
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        // Si presiona ENTER y está en el input de monto o descripción -> Agregar
        if (e.key === 'Enter') {
            const foco = document.activeElement;
            if (foco.id === 'inputMontoVisual' || foco.id === 'inputDesc') {
                e.preventDefault();
                agregarAlCarrito();
            }
        }
    
        // Si presiona F2 -> Finalizar / Cobrar
        if (e.key === 'F2') {
            e.preventDefault();
            // Solo si hay algo en el carrito
            if(carritoCliente.length > 0) abrirModalCobro();
        }
        
        // Si presiona ESC -> Cerrar Modales
        if (e.key === 'Escape') {
            document.getElementById('modalCobro').style.display = 'none';
            document.getElementById('modalTipos').style.display = 'none';
            document.getElementById('modalHistorial').style.display = 'none';
        }
    });

    // EFECTO DE ONDA EXPANSIVA (RIPPLE)
    document.getElementById('btnAgregar').addEventListener('click', function(e) {
        const button = e.currentTarget;

        // 1. Crear el elemento círculo
        const circle = document.createElement('span');
        const diameter = Math.max(button.clientWidth, button.clientHeight);
        const radius = diameter / 2;

        // 2. Calcular posición exacta del clic dentro del botón
        const rect = button.getBoundingClientRect();
        circle.style.width = circle.style.height = `${diameter}px`;
        circle.style.left = `${e.clientX - rect.left - radius}px`;
        circle.style.top = `${e.clientY - rect.top - radius}px`;
        
        // 3. Agregar clase para animar
        circle.classList.add('ripple');

        // 4. Limpiar ondas viejas (opcional, para mantener el DOM limpio)
        const ripple = button.getElementsByClassName('ripple')[0];
        if (ripple) {
            ripple.remove();
        }

        // 5. Insertar en el botón
        button.appendChild(circle);
    });

    // Activar el input al hacer clic en el contenedor (icono o label)
    const grupoDesc = document.querySelector('.input-group-desc');
    if(grupoDesc){
        grupoDesc.addEventListener('click', () => {
            document.getElementById('inputDesc').focus();
        });
    }
        
});

// ==========================================
// LÓGICA DEL CARRITO (POS)
// ==========================================

function agregarAlCarrito() {
    
    // 1. VALIDACIÓN BANCO
    const bancoId = document.getElementById('selectBanco').value;
    if (!bancoId) return alert("Seleccione un Banco");

    // 2. VALIDACIÓN TIPO (NUEVA LÓGICA MODAL)
    const tipoId = document.getElementById('inputTipoSeleccionado').value;
    const categoria = document.getElementById('inputCategoriaSeleccionada').value;

    if (!tipoId) {
        alert("⚠️ Por favor selecciona un TIPO DE OPERACIÓN (Botones Ingreso/Salida).");
        return;
    }

    // 3. VALIDACIÓN MONTO
    const monto = parseInt(document.getElementById('inputMonto').value);
    if (!monto || monto <= 0) {
        alert("⚠️ Ingresa un monto válido.");
        document.getElementById('inputMontoVisual').focus();
        return;
    }

    // --- Obtener Nombres para mostrar en carrito ---
    const bancoElemento = document.querySelector(`.bank-option[data-id="${bancoId}"]`);
    const bancoNombre = bancoElemento ? bancoElemento.querySelector('.bank-name').innerText : 'Banco';
    
    // Buscar nombre del tipo en el array global
    const tipoObj = todosLosTipos.find(t => t.id == tipoId);
    const tipoNombre = tipoObj ? tipoObj.nombre : 'Operación';
    
    const desc = document.getElementById('inputDesc').value;

    // 4. CREAR OBJETO
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

    // 5. AGREGAR Y LIMPIAR
    carritoCliente.push(operacion);
    
    // Limpieza de campos visuales
    document.getElementById('inputMonto').value = '';
    document.getElementById('inputMontoVisual').value = '';
    document.getElementById('inputDesc').value = '';
    
    // Limpieza de la selección del tipo (usando tu función auxiliar)
    limpiarSeleccionTipo(); 

    // Enfocar de nuevo el monto para agilidad
    document.getElementById('inputMontoVisual').focus(); 

    renderizarCarrito();
}

function renderizarCarrito() {
    const contenedor = document.getElementById('listaOperaciones');
    const lblTotal = document.getElementById('lblTotalCliente');
    const btnFinalizar = document.getElementById('btnFinalizar');
    
    contenedor.innerHTML = '';
    totalGlobal = 0;

    const formato = new Intl.NumberFormat('es-CO', { 
        style: 'currency', 
        currency: 'COP', 
        maximumFractionDigits: 0 
    });

    // --- 1. ESTADO VACÍO ---
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
        btnFinalizar.style.opacity = '0.6';
        btnFinalizar.style.cursor = 'not-allowed';
        return;
    }

    // --- 2. GENERAR ÍTEMS ---
    carritoCliente.forEach((op, index) => {
        
        // === LA CORRECCIÓN MÁGICA AQUÍ ===
        // Detectamos si el nombre incluye "Fondeo" o "Entrada" para tratarlo como positivo
        const nombreOp = op.tipo_nombre.toLowerCase();
        const esFondeo = nombreOp.includes('fondeo') || nombreOp.includes('entrada tesorería');

        // Es Ingreso si la categoría es RECAUDO ... O ... si es este caso especial de Fondeo
        const esIngreso = op.categoria === 'RECAUDO' || esFondeo; 
        
        // A. Lógica de Suma/Resta
        if (esIngreso) {
            totalGlobal += parseFloat(op.monto);
        } else {
            totalGlobal -= parseFloat(op.monto);
        }

        // B. Estilos Dinámicos
        const colorBorde = esIngreso ? '#2ecc71' : '#e74c3c'; // Verde o Rojo
        const signo = esIngreso ? '+' : '-';
        const colorTexto = esIngreso ? '#27ae60' : '#c0392b';
        
        // Etiqueta bonita
        let textoCategoria = op.categoria === 'RECAUDO' ? 'INGRESO' : 'RETIRO';
        if (esFondeo) textoCategoria = 'FONDEO (Entrada)'; // Etiqueta especial

        // C. Crear la Tarjeta HTML
        const item = document.createElement('div');
        item.className = 'cart-item'; 
        
        item.style.cssText = `
            background: white;
            padding: 15px;
            border-radius: 12px;
            margin-bottom: 12px;
            box-shadow: 0 3px 8px rgba(0,0,0,0.04);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-left: 5px solid ${colorBorde};
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
                    <small style="font-size:0.65rem; color:#aaa; font-weight:bold; text-transform:uppercase;">${textoCategoria}</small>
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
        abrirCajonMonedero();
        // Limpieza y cierre
        carritoCliente = [];
        renderizarCarrito();
        document.getElementById('modalCobro').style.display = 'none';
        
        // Resetear formulario completo
        document.getElementById('formTransaccion').reset();
        document.querySelectorAll('.bank-option').forEach(b => b.classList.remove('selected'));

        // Actualizar datos de fondo
        limpiarSeleccionTipo();
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
            // 1. CARGAR BANCOS
            const grid = document.getElementById('gridBancos');
            const hiddenInput = document.getElementById('selectBanco');
            grid.innerHTML = '';

            data.bancos.forEach(banco => {
                const div = document.createElement('div');
                div.className = 'bank-option';
                div.setAttribute('data-id', banco.id);
                
                let icon = '🏦';
                const n = banco.nombre.toLowerCase();
                
                // Asignar iconos
                if(n.includes('bancolombia')) icon = '🟨';
                else if(n.includes('nequi')) icon = '📱';
                else if(n.includes('daviplata')) icon = '🔴';
                else if(n.includes('bogota')) icon = '🔵';

                div.innerHTML = `<span class="bank-icon">${icon}</span><span class="bank-name">${banco.nombre}</span>`;

                // Evento Click Manual
                div.addEventListener('click', () => {
                    document.querySelectorAll('.bank-option').forEach(b => b.classList.remove('selected'));
                    div.classList.add('selected');
                    hiddenInput.value = banco.id;
                });

                grid.appendChild(div);

                // --- NUEVO: AUTO-SELECCIONAR BANCOLOMBIA ---
                // Si el nombre contiene "bancolombia", lo seleccionamos de una vez
                if (n.includes('bancolombia')) {
                    div.classList.add('selected'); // Marcado visual
                    hiddenInput.value = banco.id;  // Valor lógico
                }
            });

            // 2. GUARDAR TIPOS EN MEMORIA
            todosLosTipos = data.tipos;
            renderizarBotonesTipos(); // (Si estás usando la versión de botones que hicimos antes)
        }
    } catch (error) { console.error(error); }
}

// NUEVA FUNCIÓN AUXILIAR PARA DIBUJAR LOS BOTONES
function renderizarBotonesTipos() {
    const contenedorIngreso = document.getElementById('listaTiposIngreso');
    const contenedorEgreso = document.getElementById('listaTiposEgreso');
    
    // Limpiar contenedores
    contenedorIngreso.innerHTML = '';
    contenedorEgreso.innerHTML = '';

    todosLosTipos.forEach(tipo => {
        const btn = document.createElement('div'); // Usamos div para estilo personalizado
        btn.className = 'btn-tipo-opcion';
        btn.textContent = tipo.nombre; // Ej: "Depósito", "Retiro"
        
        // Evento Click
        btn.addEventListener('click', () => {
            seleccionarTipoVisual(btn, tipo);
        });

        // Clasificar en columna correcta según categoría (RECAUDO vs TESORERIA)
        if (tipo.categoria === 'RECAUDO') {
            btn.innerHTML = `<span>⬇️</span> ${tipo.nombre}`;
            contenedorIngreso.appendChild(btn);
        } else {
            btn.innerHTML = `<span>⬆️</span> ${tipo.nombre}`;
            contenedorEgreso.appendChild(btn);
        }
    });
}

// NUEVA FUNCIÓN PARA MANEJAR EL CLICK EN UN TIPO
function seleccionarTipoVisual(elementoBtn, tipoObj) {
    // 1. Quitar selección previa visual
    document.querySelectorAll('.btn-tipo-opcion').forEach(b => {
        b.classList.remove('sel-ingreso', 'sel-egreso');
    });

    // 2. Marcar visualmente el actual
    if (tipoObj.categoria === 'RECAUDO') {
        elementoBtn.classList.add('sel-ingreso');
    } else {
        elementoBtn.classList.add('sel-egreso');
    }

    // 3. Guardar datos en los inputs ocultos
    document.getElementById('inputTipoSeleccionado').value = tipoObj.id;
    document.getElementById('inputCategoriaSeleccionada').value = tipoObj.categoria;
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
                alert("⚠️ ATENCIÓN: No has realizado la APERTURA DE CAJA hoy.\n\nEl sistema te redirigirá.");
                window.location.href = 'caja.html';
                return;
            }

            const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
            baseActual = data.base; 
            
            // Actualizar widget si existe en el HTML
            const txtBase = document.getElementById('txtBaseActual');
            if(txtBase) {
                txtBase.textContent = formato.format(data.base);
                
                // CORRECCIÓN: Verificamos si existe 'txtBaseInicial' antes de usarlo
                const txtInicial = document.getElementById('txtBaseInicial');
                if (txtInicial) {
                    txtInicial.textContent = `Base Inicial: ${formato.format(data.baseInicial)}`;
                }
            }
        }
    } catch (error) { console.error(error); }
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
    // 1. BLOQUEO DE SEGURIDAD
    const autorizado = await solicitarAutorizacionAdmin();
    if (!autorizado) return; // Si cancela o falla, no hacemos nada.

    // 2. Lógica Original (Se ejecuta solo si autorizado es true)
    const realStr = prompt(`🔓 MODO ADMIN ACTIVO\n\nEl sistema dice: $${baseActual}\n\n¿Cuánto dinero hay FÍSICAMENTE?`);
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
    // 1. BLOQUEO DE SEGURIDAD
    const autorizado = await solicitarAutorizacionAdmin();
    if (!autorizado) return;

    // 2. Lógica Original
    const nuevoValorStr = prompt(`🔓 MODO ADMIN ACTIVO - ${nombreBanco}\n\nEl sistema dice: $${saldoActual}\n\n¿Cuánto dinero hay REALMENTE en la plataforma?`);
    // ... resto de tu código igual ...
    if (nuevoValorStr === null) return;
    
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

// --- LÓGICA DEL MODAL DE SELECCIÓN ---

function abrirModalTipos(categoria) {
    const modal = document.getElementById('modalTipos');
    const contenedor = document.getElementById('gridOpcionesTipos');
    const titulo = document.getElementById('tituloModalTipos');
    
    // Configurar título y color según categoría
    if (categoria === 'RECAUDO') {
        titulo.textContent = '📥 Seleccione tipo de Ingreso';
        titulo.style.color = '#166534';
    } else {
        titulo.textContent = '📤 Seleccione tipo de Retiro';
        titulo.style.color = '#991b1b';
    }

    // Filtrar y renderizar botones
    contenedor.innerHTML = '';
    const tiposFiltrados = todosLosTipos.filter(t => t.categoria === categoria);

    if(tiposFiltrados.length === 0) {
        contenedor.innerHTML = '<p style="text-align:center; width:100%; color:#94a3b8;">No hay opciones disponibles.</p>';
    }

    tiposFiltrados.forEach(tipo => {
        const btn = document.createElement('div');
        btn.className = 'btn-modal-option';
        
        // Emoji por defecto si no tienes iconos específicos
        let emoji = categoria === 'RECAUDO' ? '💰' : '💸';
        
        btn.innerHTML = `
            <span class="emoji">${emoji}</span>
            <span>${tipo.nombre}</span>
        `;
        
        btn.onclick = () => seleccionarTipoDesdeModal(tipo);
        contenedor.appendChild(btn);
    });

    modal.style.display = 'flex';
}

function cerrarModalTipos() {
    document.getElementById('modalTipos').style.display = 'none';
}

function seleccionarTipoDesdeModal(tipo) {
    // 1. GUARDAR VALORES EN INPUTS OCULTOS (Lógica del Sistema)
    document.getElementById('inputTipoSeleccionado').value = tipo.id;
    document.getElementById('inputCategoriaSeleccionada').value = tipo.categoria;

    // 2. ACTUALIZAR UI VISUAL (El recuadro pequeño "Seleccionado")
    document.getElementById('displaySeleccion').style.display = 'flex';
    document.getElementById('txtSeleccion').textContent = tipo.nombre;
    
    const iconDisplay = document.getElementById('iconSeleccion');
    const boxDisplay = document.getElementById('displaySeleccion');

    if (tipo.categoria === 'RECAUDO') {
        iconDisplay.textContent = '📥';
        boxDisplay.style.background = '#f0fdf4'; // Verde claro
        boxDisplay.style.borderColor = '#bbf7d0';
    } else {
        iconDisplay.textContent = '📤';
        boxDisplay.style.background = '#fef2f2'; // Rojo claro
        boxDisplay.style.borderColor = '#fecaca';
    }

    // 3. TRANSFORMACIÓN DEL BOTÓN PRINCIPAL (Lógica de Estilos)
    const btnAgregar = document.getElementById('btnAgregar');

    // Cambiar de "Fantasma" a "Sólido"
    btnAgregar.style.color = 'white';       
    btnAgregar.style.border = 'none';       
    btnAgregar.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';

    if (tipo.categoria === 'RECAUDO') { 
        // ESTILO VERDE (INGRESO)
        btnAgregar.style.background = 'linear-gradient(135deg, #16a34a, #15803d)';
        btnAgregar.style.setProperty('--pulse-color', 'rgba(22, 163, 74, 0.6)'); 
        btnAgregar.innerHTML = '<span class="btn-icon">⬇️</span> <span class="btn-text">RECIBIR DINERO</span>';
    } else { 
        // ESTILO ROJO (EGRESO)
        btnAgregar.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
        btnAgregar.style.setProperty('--pulse-color', 'rgba(220, 38, 38, 0.6)');
        btnAgregar.innerHTML = '<span class="btn-icon">⬆️</span> <span class="btn-text">ENTREGAR DINERO</span>';
    }

    // 4. CERRAR MODAL Y ENFOCAR (Lo que se había perdido)
    cerrarModalTipos();
    
    // Pequeño delay para asegurar que el modal se vaya antes de enfocar
    setTimeout(() => {
        document.getElementById('inputMontoVisual').focus();
    }, 100);
}

function limpiarSeleccionTipo() {
    // 1. Limpiar los inputs ocultos (Lo que ya tenías)
    document.getElementById('inputTipoSeleccionado').value = '';
    document.getElementById('inputCategoriaSeleccionada').value = '';
    document.getElementById('displaySeleccion').style.display = 'none';

    // 2. RESETEAR COLORES (Lo Nuevo)
    const panelFormulario = document.querySelector('.highlight-box');
    const btnAgregar = document.getElementById('btnAgregar');

    btnAgregar.style.background = ''; // Vuelve al CSS (rgba...)
    btnAgregar.style.color = '';      // Vuelve al CSS (Gris)
    btnAgregar.style.border = '';     // Vuelve al CSS (Borde visible)
    btnAgregar.style.boxShadow = '';  // Quita la sombra fuerte

    // Volver al gris/blanco original
    panelFormulario.style.backgroundColor = '#f8fafc'; 
    panelFormulario.style.borderColor = '#e2e8f0';

    btnAgregar.style.setProperty('--pulse-color', 'rgba(0,0,0,0)'); 
    btnAgregar.innerHTML = '<span class="btn-icon">⬇️</span> <span class="btn-text">AGREGAR</span>';
    
    // Limpiar selección visual de los botones de tipo (si usaste mi código anterior)
    document.querySelectorAll('.btn-tipo-opcion').forEach(b => {
        b.classList.remove('sel-ingreso', 'sel-egreso');
    });
}

// ==========================================
// NUEVA LÓGICA DE HISTORIAL (MODAL PRO)
// ==========================================

function abrirModalHistorial() {
    document.getElementById('modalHistorial').style.display = 'flex';
}

function cerrarModalHistorial() {
    document.getElementById('modalHistorial').style.display = 'none';
}

async function cargarMisMovimientos() {
    const usuario = localStorage.getItem('usuario_nombre');
    const container = document.getElementById('listaMovimientosModal'); // ID NUEVO
    const lblResumen = document.getElementById('lblResumenHistorial'); // Etiqueta del botón

    try {
        const res = await fetch(`/api/mis-movimientos?usuario=${usuario}`);
        const data = await res.json();

        if (data.success) {
            container.innerHTML = ''; 
            const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
            
            // 1. Actualizar el Botón Resumen
            const cantidad = data.movimientos.length;
            if (lblResumen) {
                lblResumen.textContent = cantidad === 0 ? "Sin movimientos hoy" : `${cantidad} transacciones hoy`;
            }

            // 2. Estado Vacío
            if (cantidad === 0) {
                container.innerHTML = `
                    <div class="empty-state-modal">
                        <span style="font-size:2rem; display:block; margin-bottom:10px;">📭</span>
                        No has realizado movimientos en esta sesión.
                    </div>`;
                return;
            }

            // 3. Renderizar filas PRO
            data.movimientos.forEach(mov => {
                // Determinar iconos y colores
                let icon = '📄';
                let claseColor = 'text-ingreso-pro'; // Por defecto verde
                let signo = '+';

                // Lógica simple para detectar si es salida (adaptar según tus tipos reales)
                // Si el tipo dice "Retiro", "Salida", "Pago" o "Egreso"
                const tipoLower = mov.tipo.toLowerCase();
                if (tipoLower.includes('retiro') || tipoLower.includes('pago') || tipoLower.includes('salida') || tipoLower.includes('egreso')) {
                    claseColor = 'text-egreso-pro'; // Rojo
                    signo = '-';
                    icon = '💸';
                } else if (tipoLower.includes('nequi')) {
                    icon = '📱';
                }

                const div = document.createElement('div');
                div.className = 'history-row';
                div.innerHTML = `
                    <div class="h-time">${mov.hora}</div>
                    
                    <div class="h-desc">
                        <h4>${icon} ${mov.tipo}</h4>
                        <p>${mov.descripcion || 'Sin descripción'}</p>
                    </div>
                    
                    <div class="h-amount ${claseColor}">
                        ${signo} ${formato.format(mov.monto)}
                    </div>
                    
                    <div class="h-actions">
                        <button onclick="editarTx(${mov.id}, '${mov.descripcion}', ${mov.monto})" class="btn-icon-action btn-edit" title="Editar">✏️</button>
                        <button onclick="eliminarTx(${mov.id})" class="btn-icon-action btn-trash" title="Eliminar">🗑️</button>
                    </div>
                `;
                container.appendChild(div);
            });
        }
    } catch (error) { 
        console.error("Error historial:", error); 
        if(container) container.innerHTML = '<div class="empty-state-modal" style="color:red">Error de conexión</div>';
    }
}

// ==========================================
// LÓGICA DE HISTORIAL CON FILTROS
// ==========================================

let historialCache = []; // Variable global para guardar los datos y filtrar rápido

async function cargarMisMovimientos() {
    const usuario = localStorage.getItem('usuario_nombre');
    const lblResumen = document.getElementById('lblResumenHistorial');

    try {
        const res = await fetch(`/api/mis-movimientos?usuario=${usuario}`);
        const data = await res.json();

        if (data.success) {
            // 1. Guardar en caché global
            historialCache = data.movimientos;

            // 2. Actualizar texto del botón principal
            if (lblResumen) {
                const count = historialCache.length;
                lblResumen.textContent = count === 0 ? "Sin movimientos hoy" : `${count} transacciones hoy`;
            }

            // 3. Renderizar tabla completa inicialmente
            renderizarHistorial(historialCache);
        }
    } catch (error) { 
        console.error("Error historial:", error); 
    }
}

// Nueva función que se encarga SOLO de dibujar la tabla
// Función para dibujar la tabla del Historial (Modal)
function renderizarHistorial(lista) {
    const container = document.getElementById('listaMovimientosModal'); // La tabla del modal
    if (!container) return;

    container.innerHTML = '';
    const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    if (lista.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">No hay movimientos coinciden con la búsqueda.</div>';
        return;
    }

    lista.forEach(mov => {
        // 1. LÓGICA DE COLORES (Aquí está la clave)
        // Usamos el campo 'afecta_caja' que agregamos al backend
        const esIngreso = mov.afecta_caja == 1; 
        
        const colorMonto = esIngreso ? '#2ecc71' : '#e74c3c'; // Verde o Rojo
        const signo = esIngreso ? '+ ' : '- ';
        const estiloMonto = `color:${colorMonto}; font-weight:bold; text-align:right;`;

        // 2. Crear fila
        const item = document.createElement('div');
        item.className = 'history-row'; // Asegúrate de tener CSS para esto o usa divs simples
        item.style.cssText = "display:grid; grid-template-columns: 1fr 2fr 1fr 1fr; padding:10px; border-bottom:1px solid #eee; align-items:center;";

        item.innerHTML = `
            <span style="color:#7f8c8d; font-size:0.9rem;">${mov.hora}</span>
            <div>
                <strong style="color:#2c3e50;">${mov.tipo}</strong>
                <div style="font-size:0.8rem; color:#f39c12;">👤 ${mov.usuario}</div>
                <small style="color:#95a5a6;">${mov.descripcion || ''}</small>
            </div>
            <div style="${estiloMonto}">
                ${signo}${formato.format(mov.monto)}
            </div>
             <div style="text-align:center;">
                ${ (localStorage.getItem('usuario_nombre') === mov.usuario || localStorage.getItem('usuario_rol') === 'admin') 
                    ? `<button onclick="eliminarTx(${mov.id})" style="border:none; background:none; cursor:pointer;" title="Borrar">🗑️</button>` 
                    : '' 
                }
            </div>
        `;
        container.appendChild(item);
    });
}
// Función de filtrado (se ejecuta al escribir en los inputs)
function filtrarHistorial() {
    // 1. Obtener valores de búsqueda (en minúsculas para comparar fácil)
    const textoTipo = document.getElementById('filtroTipo').value.toLowerCase();
    const textoMonto = document.getElementById('filtroMonto').value;
    const textoHora = document.getElementById('filtroHora').value;

    // 2. Filtrar el array caché
    const resultados = historialCache.filter(mov => {
        // Filtro por Tipo o Descripción
        const cumpleTipo = mov.tipo.toLowerCase().includes(textoTipo) || 
                           (mov.descripcion && mov.descripcion.toLowerCase().includes(textoTipo));
        
        // Filtro por Monto (si está vacío, pasa siempre)
        const cumpleMonto = textoMonto === "" || mov.monto.toString().includes(textoMonto);
        
        // Filtro por Hora (match parcial, ej: "14" encuentra 14:00 y 14:59)
        const cumpleHora = textoHora === "" || mov.hora.includes(textoHora);

        return cumpleTipo && cumpleMonto && cumpleHora;
    });

    // 3. Volver a dibujar con los resultados filtrados
    renderizarHistorial(resultados);
}

// --- FUNCION PARA PEDIR AUTORIZACIÓN (Promesa) ---
function solicitarAutorizacionAdmin() {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalAuth');
        const input = document.getElementById('inputAdminPass');
        const btnConfirm = document.getElementById('btnConfirmAuth');
        const btnCancel = document.getElementById('btnCancelAuth');

        // Mostrar modal y limpiar
        modal.style.display = 'flex';
        input.value = '';
        input.focus();

        // Función interna para manejar el envío
        const verificar = async () => {
            const pass = input.value;
            if (!pass) return;

            btnConfirm.textContent = "Verificando...";
            
            try {
                const res = await fetch('/api/validar-admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pass })
                });
                const data = await res.json();

                if (data.success) {
                    modal.style.display = 'none';
                    resolve(true); // ¡AUTORIZADO!
                } else {
                    alert("⛔ Contraseña incorrecta");
                    input.value = '';
                    input.focus();
                    // No resolvemos false todavía, dejamos que intente de nuevo
                }
            } catch (e) {
                alert("Error de conexión");
                modal.style.display = 'none';
                resolve(false);
            } finally {
                btnConfirm.textContent = "Verificar";
            }
        };

        // Eventos (usamos onclick directo para limpiar listeners viejos si fuera necesario, o addEventListener con {once:true})
        btnConfirm.onclick = verificar;
        
        btnCancel.onclick = () => {
            modal.style.display = 'none';
            resolve(false); // Cancelado
        };

        // Permitir Enter para enviar
        input.onkeydown = (e) => {
            if (e.key === 'Enter') verificar();
            if (e.key === 'Escape') {
                modal.style.display = 'none';
                resolve(false);
            }
        };
    });
}

const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault(); // Evita que la página recargue o salte
            
            if(confirm("¿Seguro que deseas cerrar sesión?")) {
                // 1. Borramos las credenciales guardadas
                localStorage.removeItem('usuario_nombre');
                localStorage.removeItem('usuario_rol');
                
                // 2. Redirigimos al login
                window.location.href = 'login.html';
            }
        });
    }

// --- FUNCIÓN PARA ABRIR CAJÓN SIN FACTURA ---
function abrirCajonMonedero() {
    // 1. Creamos un iframe invisible (una mini ventana oculta)
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    // 2. Le metemos un contenido "vacío" pero con la estructura básica
    // El punto (.) con color blanco es un truco para que el navegador crea que hay algo que imprimir
    const contenido = `
        <html>
        <head>
            <style>
                @page { size: auto; margin: 0mm; } 
                body { margin: 0; padding: 0; overflow: hidden; }
            </style>
        </head>
        <body>
            <div style="font-size:1px; color:white; opacity:0;">.</div>
        </body>
        </html>
    `;

    iframe.contentDocument.write(contenido);
    iframe.contentDocument.close();

    // 3. Ordenamos imprimir esa "nada"
    try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    } catch (e) {
        console.error("Error intentando abrir cajón:", e);
    }

    // 4. Limpiamos la basura (borramos el iframe después de un segundo)
    setTimeout(() => {
        document.body.removeChild(iframe);
    }, 1000);
}

function sumarMonto(valor) {
    const hidden = document.getElementById('inputMonto');
    const visual = document.getElementById('inputMontoVisual');
    
    // Obtener valor actual (si está vacío es 0)
    let actual = parseInt(hidden.value) || 0;
    let nuevoTotal = actual + valor;
    
    // Actualizar ambos inputs
    hidden.value = nuevoTotal;
    visual.value = new Intl.NumberFormat('es-CO', { 
        style: 'currency', currency: 'COP', maximumFractionDigits: 0 
    }).format(nuevoTotal);
    
    visual.focus(); // Mantener el foco
}

function limpiarMonto() {
    document.getElementById('inputMonto').value = '';
    document.getElementById('inputMontoVisual').value = '';
    document.getElementById('inputMontoVisual').focus();
}