/* public_financiero/js/utilidad.js */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Sesión
    const userStr = sessionStorage.getItem('fin_user');
    if (!userStr) { window.location.href = 'login2.html'; return; }
    document.getElementById('userDisplay').textContent = JSON.parse(userStr).nombre;

    // 2. Fecha hoy
    document.getElementById('fecha').valueAsDate = new Date();

    // 3. Cargar Datos
    cargarResumen();
    cargarMovimientos();
    cambiarCategorias(); // Llenar datalist inicial

    // 4. Submit Formulario
    document.getElementById('formPnl').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const user = JSON.parse(userStr);
        const data = {
            usuario_id: user.id,
            fecha: document.getElementById('fecha').value,
            tipo: document.getElementById('tipo').value,
            categoria: document.getElementById('categoria').value,
            descripcion: document.getElementById('descripcion').value,
            valor: document.getElementById('valor').value
        };

        try {
            const res = await fetch('/api/financiero/pnl', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            if(res.ok) {
                document.getElementById('formPnl').reset();
                document.getElementById('fecha').valueAsDate = new Date();
                cambiarCategorias(); // Restaurar datalist
                cargarResumen();
                cargarMovimientos();
            } else { alert('Error al guardar'); }
        } catch(e) { console.error(e); }
    });
});

async function cargarResumen() {
    try {
        const res = await fetch('/api/financiero/pnl/resumen');
        const data = await res.json();
        if(data.success) {
            // Reutilizamos la función visual
            actualizarDashboard({
                ventas: data.ventas,
                costos: data.costos,
                gastos: data.gastos,
                utilidad: data.utilidad
            });
        }
    } catch(e) {}
}

async function cargarMovimientos() {
    try {
        const res = await fetch('/api/financiero/pnl/movimientos');
        const data = await res.json();
        if (data.success) {
            actualizarTabla(data.datos);
        }
    } catch(e) {}
}

function eliminarMovimiento(id) {
    if(!confirm('¿Eliminar registro?')) return;
    fetch(`/api/financiero/pnl/${id}`, { method: 'DELETE' })
        .then(() => { cargarResumen(); cargarMovimientos(); });
}

// Sugerir categorías según el tipo seleccionado
function cambiarCategorias() {
    const tipo = document.getElementById('tipo').value;
    const lista = document.getElementById('listaCategorias');
    lista.innerHTML = '';
    
    let opciones = [];
    if(tipo === 'VENTA') opciones = ['Mostrador', 'Domicilios', 'Empresarial', 'Otros Ingresos'];
    else if(tipo === 'COSTO') opciones = ['Mercancía General', 'Lácteos', 'Carnes', 'Bebidas', 'Aseo', 'Fletes'];
    else if(tipo === 'GASTO') opciones = ['Nómina', 'Energía', 'Agua', 'Internet', 'Arriendo', 'Mantenimiento', 'Insumos Aseo', 'Publicidad'];

    opciones.forEach(op => {
        const option = document.createElement('option');
        option.value = op;
        lista.appendChild(option);
    });
}

function fmt(v) { return parseFloat(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP' }); }
function logout() { sessionStorage.removeItem('fin_user'); window.location.href = 'login2.html'; }

function abrirModalBusqueda() {
    document.getElementById('modalBusqueda').style.display = 'flex';
    // Por defecto sugerimos el mes actual
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    
    // Primer y último día del mes
    document.getElementById('filtro_inicio').value = `${y}-${m}-01`;
    document.getElementById('filtro_fin').value = new Date().toISOString().split('T')[0];
}

function cerrarModalBusqueda() {
    document.getElementById('modalBusqueda').style.display = 'none';
}

async function ejecutarFiltro() {
    const inicio = document.getElementById('filtro_inicio').value;
    const fin = document.getElementById('filtro_fin').value;
    
    if(!inicio || !fin) return alert('Selecciona ambas fechas');

    try {
        const res = await fetch(`/api/financiero/pnl/filtrar?inicio=${inicio}&fin=${fin}`);
        const data = await res.json();

        if (data.success) {
            // Actualizar Tarjetas
            actualizarDashboard(data.resumen);
            // Actualizar Tabla
            actualizarTabla(data.movimientos);
            
            // Actualizar Etiqueta
            document.getElementById('rangoFechasLabel').textContent = `Del ${inicio} al ${fin}`;
            document.getElementById('rangoFechasLabel').style.background = '#fff3e0'; // Naranja suave para indicar filtro
            document.getElementById('rangoFechasLabel').style.color = '#e65100';

            cerrarModalBusqueda();
        }
    } catch (e) { console.error(e); alert('Error al buscar'); }
}

async function resetearFiltro() {
    // Vuelve a cargar lo normal (Mes Actual)
    cargarResumen();
    cargarMovimientos();
    
    document.getElementById('rangoFechasLabel').textContent = "Mes Actual";
    document.getElementById('rangoFechasLabel').style.background = '#eceff1';
    document.getElementById('rangoFechasLabel').style.color = '#546e7a';
    
    cerrarModalBusqueda();
}

// --- ACTUALIZACIÓN VISUAL (Refactorizado) ---

function actualizarDashboard(datos) {
    document.getElementById('valVentas').textContent = fmt(datos.ventas);
    document.getElementById('valCostos').textContent = fmt(datos.costos);
    document.getElementById('valGastos').textContent = fmt(datos.gastos);
    
    const utilEl = document.getElementById('valUtilidad');
    const cardEl = document.getElementById('cardUtilidad');
    
    utilEl.textContent = fmt(datos.utilidad);
    
    if(datos.utilidad >= 0) {
        cardEl.style.borderBottom = '4px solid #1e88e5';
        utilEl.style.color = '#1565c0';
    } else {
        cardEl.style.borderBottom = '4px solid #d32f2f';
        utilEl.style.color = '#d32f2f';
    }
}

function actualizarTabla(lista) {
    const tbody = document.getElementById('tablaCuerpo');
    tbody.innerHTML = '';

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No se encontraron movimientos en este rango.</td></tr>';
        return;
    }

    lista.forEach(m => {
        let tagClass = '';
        if(m.tipo === 'VENTA') tagClass = 'tag-venta';
        else if(m.tipo === 'COSTO') tagClass = 'tag-costo';
        else tagClass = 'tag-gasto';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${m.fecha.split('T')[0]}</td>
            <td><span class="tag ${tagClass}">${m.tipo}</span></td>
            <td>${m.categoria || '-'}</td>
            <td>${m.descripcion || ''}</td>
            <td class="text-right">${fmt(m.valor)}</td>
            <td class="text-center">
                <button class="btn-del" onclick="eliminarMovimiento(${m.id})"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}