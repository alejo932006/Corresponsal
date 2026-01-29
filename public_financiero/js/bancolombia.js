let offsetActual = 0;
const LIMITE_CARGA = 50;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificar Sesión
    const userStr = sessionStorage.getItem('fin_user');
    if (!userStr) {
        window.location.href = 'login2.html';
        return;
    }
    const user = JSON.parse(userStr);
    document.getElementById('userDisplay').textContent = user.nombre;

    // 2. Iniciar Fechas
    const now = new Date();
    document.getElementById('fecha').valueAsDate = now;
    document.getElementById('hora').value = now.toTimeString().substring(0,5);

    cargarTabla(true);
    cargarSaldoTotal();

    // 2. Modificar el EventListener del Submit
    document.getElementById('formBanco').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editId').value;
        
        const data = {
            fecha: document.getElementById('fecha').value,
            hora: document.getElementById('hora').value,
            descripcion: document.getElementById('descripcion').value,
            entrada: document.getElementById('entrada').value || 0,
            salida: document.getElementById('salida').value || 0,
            usuario_id: JSON.parse(sessionStorage.getItem('fin_user')).id
        };

        let url = '/api/financiero/bancolombia';
        let method = 'POST';

        // SI ESTAMOS EDITANDO
        if (editMode && id) {
            url = `/api/financiero/bancolombia/${id}`; // Ruta PUT
            method = 'PUT';
        }

        const res = await fetch(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });

        if(res.ok) {
            cancelarEdicion(); // Resetea todo
            cargarTabla(true);
            cargarSaldoTotal();
        } else {
            alert('Error al guardar');
        }
    });
});

    // 3. Agregar funciones de Edición
function eliminarRegistro(id) {
    if(!confirm('¿Eliminar registro de Bancolombia?')) return;
    fetch(`/api/financiero/bancolombia/${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(d => { if(d.success) { cargarTabla(true); cargarSaldoTotal(); } else alert('Error'); });
}

function cargarEdicion(filaStr) {
    const fila = JSON.parse(filaStr);
    document.getElementById('editId').value = fila.id;
    document.getElementById('fecha').value = fila.fecha;
    // Recuerda el truco de la hora si no carga (el formato debe ser HH:mm 24h)
    document.getElementById('descripcion').value = fila.descripcion;
    document.getElementById('entrada').value = fila.entrada;
    document.getElementById('salida').value = fila.salida;

    editMode = true;
    const btn = document.getElementById('btnSubmit');
    btn.textContent = 'ACTUALIZAR';
    btn.style.background = '#ffca28'; // Amarillo alerta
    btn.style.color = 'black';
    document.getElementById('btnCancelEdit').style.display = 'inline-block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelarEdicion() {
    document.getElementById('formBanco').reset();
    document.getElementById('editId').value = '';
    
    const now = new Date();
    document.getElementById('fecha').valueAsDate = now;
    document.getElementById('hora').value = now.toTimeString().substring(0,5);

    editMode = false;
    const btn = document.getElementById('btnSubmit');
    btn.textContent = 'REGISTRAR';
    btn.style.background = '#000'; // Negro original de Bancolombia
    btn.style.color = '#FDDA24';   // Amarillo original
    document.getElementById('btnCancelEdit').style.display = 'none';
}

let editMode = false;

// --- FUNCIÓN CARGAR TABLA MODIFICADA ---
async function cargarTabla(resetear = false) {
    const btnCargar = document.getElementById('btnCargarMas');
    const tbody = document.getElementById('tablaCuerpo');

    if (resetear) {
        offsetActual = 0;
        tbody.innerHTML = ''; // Limpiamos tabla solo si es reset
    }

    try {
        // Pedimos al backend con limit y offset
        const res = await fetch(`/api/financiero/bancolombia?limit=${LIMITE_CARGA}&offset=${offsetActual}`);
        const data = await res.json();

        if (data.success) {
            data.datos.forEach(fila => {
                const tr = document.createElement('tr');
                const filaJson = JSON.stringify(fila).replace(/"/g, '&quot;');
                tr.innerHTML = `
                    <td>${fila.fecha}</td>
                    <td>${fila.hora}</td>
                    <td>${fila.usuario_nombre || 'N/A'}</td>
                    <td>${fila.descripcion}</td>
                    <td class="text-right green-text">${formatoMoneda(fila.entrada)}</td>
                    <td class="text-right red-text">${formatoMoneda(fila.salida)}</td>
                    <td class="text-right val-saldo">${formatoMoneda(fila.saldo)}</td>
                    <td class="text-center">
                        <button class="btn-action btn-edit" onclick="cargarEdicion('${filaJson}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-action btn-delete" onclick="eliminarRegistro(${fila.id})"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Aumentamos el offset para la próxima vez
            offsetActual += data.datos.length;

            // Lógica del botón "Cargar Más"
            if (data.datos.length < LIMITE_CARGA) {
                // Si trajo menos de 50, es que ya no hay más
                btnCargar.style.display = 'none';
            } else {
                // Si trajo 50, probablemente haya más
                btnCargar.style.display = 'inline-block';
            }
        }
    } catch (error) {
        console.error('Error cargando tabla:', error);
    }
}

function cargarMasRegistros() {
    cargarTabla(false); // false = NO borrar lo que ya hay, solo agregar
}

async function cargarSaldoTotal() {
    try {
        const res = await fetch('/api/financiero/bancolombia/saldo');
        const data = await res.json();
        if (data.success) {
            document.getElementById('granSaldo').textContent = formatoMoneda(data.total);
        }
    } catch (error) { console.error(error); }
}

function formatoMoneda(valor) {
    if (!valor) return '$0.00';
    return parseFloat(valor).toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
}

function logout() {
    sessionStorage.removeItem('fin_user');
    window.location.href = 'login2.html';
}

// --- Lógica del Modal ---
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
    if (nuevoSaldo === '') return alert('Ingresa un valor');

    const user = JSON.parse(sessionStorage.getItem('fin_user'));

    if (!confirm('¿Ajustar saldo de BANCOLOMBIA?')) return;

    try {
        const res = await fetch('/api/financiero/bancolombia/ajustar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nuevo_saldo_real: nuevoSaldo,
                usuario_id: user.id
            })
        });

        const data = await res.json();
        if (data.success) {
            alert(data.message);
            cerrarModalAjuste();
            cargarTabla(true);
            cargarSaldoTotal();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) { alert('Error de conexión'); }
}

