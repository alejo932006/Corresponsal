/* public_financiero/js/corresponsal.js - CÓDIGO COMPLETO CON EDICIÓN */

let editMode = false;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificar Sesión
    const userStr = sessionStorage.getItem('fin_user');
    if (!userStr) { window.location.href = 'login2.html'; return; }
    const user = JSON.parse(userStr);
    document.getElementById('userDisplay').textContent = user.nombre;

    // 2. Fechas iniciales
    const now = new Date();
    document.getElementById('fecha').valueAsDate = now;
    document.getElementById('hora').value = now.toTimeString().substring(0,5);

    // 3. Cargar Datos
    cargarTabla();
    cargarSaldoTotal();

    if (!editMode) {
        sincronizarDatosEnVivo();
    }

    // 4. Manejar Formulario
    const form = document.getElementById('formCorresponsal');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('editId').value;
        const getVal = (id) => document.getElementById(id).value || 0;

        const data = {
            fecha: document.getElementById('fecha').value,
            hora: document.getElementById('hora').value,
            descripcion: document.getElementById('descripcion').value,
            
            deposito: getVal('deposito'),
            recaudo: getVal('recaudo'),
            pago_tc: getVal('pago_tc'),
            pago_cartera: getVal('pago_cartera'),
            retiro: getVal('retiro'),
            compensacion: getVal('compensacion'),
            
            usuario_id: user.id
        };

        let url = '/api/financiero/corresponsal';
        let method = 'POST';

        if (editMode && id) {
            url = `/api/financiero/corresponsal/${id}`;
            method = 'PUT';
        }

        try {
            const res = await fetch(url, {
                method: method,
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });

            if(res.ok) {
                cancelarEdicion();
                cargarTabla();
                cargarSaldoTotal();
            } else {
                alert('Error al guardar');
            }
        } catch (error) { console.error(error); alert('Error de conexión'); }
    });
});

// --- FUNCIONES GLOBALES ---

async function cargarTabla() {
    try {
        const res = await fetch('/api/financiero/corresponsal');
        const data = await res.json();
        const tbody = document.getElementById('tablaCuerpo');
        tbody.innerHTML = '';

        data.datos.forEach(fila => {
            const filaJson = JSON.stringify(fila).replace(/"/g, '&quot;');
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${fila.fecha}</td>
                <td>${fila.hora}</td>
                <td>${fila.usuario_nombre || 'N/A'}</td>
                
                <td class="col-entrada">${fmt(fila.deposito)}</td>
                <td class="col-entrada">${fmt(fila.recaudo)}</td>
                <td class="col-entrada">${fmt(fila.pago_tc)}</td>
                <td class="col-entrada">${fmt(fila.pago_cartera)}</td>
                
                <td class="col-salida">${fmt(fila.retiro)}</td>
                <td class="col-salida">${fmt(fila.compensacion)}</td>
                
                <td class="col-saldo">${fmt(fila.saldo)}</td>
                <td class="text-center">
                    <button class="btn-action btn-edit" onclick="cargarEdicion('${filaJson}')" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-action btn-delete" onclick="eliminarRegistro(${fila.id})" title="Eliminar">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) { console.error(error); }
}

async function cargarSaldoTotal() {
    try {
        const res = await fetch('/api/financiero/corresponsal/saldo');
        const data = await res.json();
        if (data.success) {
            document.getElementById('granSaldo').textContent = fmt(data.total);
        }
    } catch (error) { console.error(error); }
}

function eliminarRegistro(id) {
    if(!confirm('¿Eliminar este cierre? Afectará el saldo.')) return;

    fetch(`/api/financiero/corresponsal/${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(d => { 
            if(d.success) { cargarTabla(); cargarSaldoTotal(); } 
            else alert('Error: ' + d.message); 
        })
        .catch(() => alert('Error de conexión'));
}

function cargarEdicion(filaStr) {
    const fila = JSON.parse(filaStr);
    
    document.getElementById('editId').value = fila.id;
    document.getElementById('fecha').value = fila.fecha;
    document.getElementById('hora').value = fila.hora;
    document.getElementById('descripcion').value = fila.descripcion;
    
    // Cargar los 6 campos numéricos
    document.getElementById('deposito').value = fila.deposito;
    document.getElementById('recaudo').value = fila.recaudo;
    document.getElementById('pago_tc').value = fila.pago_tc;
    document.getElementById('pago_cartera').value = fila.pago_cartera;
    document.getElementById('retiro').value = fila.retiro;
    document.getElementById('compensacion').value = fila.compensacion;

    editMode = true;
    const btn = document.getElementById('btnSubmit');
    btn.textContent = 'ACTUALIZAR CIERRE';
    btn.style.background = '#ffca28'; // Amarillo
    btn.style.color = 'black';
    
    document.getElementById('btnCancelEdit').style.display = 'inline-block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelarEdicion() {
    document.getElementById('formCorresponsal').reset();
    document.getElementById('editId').value = '';
    
    const now = new Date();
    document.getElementById('fecha').valueAsDate = now;
    document.getElementById('hora').value = now.toTimeString().substring(0,5);

    editMode = false;
    const btn = document.getElementById('btnSubmit');
    btn.textContent = 'GUARDAR CIERRE';
    btn.style.background = '#3949ab'; // Indigo Original
    btn.style.color = 'white';
    
    document.getElementById('btnCancelEdit').style.display = 'none';
}

function fmt(valor) {
    if (!valor) return '$0';
    return parseFloat(valor).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
}

function logout() {
    sessionStorage.removeItem('fin_user');
    window.location.href = 'login2.html';
}

// Modal Ajuste
function abrirModalAjuste() {
    document.getElementById('modalAjuste').style.display = 'flex';
    document.getElementById('nuevoSaldoReal').value = '';
    document.getElementById('nuevoSaldoReal').focus();
}

function cerrarModalAjuste() {
    document.getElementById('modalAjuste').style.display = 'none';
}

async function confirmarAjuste() {
    const nuevoSaldo = document.getElementById('nuevoSaldoReal').value;
    if (!nuevoSaldo) return alert('Ingresa valor');
    const user = JSON.parse(sessionStorage.getItem('fin_user'));

    if (!confirm('¿Crear ajuste de saldo CORRESPONSAL?')) return;

    try {
        const res = await fetch('/api/financiero/corresponsal/ajustar', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nuevo_saldo_real: nuevoSaldo, usuario_id: user.id })
        });
        const d = await res.json();
        if(d.success) {
            alert(d.message);
            cerrarModalAjuste();
            cargarTabla();
            cargarSaldoTotal();
        } else { alert('Error: ' + d.message); }
    } catch(e) { alert('Error conexión'); }
}

// --- FUNCIÓN DE SINCRONIZACIÓN Y ANIMACIÓN ---
async function sincronizarDatosEnVivo() {
    const ids = ['deposito', 'recaudo', 'pago_tc', 'pago_cartera', 'retiro', 'compensacion'];
    
    // 1. Activar animación de "Cargando..."
    ids.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.classList.add('updating-field');
            el.placeholder = "Sincronizando...";
        }
    });

    try {
        // 2. Pedir datos al servidor
        const res = await fetch('/api/financiero/corresponsal/calculo-dia');
        const data = await res.json();

        if (data.success) {
            const d = data.datos;

            // Pequeño delay artificial (500ms) para que se aprecie la animación de carga "Pro"
            setTimeout(() => {
                // 3. Rellenar datos
                asignarValor('deposito', d.deposito);
                asignarValor('recaudo', d.recaudo);
                asignarValor('pago_tc', d.pago_tc);
                asignarValor('pago_cartera', d.pago_cartera);
                asignarValor('retiro', d.retiro);
                asignarValor('compensacion', d.compensacion);

                // 4. Quitar animación
                ids.forEach(id => {
                    const el = document.getElementById(id);
                    if(el) {
                        el.classList.remove('updating-field');
                        el.placeholder = "$ 0"; // Restaurar placeholder
                    }
                });
                
            }, 800); // 0.8 segundos de efecto visual
        }
    } catch (error) {
        console.error("Error sincronizando:", error);
        ids.forEach(id => document.getElementById(id).classList.remove('updating-field'));
    }
}

function asignarValor(id, valor) {
    const el = document.getElementById(id);
    // Solo ponemos el valor si es mayor a 0, para dejarlo limpio si no hubo movimiento
    if (el && valor > 0) {
        el.value = valor;
    } else {
        el.value = ''; // Dejar vacío si es 0 para que se vea el placeholder
    }
}

// --- FUNCIONES PARA EL MODAL DE COMPENSACIONES ---

async function verCompensacionesHoy() {
    const modal = document.getElementById('modalCompensaciones');
    const tbody = document.getElementById('tablaCompensacionesBody');
    
    // 1. Mostrar Modal y Estado de Carga
    modal.style.display = 'flex';
    tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="padding:20px;">Cargando datos...</td></tr>';

    try {
        // 2. Consultar al Backend
        const res = await fetch('/api/financiero/corresponsal/compensaciones-hoy');
        const data = await res.json();

        if (data.success) {
            tbody.innerHTML = ''; // Limpiar

            if (data.datos.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="padding:20px; color:#999;">No hay compensaciones registradas hoy.</td></tr>';
                return;
            }

            // 3. Renderizar filas
            data.datos.forEach(item => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #eee';
                
                tr.innerHTML = `
                    <td style="padding: 10px;">${item.hora}</td>
                    <td style="padding: 10px;">
                        <strong style="color:#555;">${item.usuario}</strong><br>
                        <small style="color:#888;">${item.descripcion || 'Sin descripción'}</small>
                    </td>
                    <td style="padding: 10px; text-align: right; color: #c62828; font-weight: bold;">
                        ${parseFloat(item.monto).toLocaleString('es-CO', {style:'currency', currency:'COP', maximumFractionDigits:0})}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="color:red; padding:20px;">Error de conexión</td></tr>';
    }
}

function cerrarModalCompensaciones() {
    document.getElementById('modalCompensaciones').style.display = 'none';
}