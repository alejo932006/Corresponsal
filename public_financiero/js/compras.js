/* public_financiero/js/compras.js */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Validar Sesión
    const userStr = sessionStorage.getItem('fin_user');
    if (!userStr) { window.location.href = 'login2.html'; return; }
    const user = JSON.parse(userStr);
    document.getElementById('userDisplay').textContent = user.nombre;

    // 2. Inicializar Fecha Hoy
    const now = new Date();
    document.getElementById('fecha_ingreso').valueAsDate = now;
    calcularVencimiento(); // Para que el campo vencimiento no empiece vacío

    cargarCompras();
    checkAlertas(); // Revisar si hay vencimientos para poner el numerito en el botón

    // 3. Guardar Factura
    document.getElementById('formCompras').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const data = {
            usuario_id: user.id,
            nombre_proveedor: document.getElementById('nombre_proveedor').value,
            nit: document.getElementById('nit').value, // Ya viene limpio por el oninput del HTML
            numero_factura: document.getElementById('numero_factura').value,
            valor: document.getElementById('valor').value,
            fecha_ingreso: document.getElementById('fecha_ingreso').value,
            plazo_dias: document.getElementById('plazo_dias').value || 0,
            fecha_vencimiento: document.getElementById('fecha_vencimiento').value
        };

        try {
            const res = await fetch('/api/financiero/compras', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });

            if(res.ok) {
                document.getElementById('formCompras').reset();
                document.getElementById('fecha_ingreso').valueAsDate = new Date();
                calcularVencimiento();
                cargarCompras();
                checkAlertas(); // Actualizar contador
                alert('Compra registrada');
            } else {
                alert('Error al guardar');
            }
        } catch(e) { console.error(e); alert('Error de conexión'); }
    });
});

// --- CÁLCULO DE FECHAS ---
function calcularVencimiento() {
    const fechaIngresoVal = document.getElementById('fecha_ingreso').value;
    const diasPlazo = parseInt(document.getElementById('plazo_dias').value) || 0;

    if (fechaIngresoVal) {
        // Truco para evitar problemas de zona horaria: Crear fecha con hora T12:00:00
        const fechaObj = new Date(fechaIngresoVal + 'T12:00:00'); 
        fechaObj.setDate(fechaObj.getDate() + diasPlazo);
        
        // Formatear a YYYY-MM-DD
        const yyyy = fechaObj.getFullYear();
        const mm = String(fechaObj.getMonth() + 1).padStart(2, '0');
        const dd = String(fechaObj.getDate()).padStart(2, '0');
        
        document.getElementById('fecha_vencimiento').value = `${yyyy}-${mm}-${dd}`;
    }
}

// --- CARGAR TABLA PRINCIPAL ---
async function cargarCompras() {
    try {
        const res = await fetch('/api/financiero/compras');
        const data = await res.json();
        const tbody = document.getElementById('tablaCuerpo');
        tbody.innerHTML = '';

        data.datos.forEach(f => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${f.fecha_ingreso}</td>
                <td style="font-weight:bold;">${f.nombre_proveedor}</td>
                <td>${f.nit}</td>
                <td>${f.numero_factura}</td>
                <td class="text-center">${f.plazo_dias} días</td>
                <td style="color: #d32f2f; font-weight:bold;">${f.fecha_vencimiento}</td>
                <td class="text-right">${fmt(f.valor)}</td>
                <td class="text-center">
                    <button class="btn-delete" onclick="eliminarCompra(${f.id})"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) { console.error(e); }
}

function eliminarCompra(id) {
    if(!confirm('¿Eliminar esta factura?')) return;
    fetch(`/api/financiero/compras/${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(d => { if(d.success) { cargarCompras(); checkAlertas(); } });
}

// --- GESTIÓN DE ALERTAS (MODAL) ---
async function checkAlertas() {
    try {
        const res = await fetch('/api/financiero/compras/alertas');
        const data = await res.json();
        const badge = document.getElementById('badgeAlertas');
        
        if (data.datos.length > 0) {
            badge.textContent = data.datos.length;
            badge.style.display = 'inline-block';
            // Animación visual si hay alertas
            badge.style.animation = 'pulse 1.5s infinite';
        } else {
            badge.style.display = 'none';
        }
    } catch(e) {}
}

async function verAlertas() {
    const modal = document.getElementById('modalAlertas');
    const tbody = document.getElementById('tablaAlertasCuerpo');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cargando...</td></tr>';
    modal.style.display = 'flex';

    try {
        const res = await fetch('/api/financiero/compras/alertas');
        const data = await res.json();
        tbody.innerHTML = '';

        if (data.datos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">¡Todo al día! No hay facturas próximas a vencer.</td></tr>';
        } else {
            data.datos.forEach(f => {
                const dias = parseInt(f.dias_restantes);
                let etiqueta = '';
                
                if (dias < 0) etiqueta = `<span class="tag-vencido">VENCIDA HACE ${Math.abs(dias)} DÍAS</span>`;
                else if (dias === 0) etiqueta = `<span class="tag-vencido">VENCE HOY</span>`;
                else etiqueta = `<span class="tag-proximo">VENCE EN ${dias} DÍAS</span>`;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight:bold;">${f.nombre_proveedor}</td>
                    <td>${f.numero_factura}</td>
                    <td>${f.fecha_vencimiento}</td>
                    <td class="text-center">${etiqueta}</td>
                    <td class="text-right" style="font-weight:bold;">${fmt(f.valor)}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch(e) { console.error(e); }
}

function cerrarAlertas() {
    document.getElementById('modalAlertas').style.display = 'none';
}

function fmt(v) { return parseFloat(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP' }); }
function logout() { sessionStorage.removeItem('fin_user'); window.location.href = 'login2.html'; }

// ==========================================
// LÓGICA ERP PROVEEDORES AVANZADA
// ==========================================

let cacheERP = [];      // Datos crudos del ERP
let cacheLocales = [];  // Datos crudos Locales

async function consultarProveedoresERP() {
    const modal = document.getElementById('modalERP');
    const loading = document.getElementById('loadingERP');
    const tabla = document.getElementById('tablaERP');
    
    modal.style.display = 'flex';
    loading.style.display = 'block';
    tabla.style.display = 'none';
    
    // Reseteamos filtros visuales al abrir
    document.getElementById('erpFilterText').value = '';
    document.getElementById('erpFilterDate').value = '';
    
    // Limpiamos totales visuales
    actualizarTotalesUI(0, 0);

    try {
        const res = await fetch('/api/financiero/erp/proveedores');
        const data = await res.json();
        
        loading.style.display = 'none';
        
        if(data.success) {
            tabla.style.display = 'table';
            cacheERP = data.erp;     // Guardamos en memoria global
            cacheLocales = data.local; // Guardamos en memoria global

            // Llamamos a la función que filtra y dibuja (sin filtros iniciales mostrará todo)
            aplicarFiltrosERP();

        } else {
            alert('Error: ' + data.message);
            cerrarModalERP();
        }

    } catch (e) {
        console.error(e);
        loading.style.display = 'none';
        alert('Error conectando al ERP');
    }
}

// --- FUNCIÓN DE FILTRADO Y RENDERIZADO ---
function aplicarFiltrosERP() {
    const texto = document.getElementById('erpFilterText').value.toLowerCase();
    const fecha = document.getElementById('erpFilterDate').value; // YYYY-MM-DD
    const tbody = document.getElementById('tablaERPCuerpo');
    tbody.innerHTML = '';

    let totalFiltrado = 0;
    let contadorFiltrado = 0;

    // 1. FILTRAR
    const listaFiltrada = cacheERP.filter(item => {
        // Filtro Texto (NIT, Nombre o Factura)
        const coincideTexto = 
            item.nombre.toLowerCase().includes(texto) || 
            item.nit.includes(texto) || 
            item.numero_factura.toLowerCase().includes(texto);
        
        // Filtro Fecha (Si el usuario puso fecha, debe coincidir exacta)
        // Nota: item.fecha_factura viene como YYYY-MM-DD del backend
        const coincideFecha = fecha ? (item.fecha_factura === fecha) : true;

        return coincideTexto && coincideFecha;
    });

    // 2. DIBUJAR FILAS
    if(listaFiltrada.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No se encontraron facturas con esos filtros.</td></tr>';
        actualizarTotalesUI(0, 0);
        return;
    }

    listaFiltrada.forEach((item, index) => {
        // Cálculo de Totales
        const valorERP = parseFloat(item.saldo_pendiente);
        totalFiltrado += valorERP;
        contadorFiltrado++;

        // Lógica de comparación con Local (Usando cacheLocales global)
        const match = cacheLocales.find(l => 
            l.nit == item.nit && 
            l.numero_factura == item.numero_factura
        );
        const valorLocal = match ? parseFloat(match.valor) : 0;
        const diferencia = Math.abs(valorERP - valorLocal);

        // Definir estados
        let estadoHtml = '';
        let accionHtml = '';
        let claseFila = '';

        // Necesitamos el índice REAL del array original para sincronizar correctamente
        // Buscamos el índice en cacheERP original basado en NIT y Factura
        const indexOriginal = cacheERP.findIndex(x => x.nit === item.nit && x.numero_factura === item.numero_factura);

        if (!match) {
            estadoHtml = '<span class="tag-new">NUEVA</span>';
            accionHtml = `<button class="btn-sync" onclick="sincronizarFactura(${indexOriginal})" title="Agregar Factura"><i class="fa-solid fa-plus"></i></button>`;
        } else if (diferencia < 100) {
            estadoHtml = '<span class="tag-ok">SYNC OK</span>';
            accionHtml = '<i class="fa-solid fa-check" style="color:#2e7d32"></i>';
        } else {
            estadoHtml = `<span class="tag-diff">DIF: ${fmt(valorERP - valorLocal)}</span>`;
            claseFila = 'style="background-color: #fff8e1;"';
            accionHtml = `<button class="btn-sync" onclick="sincronizarFactura(${indexOriginal})" title="Actualizar Valor" style="background:#ef6c00;"><i class="fa-solid fa-rotate"></i></button>`;
        }

        const tr = document.createElement('tr');
        if(claseFila) tr.style = "background-color: #fff8e1;";
        
        tr.innerHTML = `
            <td>${item.fecha_factura}</td>
            <td>
                <div style="font-weight:bold;">${item.nombre}</div>
                <small style="color:#666;">NIT: ${item.nit}</small>
            </td>
            <td style="font-weight:bold;">${item.numero_factura}</td>
            <td class="text-right">${fmt(valorERP)}</td>
            <td class="text-right" style="color:#666;">${match ? fmt(valorLocal) : '-'}</td>
            <td class="text-center">${estadoHtml}</td>
            <td class="text-center">${accionHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    // 3. ACTUALIZAR TOTALES VISUALES
    actualizarTotalesUI(totalFiltrado, contadorFiltrado);
}

function actualizarTotalesUI(monto, cantidad) {
    document.getElementById('erpTotalDeuda').textContent = fmt(monto);
    document.getElementById('erpTotalFacturas').textContent = cantidad;
}

function limpiarFiltrosERP() {
    document.getElementById('erpFilterText').value = '';
    document.getElementById('erpFilterDate').value = '';
    aplicarFiltrosERP(); // Recarga todo
}

async function sincronizarFactura(index) {
    const item = cacheERP[index];
    
    // Confirmación
    if(!confirm(`¿Importar factura ${item.numero_factura} de ${item.nombre}?`)) return;

    const user = JSON.parse(sessionStorage.getItem('fin_user'));

    // Preparamos datos para guardar (Usamos la misma estructura que el formulario manual)
    const data = {
        usuario_id: user.id,
        nombre_proveedor: item.nombre,
        nit: item.nit,
        numero_factura: item.numero_factura,
        valor: item.saldo_pendiente,
        fecha_ingreso: item.fecha_factura,
        plazo_dias: 30, // Asumimos 30 días por defecto, o puedes preguntar
        // Calculamos vencimiento (Fecha Factura + 30 días)
        fecha_vencimiento: calcularFechaVencimientoManual(item.fecha_factura, 30) 
    };

    try {
        // REUTILIZAMOS LA API DE GUARDAR COMPRA
        // NOTA: Si ya existe (por NIT/Factura), tu backend actual hace un INSERT.
        // Lo ideal sería que el backend hiciera "UPSERT" (Actualizar si existe).
        // Por ahora, asumimos que si es "Actualizar", el usuario borró la vieja o aceptamos duplicado corregido.
        // O mejor: Podemos llamar a DELETE primero si existía con diferencia?
        // Simplificación: Insertamos. Si quieres evitar duplicados estrictos, habría que modificar el backend para UPDATE.
        
        const res = await fetch('/api/financiero/compras', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });

        if(res.ok) {
            alert('Factura sincronizada correctamente');
            consultarProveedoresERP(); // Recargar modal para ver el "Check" verde
            cargarCompras(); // Recargar tabla de fondo
            checkAlertas();  // Actualizar alertas
        } else {
            alert('Error al sincronizar');
        }
    } catch(e) { console.error(e); alert('Error de conexión'); }
}

// Auxiliar para calcular fecha en JS sin usar el DOM
function calcularFechaVencimientoManual(fechaStr, dias) {
    const d = new Date(fechaStr + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
}

function cerrarModalERP() {
    document.getElementById('modalERP').style.display = 'none';
}