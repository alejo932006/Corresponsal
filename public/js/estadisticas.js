document.addEventListener('DOMContentLoaded', () => {
    const usuario = localStorage.getItem('usuario_nombre');
    if (!usuario) window.location.href = 'login.html';
    document.getElementById('nombreUsuario').textContent = usuario;

    // Logout
    document.getElementById('btnLogout').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('usuario_nombre');
        window.location.href = 'login.html';
    });

    // 1. Configurar Fecha Inicial (HOY)
    // Ajuste de zona horaria para que no salga el día anterior
    const hoy = new Date();
    const hoyLocal = new Date(hoy.getTime() - (hoy.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    
    const inputFecha = document.getElementById('filtroFecha');
    inputFecha.value = hoyLocal; // Poner la fecha de hoy en el input

    // 2. Cargar datos iniciales
    cargarMetricas(hoyLocal);

    // 3. Escuchar cambios en la fecha
    inputFecha.addEventListener('change', (e) => {
        cargarMetricas(e.target.value);
    });
});

async function cargarMetricas(fechaSeleccionada) {
    const usuario = localStorage.getItem('usuario_nombre');
    const contenedor = document.getElementById('gridMetricas');
    const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    try {
        // Solicitamos al servidor con el parámetro fecha
        const res = await fetch(`/api/reporte-cierre?usuario=${usuario}&fecha=${fechaSeleccionada}`);
        const data = await res.json();

        if (data.success) {
            contenedor.innerHTML = ''; // Limpiar grid

            let opsTotales = 0;
            let volTotal = 0;
            let maxValor = 0; 

            // Cálculos
            data.resumen.forEach(item => {
                const valor = parseFloat(item.total_valor);
                opsTotales += parseInt(item.cantidad);
                volTotal += valor;
                if (valor > maxValor) maxValor = valor;
            });

            // Actualizar Encabezado
            document.getElementById('totalOps').textContent = opsTotales;
            document.getElementById('totalVolumen').textContent = formato.format(volTotal);

            // Generar Tarjetas
            data.resumen.forEach(item => {
                const valor = parseFloat(item.total_valor);
                const porcentaje = maxValor > 0 ? (valor / maxValor) * 100 : 0;
                
                let claseColor = 'card-blue';
                const nombre = item.concepto.toLowerCase();
                if (nombre.includes('retiro')) claseColor = 'card-purple';
                if (nombre.includes('depósito') || nombre.includes('deposito')) claseColor = 'card-green';
                
                const card = document.createElement('div');
                card.className = `metric-card ${claseColor}`;
                card.innerHTML = `
                    <div class="metric-header">
                        <div class="metric-title">${item.concepto}</div>
                        <div class="metric-badge">Top ${data.resumen.indexOf(item) + 1}</div>
                    </div>
                    <div class="metric-value">${formato.format(valor)}</div>
                    <div class="metric-count">
                        <span style="font-weight:bold; color:#2d3436;">${item.cantidad}</span> operaciones
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${porcentaje}%"></div>
                    </div>
                `;
                contenedor.appendChild(card);
            });

            if (data.resumen.length === 0) {
                contenedor.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:#999; margin-top:20px;">No hubo operaciones en la fecha ${fechaSeleccionada}.</p>`;
            }

        } else {
            console.error("Error trayendo datos");
        }

    } catch (error) {
        console.error(error);
        contenedor.innerHTML = '<p>Error de conexión.</p>';
    }
}