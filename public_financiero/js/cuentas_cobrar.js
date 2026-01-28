/* public_financiero/js/cuentas_cobrar.js - VERSIÓN FINAL CON TODO */

let clientesCache = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificar Sesión
    const userStr = sessionStorage.getItem('fin_user');
    if (!userStr) { window.location.href = 'login2.html'; return; }
    const user = JSON.parse(userStr);
    document.getElementById('userDisplay').textContent = user.nombre;

    // 2. Cargas Iniciales
    cargarClientes();
    cargarTablaHistorial();
    cargarSaldoTotal(); // <--- RESTAURADO

    // 3. Manejar Formulario de Operación (Modal Cliente)
    document.getElementById('formOperacion').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let nombre = document.getElementById('op_cliente_nombre').value;
        let doc = document.getElementById('op_cliente_documento').value;

        // Si es nuevo cliente, tomar de los inputs visibles
        if (!nombre) {
            nombre = document.getElementById('new_nombre').value;
            doc = document.getElementById('new_doc').value;
        }

        if(!nombre) return alert('El nombre es obligatorio');

        const valor = parseFloat(document.getElementById('op_valor').value);
        const tipo = document.querySelector('input[name="tipo_op"]:checked').value;
        
        let entrada = 0, salida = 0;
        if (tipo === 'entrada') entrada = valor;
        else salida = valor;

        const data = {
            fecha: document.getElementById('op_fecha').value,
            hora: new Date().toTimeString().substring(0,5), 
            cliente_nombre: nombre,
            cliente_documento: doc || '',
            descripcion: document.getElementById('op_desc').value,
            entrada: entrada,
            salida: salida,
            usuario_id: user.id
        };
        
        try {
            const res = await fetch('/api/financiero/cuentas-cobrar', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });

            if(res.ok) {
                cerrarModalCliente();
                cargarClientes();        // Refrescar tarjetas
                cargarTablaHistorial();  // Refrescar tabla abajo
                cargarSaldoTotal();      // Refrescar saldo global
            } else {
                alert('Error al guardar');
            }
        } catch(e) { console.error(e); alert('Error de conexión'); }
    });
});

// --- 1. GESTIÓN DE SALDO GLOBAL (RESTAURADO) ---
async function cargarSaldoTotal() {
    try {
        const res = await fetch('/api/financiero/cuentas-cobrar/saldo');
        const data = await res.json();
        if(data.success) {
            // El ID "granSaldo" ahora existe en el HTML restaurado
            const el = document.getElementById('granSaldo');
            if(el) el.textContent = fmt(data.total);
        }
    } catch(e) { console.error(e); }
}

function abrirModalAjuste() {
    document.getElementById('modalAjuste').style.display = 'flex';
    document.getElementById('nuevoSaldoReal').value = '';
    document.getElementById('nuevoSaldoReal').focus();
}

function cerrarModalAjuste() {
    document.getElementById('modalAjuste').style.display = 'none';
}

async function confirmarAjuste() {
    const val = document.getElementById('nuevoSaldoReal').value;
    if(!val) return alert('Ingresa un valor');
    
    const user = JSON.parse(sessionStorage.getItem('fin_user'));
    
    if(!confirm('¿Ajustar saldo GLOBAL de terceros?')) return;

    try {
        await fetch('/api/financiero/cuentas-cobrar/ajustar', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ nuevo_saldo_real: val, usuario_id: user.id })
        });
        cerrarModalAjuste();
        cargarClientes();
        cargarTablaHistorial();
        cargarSaldoTotal();
    } catch(e) { alert('Error conexión'); }
}


// --- 2. GESTIÓN DE CLIENTES (GRID) ---
async function cargarClientes() {
    try {
        const res = await fetch('/api/financiero/clientes-resumen');
        const data = await res.json();
        clientesCache = data.datos;
        
        // --- NUEVO CÁLCULO DE TOTALES ---
        let totalCartera = 0;   // Nos deben (Saldos negativos)
        let totalCustodia = 0;  // Les debemos (Saldos positivos)

        clientesCache.forEach(c => {
            const saldo = parseFloat(c.saldo);
            if (saldo < 0) {
                totalCartera += Math.abs(saldo); // Sumamos lo que nos deben
            } else {
                totalCustodia += saldo; // Sumamos lo que tenemos guardado
            }
        });

        // Actualizamos las tarjetas nuevas
        document.getElementById('totalPorCobrar').textContent = fmt(totalCartera);
        document.getElementById('totalEnCustodia').textContent = fmt(totalCustodia);
        // -------------------------------

        renderClientes(clientesCache);
    } catch(e) { console.error(e); }
}
/* Reemplaza ESTA FUNCIÓN en public_financiero/js/cuentas_cobrar.js */

function renderClientes(lista) {
    const grid = document.getElementById('gridClientes');
    grid.innerHTML = '';

    lista.forEach(c => {
        const saldo = parseFloat(c.saldo);
        let claseBorde = '';
        let textoEstado = '';
        let iconoEstado = '';
        let valorMostrar = saldo;

        // LÓGICA INTELIGENTE:
        if (saldo > 0) {
            // El saldo es positivo: Tú tienes su dinero
            claseBorde = 'saldo-positivo'; // Verde
            textoEstado = 'TIENE A FAVOR (TÚ LO TIENES)';
            iconoEstado = '<i class="fa-solid fa-piggy-bank"></i>';
            valorMostrar = saldo; 
        } else if (saldo < 0) {
            // El saldo es negativo: Salieron más recursos tuyos hacia él
            claseBorde = 'saldo-negativo'; // Rojo
            textoEstado = 'TE DEBE (CARTERA)';
            iconoEstado = '<i class="fa-solid fa-hand-holding-dollar"></i>';
            valorMostrar = Math.abs(saldo); // Lo mostramos positivo visualmente pero en rojo
        } else {
            // Saldo cero
            claseBorde = 'saldo-neutro'; // Gris
            textoEstado = 'PAZ Y SALVO';
            iconoEstado = '<i class="fa-solid fa-check"></i>';
            valorMostrar = 0;
        }

        const card = document.createElement('div');
        card.className = `card-cliente ${claseBorde}`;
        
        card.onclick = (e) => {
            if(e.target.closest('.btn-view-history')) return;
            abrirModalCliente(c);
        };

        card.innerHTML = `
            <div class="card-header-actions">
                <div class="cli-name" style="margin:0;">${c.cliente_nombre}</div>
                <button class="btn-view-history" title="Ver Historial" 
                    onclick="verHistorial('${c.cliente_documento||''}', '${c.cliente_nombre}')">
                    <i class="fa-solid fa-list-ul"></i>
                </button>
            </div>
            
            <div class="cli-doc"><i class="fa-solid fa-id-card"></i> ${c.cliente_documento || 'Sin ID'}</div>
            
            <div class="lbl-saldo" style="display: flex; justify-content: space-between;">
                <span>${textoEstado}</span>
                <span>${iconoEstado}</span>
            </div>
            
            <div class="cli-saldo">${fmt(valorMostrar)}</div>
        `;
        grid.appendChild(card);
    });
}

function filtrarClientes() {
    const texto = document.getElementById('busquedaCliente').value.toLowerCase();
    const filtrados = clientesCache.filter(c => 
        c.cliente_nombre.toLowerCase().includes(texto) || 
        (c.cliente_documento && c.cliente_documento.includes(texto))
    );
    renderClientes(filtrados);
}

// --- 3. MODAL OPERACIÓN (ABONAR/RETIRAR) ---
function abrirModalCliente(cliente = null) {
    const modal = document.getElementById('modalCliente');
    const form = document.getElementById('formOperacion');
    form.reset();
    document.getElementById('op_fecha').valueAsDate = new Date();

    if (cliente) {
        document.getElementById('modalClienteNombre').textContent = cliente.cliente_nombre;
        document.getElementById('modalClienteDoc').textContent = cliente.cliente_documento || 'Sin ID';
        document.getElementById('modalClienteSaldo').textContent = fmt(cliente.saldo);
        
        document.getElementById('op_cliente_nombre').value = cliente.cliente_nombre;
        document.getElementById('op_cliente_documento').value = cliente.cliente_documento;
        
        document.getElementById('divNewClientInputs').style.display = 'none';
    } else {
        document.getElementById('modalClienteNombre').textContent = "Nuevo Cliente";
        document.getElementById('modalClienteDoc').textContent = "---";
        document.getElementById('modalClienteSaldo').textContent = "$ 0.00";
        document.getElementById('op_cliente_nombre').value = "";
        document.getElementById('op_cliente_documento').value = "";
        document.getElementById('divNewClientInputs').style.display = 'grid';
        setTimeout(() => document.getElementById('new_nombre').focus(), 100);
    }
    modal.style.display = 'flex';
}

function cerrarModalCliente() {
    document.getElementById('modalCliente').style.display = 'none';
}


// --- 4. HISTORIAL ESPECÍFICO ---
async function verHistorial(doc, nombre) {
    const modal = document.getElementById('modalHistorial');
    document.getElementById('historialClienteNombre').textContent = nombre;
    document.getElementById('tablaHistorialCuerpo').innerHTML = '<tr><td colspan="4" class="text-center">Cargando...</td></tr>';
    modal.style.display = 'flex';

    try {
        const res = await fetch(`/api/financiero/cuentas-cobrar/historial-cliente?doc=${doc}&nombre=${encodeURIComponent(nombre)}`);
        const data = await res.json();
        const tbody = document.getElementById('tablaHistorialCuerpo');
        tbody.innerHTML = '';
        
        let sumEntrada = 0, sumSalida = 0;

        if (data.datos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Sin movimientos.</td></tr>';
        } else {
            data.datos.forEach(f => {
                sumEntrada += parseFloat(f.entrada);
                sumSalida += parseFloat(f.salida);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${f.fecha} <small>${f.hora}</small></td>
                    <td>${f.descripcion}</td>
                    <td class="text-right green-text">${f.entrada > 0 ? fmt(f.entrada) : '-'}</td>
                    <td class="text-right red-text">${f.salida > 0 ? fmt(f.salida) : '-'}</td>
                `;
                tbody.appendChild(tr);
            });
        }
        document.getElementById('totalEntradaHist').textContent = fmt(sumEntrada);
        document.getElementById('totalSalidaHist').textContent = fmt(sumSalida);

    } catch (e) { console.error(e); }
}

function cerrarModalHistorial() {
    document.getElementById('modalHistorial').style.display = 'none';
}


// --- 5. TABLA HISTORIAL GENERAL ---
async function cargarTablaHistorial() {
    const res = await fetch('/api/financiero/cuentas-cobrar');
    const data = await res.json();
    const tbody = document.getElementById('tablaCuerpo');
    tbody.innerHTML = '';

    data.datos.forEach(fila => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${fila.fecha}</td>
            <td style="font-weight:bold;">${fila.cliente_nombre}</td>
            <td>${fila.descripcion}</td>
            <td class="text-right green-text">${fmt(fila.entrada)}</td>
            <td class="text-right red-text">${fmt(fila.salida)}</td>
            <td class="text-center">
                <button class="btn-action btn-delete" onclick="eliminarRegistro(${fila.id})"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function eliminarRegistro(id) {
    if(!confirm('¿Eliminar registro? Se recalculará el saldo.')) return;
    fetch(`/api/financiero/cuentas-cobrar/${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(d => { 
            if(d.success) { 
                cargarClientes(); 
                cargarTablaHistorial(); 
                cargarSaldoTotal(); 
            } 
        });
}

let datosERP_Cache = [];


async function consultarERP() {
    const modal = document.getElementById('modalERP');
    const loading = document.getElementById('loadingERP');
    const tableContainer = document.getElementById('tablaERPContainer');
    const tbody = document.getElementById('tablaERPCuerpo');
    const btnSync = document.getElementById('btnSync');
    
    modal.style.display = 'flex';
    loading.style.display = 'block';
    tableContainer.style.display = 'none';
    btnSync.style.display = 'none';
    tbody.innerHTML = '';

    try {
        const res = await fetch('/api/financiero/erp/deudas-empleados');
        const data = await res.json();
        
        loading.style.display = 'none';

        if (data.success) {
            datosERP_Cache = data.datos;
            tableContainer.style.display = 'block';
            
            if (datosERP_Cache.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center">No hay deudas en el ERP.</td></tr>';
                return;
            }

            let hayDiferencias = false;

            datosERP_Cache.forEach(item => {
                const saldoERP = parseFloat(item.saldo_erp);
                const saldoLocal = parseFloat(item.saldo_local);
                const diferencia = Math.abs(saldoERP) - Math.abs(saldoLocal);
                
                let estadoHTML = '';
                let btnHTML = ''; // Botón individual
                let claseFila = '';

                // Si la diferencia es menor a $100 pesos, lo consideramos cuadrado
                if (Math.abs(diferencia) < 100) {
                    estadoHTML = '<span class="tag-ok"><i class="fa-solid fa-check"></i> OK</span>';
                    // Botón deshabilitado o invisible si ya está OK
                    btnHTML = `<button class="btn-action" style="opacity:0.3; cursor:default;" disabled><i class="fa-solid fa-check"></i></button>`;
                } else {
                    hayDiferencias = true;
                    estadoHTML = `<span class="tag-error">DESCUADRADO</span>`;
                    claseFila = 'style="background-color: #fff8e1;"';
                    
                    // BOTÓN DE SINCRONIZAR UNO SOLO
                    // Pasamos el NIT como texto entre comillas simples
                    btnHTML = `
                        <button class="btn-action btn-edit" title="Sincronizar solo este" 
                            onclick="sincronizarUno('${item.nit}')" style="background:#1565c0; color:white;">
                            <i class="fa-solid fa-rotate"></i>
                        </button>
                    `;
                }

                const tr = document.createElement('tr');
                if(claseFila) tr.style.backgroundColor = '#fffde7';
                
                tr.innerHTML = `
                    <td>
                        <div style="font-weight:bold;">${item.nombre}</div>
                        <small style="color:#666;">NIT: ${item.nit}</small>
                    </td>
                    <td class="text-right" style="font-weight:bold; color:#d32f2f;">${fmt(saldoERP)}</td>
                    <td class="text-right" style="font-weight:bold; color:${saldoLocal < 0 ? '#d32f2f' : '#388e3c'}">
                        ${fmt(Math.abs(saldoLocal))} ${saldoLocal > 0 ? '(Favor)' : '(Deuda)'}
                    </td>
                    <td class="text-center">${estadoHTML}</td>
                    <td class="text-center">${btnHTML}</td> `;
                tbody.appendChild(tr);
            });

            if (hayDiferencias) {
                btnSync.style.display = 'flex';
                btnSync.innerHTML = `<i class="fa-solid fa-layer-group"></i> SINCRONIZAR TODO`;
            } else {
                btnSync.style.display = 'flex';
                btnSync.disabled = true;
                btnSync.innerHTML = `<i class="fa-solid fa-check-double"></i> TODO CUADRADO`;
                btnSync.style.background = '#9e9e9e';
            }

        } else {
            alert('Error: ' + data.message);
            cerrarModalERP();
        }
    } catch (error) {
        console.error(error);
        loading.style.display = 'none';
        alert('Error conectando al ERP');
    }
}

// --- NUEVA FUNCIÓN: SINCRONIZAR UNO SOLO ---
async function sincronizarUno(nitCliente) {
    // 1. Buscamos los datos completos de ese cliente en la memoria (Cache)
    const cliente = datosERP_Cache.find(c => c.nit === nitCliente);
    
    if (!cliente) return alert('Error: No se encontraron datos del cliente.');

    if (!confirm(`¿Sincronizar únicamente a ${cliente.nombre}?`)) return;

    const user = JSON.parse(sessionStorage.getItem('fin_user'));

    try {
        // Usamos la MISMA ruta del backend, pero enviamos una lista de 1 elemento
        const res = await fetch('/api/financiero/erp/sincronizar', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                clientes: [cliente], // <--- ARRAY CON UN SOLO CLIENTE
                usuario_id: user.id 
            })
        });

        const data = await res.json();
        
        if (data.success) {
            // Recargamos el modal para ver que ya quedó en verde (OK)
            consultarERP(); 
            // Actualizamos lo de atrás (Tarjetas y Saldos)
            cargarClientes();
            cargarSaldoTotal();
            // Feedback visual rápido
            alert('Cliente sincronizado correctamente.');
        } else {
            alert('Error: ' + data.message);
        }

    } catch (error) {
        console.error(error);
        alert('Error de conexión');
    }
}
async function sincronizarTodo() {
    if (!confirm('¿Estás seguro de igualar tu sistema con el ERP? Se crearán ajustes automáticos para todos los clientes listados.')) return;

    const btnSync = document.getElementById('btnSync');
    btnSync.disabled = true;
    btnSync.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> PROCESANDO...';

    const user = JSON.parse(sessionStorage.getItem('fin_user'));

    try {
        const res = await fetch('/api/financiero/erp/sincronizar', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                clientes: datosERP_Cache, 
                usuario_id: user.id 
            })
        });

        const data = await res.json();
        if (data.success) {
            alert(data.message);
            cerrarModalERP();
            cargarClientes(); // Recargar tarjetas principales
            cargarTablaHistorial();
            cargarSaldoTotal();
        } else {
            alert('Error al sincronizar: ' + data.message);
            btnSync.disabled = false;
            btnSync.innerHTML = 'REINTENTAR';
        }
    } catch (error) {
        console.error(error);
        alert('Error de conexión');
        btnSync.disabled = false;
    }
}

function cerrarModalERP() {
    document.getElementById('modalERP').style.display = 'none';
}
// --- UTILIDADES ---
function fmt(v) { return parseFloat(v || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP' }); }
function logout() { sessionStorage.removeItem('fin_user'); window.location.href = 'login2.html'; }