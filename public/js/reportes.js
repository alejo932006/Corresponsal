document.addEventListener('DOMContentLoaded', async () => {
    // 1. Configuración inicial de usuario y fechas
    const usuario = localStorage.getItem('usuario_nombre') || 'Usuario';
    document.getElementById('nombreUsuario').textContent = usuario;
    
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fechaInicio').value = hoy;
    document.getElementById('fechaFin').value = hoy;

    // 2. Logout
    document.getElementById('btnLogout').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('usuario_nombre');
        window.location.href = 'login.html';
    });

    // 3. CARGAR TIPOS DE TRANSACCIÓN EN EL SELECT (NUEVO)
    await cargarTiposEnFiltro();
});

// Función para llenar el select automáticamente
async function cargarTiposEnFiltro() {
    try {
        const res = await fetch('/api/config-formulario'); // Reusamos tu API existente
        const data = await res.json();
        
        if (data.success) {
            const select = document.getElementById('filtroTipo');
            data.tipos.forEach(tipo => {
                const option = document.createElement('option');
                option.value = tipo.id;
                option.textContent = tipo.nombre;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error("Error cargando tipos:", error);
    }
}

async function generarReporte() {
    const usuario = localStorage.getItem('usuario_nombre');
    const inicio = document.getElementById('fechaInicio').value;
    const fin = document.getElementById('fechaFin').value;
    const tipo = document.getElementById('filtroTipo').value; // Obtenemos el valor seleccionado
    
    const tbody = document.getElementById('tablaReporte');
    const panelResumen = document.getElementById('panelResumen');

    if(!inicio || !fin) return alert("Selecciona ambas fechas");

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Cargando...</td></tr>';

    try {
        // ENVIAMOS EL PARÁMETRO 'tipo' EN LA URL
        const res = await fetch(`/api/reportes-rango?usuario=${usuario}&inicio=${inicio}&fin=${fin}&tipo=${tipo}`);
        const data = await res.json();

        if (data.success) {
            // A. Llenar KPIs
            const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
            
            document.getElementById('kpiCantidad').textContent = data.resumen.cantidad_total;
            document.getElementById('kpiVolumen').textContent = formato.format(data.resumen.volumen_negociado || 0);
            document.getElementById('kpiEntradas').textContent = "+ " + formato.format(data.resumen.total_entradas || 0);
            document.getElementById('kpiSalidas').textContent = "- " + formato.format(Math.abs(data.resumen.total_salidas || 0));
            
            panelResumen.style.display = 'grid';

            // B. Llenar Tabla
            tbody.innerHTML = '';
            
            if (data.movimientos.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:#7f8c8d;">No se encontraron movimientos con esos filtros.</td></tr>';
                return;
            }

            data.movimientos.forEach(mov => {
                const tr = document.createElement('tr');
                const esSalida = mov.afecta_caja < 0; 
                const colorMonto = esSalida ? '#e74c3c' : '#27ae60';
                const signo = esSalida ? '- ' : '+ ';

                tr.innerHTML = `
                    <td style="padding:12px; border-bottom:1px solid #eee;">${mov.fecha}</td>
                    <td style="border-bottom:1px solid #eee;"><strong>${mov.tipo}</strong></td>
                    <td style="border-bottom:1px solid #eee; color:#555;">${mov.descripcion}</td>
                    <td style="text-align:right; padding:12px; border-bottom:1px solid #eee; color:${colorMonto}; font-weight:bold;">
                        ${signo}${formato.format(mov.monto)}
                    </td>
                `;
                tbody.appendChild(tr);
            });

        } else {
            alert("Error: " + data.message);
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    }
}