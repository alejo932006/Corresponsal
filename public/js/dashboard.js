document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificar si hay usuario (Simulación básica de seguridad)
    // En el login.js, deberíamos guardar el nombre en localStorage. 
    // Si no lo hicimos, mostraremos "Invitado" por ahora.
    
    const usuario = localStorage.getItem('usuario_nombre') || 'Usuario';
    document.getElementById('nombreUsuario').textContent = usuario;

    // 2. Poner la fecha de hoy
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('fechaHoy').textContent = new Date().toLocaleDateString('es-CO', opciones);

    // 3. Botón de Cerrar Sesión
    document.getElementById('btnLogout').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('usuario_nombre');
        window.location.href = 'login.html';
    });

    async function cargarDatosDashboard() {
        try {
            const response = await fetch('/api/resumen');
            const data = await response.json();
    
            if (data.success) {
                // A. Actualizar Tarjetas (KPIs)
                // Usamos una función para formatear dinero bonito ($ 1.000.000)
                const formatoMoneda = new Intl.NumberFormat('es-CO', { 
                    style: 'currency', 
                    currency: 'COP', 
                    minimumFractionDigits: 0 
                });
    
                // Si el valor viene nulo (base de datos vacía), ponemos 0
                const caja = data.totales.saldo_caja || 0;
                const banco = data.totales.saldo_banco || 0;
                const deuda = data.totales.deuda_empresa || 0;
    
                document.getElementById('saldoCaja').textContent = formatoMoneda.format(caja);
                document.getElementById('saldoBanco').textContent = formatoMoneda.format(banco);
                document.getElementById('deudaEmpresa').textContent = formatoMoneda.format(deuda);
    
                // Colores dinámicos: Si la caja está negativa (¡Alerta!), ponerla roja
                if (caja < 0) document.getElementById('saldoCaja').style.color = 'red';
    
                // B. Actualizar Tabla de Movimientos
                const tbody = document.getElementById('tablaMovimientos');
                tbody.innerHTML = ''; // Limpiar "Cargando..."
    
                data.movimientos.forEach(mov => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${mov.hora}</td>
                        <td>${mov.tipo}</td>
                        <td>${mov.descripcion}</td>
                        <td style="font-weight:bold">${formatoMoneda.format(mov.monto)}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
    
        } catch (error) {
            console.error('Error cargando dashboard:', error);
        }
    }

    cargarDatosDashboard();
});