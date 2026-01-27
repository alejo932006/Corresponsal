let editMode = false;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificar Sesión
    const userStr = sessionStorage.getItem('fin_user');
    if (!userStr) {
        window.location.href = 'login2.html';
        return;
    }
    const user = JSON.parse(userStr);
    document.getElementById('userDisplay').textContent = user.nombre;

    // 2. Iniciar Fechas (Solo si no estamos editando)
    const now = new Date();
    document.getElementById('fecha').valueAsDate = now;
    document.getElementById('hora').value = now.toTimeString().substring(0, 5);

    // 3. Cargar Datos
    cargarTabla();
    cargarSaldoTotal();

    // 4. Manejar el Formulario
    const form = document.getElementById('formDavi'); // Asegúrate que en HTML el form tenga id="formDavi"
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('editId').value;

        const data = {
            fecha: document.getElementById('fecha').value,
            hora: document.getElementById('hora').value,
            descripcion: document.getElementById('descripcion').value,
            entrada: document.getElementById('entrada').value || 0,
            salida: document.getElementById('salida').value || 0,
            usuario_id: user.id
        };

        let url = '/api/financiero/davivienda';
        let method = 'POST';

        if (editMode && id) {
            url = `/api/financiero/davivienda/${id}`;
            method = 'PUT';
        }

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                cancelarEdicion(); // Limpia el formulario
                cargarTabla();     // Recarga la tabla
                cargarSaldoTotal(); // Actualiza el saldo grande
            } else {
                alert('Error al guardar la transacción.');
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión.');
        }
    });

}); // <--- CIERRE DEL DOMContentLoaded

// --- FUNCIONES GLOBALES ---

async function cargarTabla() {
    try {
        const res = await fetch('/api/financiero/davivienda');
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
                <td>${fila.descripcion}</td>
                <td class="text-right green-text">${formatoMoneda(fila.entrada)}</td>
                <td class="text-right red-text">${formatoMoneda(fila.salida)}</td>
                <td class="text-right val-saldo">${formatoMoneda(fila.saldo)}</td>
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
        const res = await fetch('/api/financiero/davivienda/saldo');
        const data = await res.json();
        if (data.success) {
            document.getElementById('granSaldo').textContent = formatoMoneda(data.total);
        }
    } catch (error) { console.error(error); }
}

function eliminarRegistro(id) {
    if (!confirm('¿Eliminar registro de Davivienda?')) return;
    
    fetch(`/api/financiero/davivienda/${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(d => { 
            if (d.success) { 
                cargarTabla(); 
                cargarSaldoTotal(); 
            } else { 
                alert('Error al eliminar'); 
            } 
        })
        .catch(() => alert('Error de conexión'));
}

function cargarEdicion(filaStr) {
    const fila = JSON.parse(filaStr);
    
    document.getElementById('editId').value = fila.id;
    document.getElementById('fecha').value = fila.fecha;
    document.getElementById('hora').value = fila.hora;
    document.getElementById('descripcion').value = fila.descripcion;
    document.getElementById('entrada').value = fila.entrada;
    document.getElementById('salida').value = fila.salida;

    editMode = true;
    const btn = document.getElementById('btnSubmit');
    btn.textContent = 'ACTUALIZAR';
    btn.style.background = '#ffca28'; // Amarillo Editar
    btn.style.color = 'black';
    
    document.getElementById('btnCancelEdit').style.display = 'inline-block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelarEdicion() {
    document.getElementById('formDavi').reset();
    document.getElementById('editId').value = '';

    const now = new Date();
    document.getElementById('fecha').valueAsDate = now;
    document.getElementById('hora').value = now.toTimeString().substring(0, 5);

    editMode = false;
    const btn = document.getElementById('btnSubmit');
    btn.textContent = 'REGISTRAR';
    btn.style.background = '#ED1C24'; // Rojo Davivienda
    btn.style.color = 'white';
    
    document.getElementById('btnCancelEdit').style.display = 'none';
}

function formatoMoneda(valor) {
    if (!valor) return '$0.00';
    return parseFloat(valor).toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
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
    if (nuevoSaldo === '') return alert('Ingresa un valor');
    const user = JSON.parse(sessionStorage.getItem('fin_user'));

    if (!confirm('¿Ajustar saldo de DAVIVIENDA?')) return;

    try {
        const res = await fetch('/api/financiero/davivienda/ajustar', {
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
            cargarTabla();
            cargarSaldoTotal();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) { alert('Error de conexión'); }
}