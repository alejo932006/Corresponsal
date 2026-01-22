document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificar Usuario
    const usuario = localStorage.getItem('usuario_nombre');
    if (!usuario) window.location.href = 'login.html';
    document.getElementById('nombreUsuario').textContent = usuario;

    // Logout
    document.getElementById('btnLogout').addEventListener('click', () => {
        localStorage.removeItem('usuario_nombre');
        window.location.href = 'login.html';
    });

    cargarDatosIniciales();
    cargarHistorial();

    // 2. Manejar el Formulario
    document.getElementById('formCompensacion').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const bancoId = document.getElementById('selectBanco').value;
        const monto = document.getElementById('inputMonto').value;
        const ref = document.getElementById('inputRef').value;
        
        // Buscamos el ID del tipo "Compensación Bancaria" que guardamos al cargar
        const tipoId = localStorage.getItem('idTipoCompensacion'); 

        if (!tipoId) return alert("Error: No se encontró el tipo de transacción 'Compensación' en la configuración.");

        if (!confirm(`¿Confirmas que CONSIGNASTE $${monto} al Banco?`)) return;

        try {
            const res = await fetch('/api/transacciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usuario_nombre: usuario,
                    tipo_id: tipoId,     // Aquí usamos el ID automático
                    banco_id: bancoId,
                    monto: monto,
                    descripcion: `COMPENSACIÓN: ${ref}`
                })
            });

            const data = await res.json();
            
            if (data.success) {
                alert("✅ Compensación registrada con éxito. Tu cupo ha aumentado.");
                document.getElementById('formCompensacion').reset();
                cargarHistorial(); // Recargar tabla
            } else {
                alert("❌ Error: " + data.message);
            }
        } catch (error) {
            console.error(error);
            alert("Error de conexión");
        }
    });
});

async function cargarDatosIniciales() {
    try {
        const res = await fetch('/api/config-formulario');
        const data = await res.json();
        
        if (data.success) {
            // A. Llenar Bancos
            const select = document.getElementById('selectBanco');
            select.innerHTML = '';
            data.bancos.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.id;
                opt.textContent = b.nombre;
                select.appendChild(opt);
            });

            // B. Encontrar y guardar el ID de "Compensación Bancaria"
            // Buscamos en la lista de tipos que trajo el servidor
            const tipoCompensacion = data.tipos.find(t => 
                t.nombre.toLowerCase().includes('compensación') || 
                t.nombre.toLowerCase().includes('compensacion')
            );

            if (tipoCompensacion) {
                localStorage.setItem('idTipoCompensacion', tipoCompensacion.id);
            } else {
                alert("⚠️ ADVERTENCIA: No se encontró el tipo de transacción 'Compensación Bancaria' en la base de datos. Asegúrate de haber ejecutado el script SQL.");
            }
        }
    } catch (error) {
        console.error(error);
    }
}

async function cargarHistorial() {
    const usuario = localStorage.getItem('usuario_nombre');
    const tbody = document.getElementById('tablaHistorial');
    const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    try {
        const res = await fetch(`/api/compensaciones?usuario=${usuario}`);
        const data = await res.json();

        if (data.success) {
            tbody.innerHTML = '';
            data.movimientos.forEach(mov => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${mov.fecha}</td>
                    <td>${mov.banco}</td>
                    <td>${mov.descripcion.replace('COMPENSACIÓN: ', '')}</td>
                    <td class="monto-highlight" style="text-align:right;">${formato.format(mov.monto)}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="4">Error cargando historial</td></tr>';
    }
}