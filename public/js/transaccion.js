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
    const form = document.getElementById('formTransaccion');
    
    // Validar campos requeridos
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    // Obtener valores
    const bancoId = document.getElementById('selectBanco').value;
    const bancoNombre = document.querySelector('.bank-option.selected .bank-name')?.textContent || 'Banco';
    const tipoId = document.getElementById('selectTipo').value;
    const tipoNombre = document.getElementById('selectTipo').options[document.getElementById('selectTipo').selectedIndex].text;
    const categoria = document.querySelector('input[name="categoria"]:checked').value;
    const monto = parseInt(document.getElementById('inputMonto').value);
    const desc = document.getElementById('inputDesc').value;

    if (!monto || monto <= 0) return alert("Ingresa un monto válido");

    // Crear objeto operación
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

    // Agregar a la lista y limpiar inputs
    carritoCliente.push(operacion);
    
    // Limpiar solo los campos de escritura, dejar banco/tipo seleccionados si se desea
    document.getElementById('inputMonto').value = '';
    document.getElementById('inputMontoVisual').value = '';
    document.getElementById('inputDesc').value = '';
    document.getElementById('inputMontoVisual').focus(); // Foco listo para siguiente monto

    renderizarCarrito();
}

function renderizarCarrito() {
    const contenedor = document.getElementById('listaOperaciones');
    contenedor.innerHTML = '';
    totalGlobal = 0;

    if (carritoCliente.length === 0) {
        contenedor.innerHTML = '<div class="empty-state">No hay operaciones agregadas</div>';
        document.getElementById('btnFinalizar').disabled = true;
        document.getElementById('lblTotalCliente').textContent = '$ 0';
        return;
    }

    carritoCliente.forEach((op, index) => {
        // Lógica de suma: 
        // RECAUDO = Cliente entrega dinero (+)
        // TESORERIA = Entregamos dinero al cliente (-)
        if (op.categoria === 'RECAUDO') {
            totalGlobal += op.monto;
        } else {
            totalGlobal -= op.monto;
        }

        const item = document.createElement('div');
        item.className = 'op-item';
        
        // Formato moneda para la lista
        const montoFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(op.monto);
        const signo = op.categoria === 'RECAUDO' ? '+' : '-';
        const color = op.categoria === 'RECAUDO' ? '#2c3e50' : '#e74c3c';

        item.innerHTML = `
            <div class="op-info">
                <h4>${op.banco_nombre} - ${op.tipo_nombre}</h4>
                <p>${op.descripcion}</p>
            </div>
            <div class="op-amount" style="color: ${color}">
                ${signo} ${montoFmt}
            </div>
            <button class="btn-delete-item" onclick="eliminarDelCarrito(${index})">×</button>
        `;
        contenedor.appendChild(item);
    });

    // Actualizar total visual
    document.getElementById('lblTotalCliente').textContent = 
        new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(totalGlobal);
    
    document.getElementById('btnFinalizar').disabled = false;
}

function eliminarDelCarrito(index) {
    carritoCliente.splice(index, 1);
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
            // A. Grid de Bancos
            const grid = document.getElementById('gridBancos');
            const hiddenInput = document.getElementById('selectBanco');
            grid.innerHTML = '';

            data.bancos.forEach(banco => {
                const div = document.createElement('div');
                div.className = 'bank-option';
                
                // Iconos
                let icon = '🏦';
                const n = banco.nombre.toLowerCase();
                if(n.includes('bancolombia')) icon = '🟨';
                if(n.includes('nequi')) icon = '📱';
                if(n.includes('daviplata')) icon = '🔴';
                if(n.includes('bogota')) icon = '🔵';

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

            // B. Guardar Tipos
            todosLosTipos = data.tipos; 
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