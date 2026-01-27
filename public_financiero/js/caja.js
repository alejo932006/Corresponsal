// VARIABLES GLOBALES
let currentOffset = 0;
const LIMIT = 50;
let editMode = false;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificar Sesión
    const userStr = sessionStorage.getItem('fin_user');
    if (!userStr) { window.location.href = 'login2.html'; return; }
    const user = JSON.parse(userStr);
    document.getElementById('userDisplay').textContent = user.nombre;

    // 2. Pre-llenar fecha y hora
    resetearFormularioFechas();

    // 3. Cargar Datos Iniciales
    cargarSaldoTotal();
    cargarHistorial(); // <--- Esta es la función correcta ahora

    // 4. Manejar Formulario (Guardar/Editar)
    document.getElementById('formCaja').addEventListener('submit', async (e) => {
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

        // Decidir si es Crear o Actualizar
        let url = '/api/financiero/caja-diario';
        let method = 'POST';

        if (editMode && id) {
            url = `/api/financiero/caja-diario/${id}`;
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
                resetearYBuscar(); // Recargar tabla para ver el cambio
                cargarSaldoTotal();
            } else {
                alert('Error al guardar');
            }
        } catch(e) { console.error(e); }
    });
});

// --- FUNCIÓN PRINCIPAL DE CARGA (Paginada y Filtrada) ---
async function cargarHistorial() {
    const busqueda = document.getElementById('busquedaInput').value;
    const btnMas = document.getElementById('btnCargarMas');
    const msgFin = document.getElementById('msgFin');
    const tbody = document.getElementById('tablaHistorial'); // ID CORREGIDO

    // Feedback visual
    btnMas.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';
    btnMas.disabled = true;

    try {
        const res = await fetch(`/api/financiero/caja-diario?busqueda=${encodeURIComponent(busqueda)}&limit=${LIMIT}&offset=${currentOffset}`);
        const data = await res.json();

        if (data.success) {
            const registros = data.datos;

            // Si es la primera carga y está vacía
            if (currentOffset === 0 && registros.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:20px;">No se encontraron movimientos.</td></tr>';
                btnMas.style.display = 'none';
                return;
            }

            // Control del botón "Cargar Más"
            if (registros.length < LIMIT) {
                btnMas.style.display = 'none';
                msgFin.style.display = 'block';
            } else {
                btnMas.style.display = 'inline-block';
                msgFin.style.display = 'none';
            }

            // DIBUJAR FILAS
            registros.forEach(r => {
                // Guardamos JSON para edición
                const filaJson = JSON.stringify(r).replace(/"/g, '&quot;');
                const tr = document.createElement('tr');
                
                // Formato de valores con colores
                const entradaFmt = r.entrada > 0 ? `<span class="val-entrada">${formatoMoneda(r.entrada)}</span>` : '<span style="color:#ccc;">-</span>';
                const salidaFmt = r.salida > 0 ? `<span class="val-salida">${formatoMoneda(r.salida)}</span>` : '<span style="color:#ccc;">-</span>';

                tr.innerHTML = `
                    <td>${r.fecha.split('T')[0]}</td>
                    <td>${r.hora}</td>
                    <td><span class="badge" style="background:#e3f2fd; color:#1565c0; padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold;">${r.categoria || 'General'}</span></td>
                    <td>${r.descripcion}</td>
                    <td class="text-right">${entradaFmt}</td>
                    <td class="text-right">${salidaFmt}</td>
                    <td class="text-center">
                        <button class="btn-action btn-edit" onclick="cargarEdicion('${filaJson}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-action btn-delete" onclick="eliminarRegistro(${r.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (e) {
        console.error(e);
    } finally {
        btnMas.innerHTML = '<i class="fa-solid fa-circle-arrow-down"></i> CARGAR MÁS REGISTROS';
        btnMas.disabled = false;
    }
}

// --- FUNCIONES DE PAGINACIÓN Y BÚSQUEDA ---

function resetearYBuscar() {
    currentOffset = 0;
    const tbody = document.getElementById('tablaHistorial');
    tbody.innerHTML = ''; // Limpiar tabla
    document.getElementById('btnCargarMas').style.display = 'inline-block';
    document.getElementById('msgFin').style.display = 'none';
    cargarHistorial();
}

function cargarMas() {
    currentOffset += LIMIT;
    cargarHistorial();
}

// --- EDICIÓN Y ELIMINACIÓN ---

function cargarEdicion(filaStr) {
    const fila = JSON.parse(filaStr);
    document.getElementById('editId').value = fila.id;
    // Ajuste de fecha para input date (YYYY-MM-DD)
    document.getElementById('fecha').value = fila.fecha.split('T')[0]; 
    document.getElementById('hora').value = fila.hora;
    document.getElementById('descripcion').value = fila.descripcion;
    document.getElementById('entrada').value = fila.entrada;
    document.getElementById('salida').value = fila.salida;

    editMode = true;
    const btn = document.getElementById('btnSubmit');
    btn.textContent = 'ACTUALIZAR';
    btn.style.background = '#ffca28';
    btn.style.color = 'black';
    document.getElementById('btnCancelEdit').style.display = 'inline-block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelarEdicion() {
    document.getElementById('formCaja').reset();
    document.getElementById('editId').value = '';
    resetearFormularioFechas();

    editMode = false;
    const btn = document.getElementById('btnSubmit');
    btn.textContent = 'GUARDAR';
    btn.style.background = '#1e3c72';
    btn.style.color = 'white';
    document.getElementById('btnCancelEdit').style.display = 'none';
}

function resetearFormularioFechas() {
    const now = new Date();
    document.getElementById('fecha').valueAsDate = now;
    document.getElementById('hora').value = now.toTimeString().substring(0,5);
}

function eliminarRegistro(id) {
    if(!confirm('¿Eliminar registro? Se recalculará el saldo.')) return;
    fetch(`/api/financiero/caja-diario/${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            if(data.success) {
                resetearYBuscar(); // Recargar todo
                cargarSaldoTotal();
            } else { alert('Error: ' + data.message); }
        });
}

// --- SALDO Y AUXILIARES ---

async function cargarSaldoTotal() {
    try {
        const res = await fetch('/api/financiero/saldo-total'); // Asegúrate que esta ruta exista en tu backend o usa la de saldo
        const data = await res.json();
        if (data.success) {
            document.getElementById('granSaldo').textContent = formatoMoneda(data.total);
        }
    } catch (e) {}
}

// Lógica Modal Ajuste
function abrirModalAjuste() { document.getElementById('modalAjuste').style.display = 'flex'; }
function cerrarModalAjuste() { document.getElementById('modalAjuste').style.display = 'none'; }

async function confirmarAjuste() {
    const nuevoSaldo = document.getElementById('nuevoSaldoReal').value;
    if (!nuevoSaldo) return alert('Ingresa un valor');
    if (!confirm('¿Seguro que deseas ajustar el saldo?')) return;
    
    const user = JSON.parse(sessionStorage.getItem('fin_user'));

    try {
        const res = await fetch('/api/financiero/ajustar-saldo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nuevo_saldo_real: nuevoSaldo, usuario_id: user.id })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            cerrarModalAjuste();
            resetearYBuscar();
            cargarSaldoTotal();
        } else { alert('Error: ' + data.message); }
    } catch (e) { console.error(e); }
}

function formatoMoneda(valor) {
    return parseFloat(valor).toLocaleString('es-CO', { style: 'currency', currency: 'COP' });
}

function logout() {
    sessionStorage.removeItem('fin_user');
    window.location.href = 'login2.html';
}