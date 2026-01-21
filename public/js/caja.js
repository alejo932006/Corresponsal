const usuario = localStorage.getItem('usuario_nombre');
const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nombreUsuario').textContent = usuario;
    verificarEstadoCaja();
    
    // Logout listener
    document.getElementById('btnLogout').addEventListener('click', (e) => { /* Igual al anterior */ });
});

async function verificarEstadoCaja() {
    try {
        const res = await fetch(`/api/estado-caja?usuario=${usuario}`);
        const data = await res.json();

        // Ocultar todo primero
        document.getElementById('viewApertura').style.display = 'none';
        document.getElementById('viewCierre').style.display = 'none';
        document.getElementById('viewResumen').style.display = 'none';

        if (data.estado === 'SIN_APERTURA') {
            document.getElementById('viewApertura').style.display = 'block';
        } else if (data.estado === 'ABIERTA') {
            document.getElementById('viewCierre').style.display = 'block';
            document.getElementById('txtSaldoSistema').textContent = formato.format(data.datos.saldo_actual_calculado);
        } else if (data.estado === 'CERRADA') {
            mostrarResumen(data.datos);
        }

    } catch (error) { console.error(error); }
}

async function realizarApertura() {
    const monto = document.getElementById('inputBaseInicial').value;
    if (!monto) return alert("Ingresa un monto válido");

    await fetch('/api/apertura-caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_nombre: usuario, monto: monto })
    });

    verificarEstadoCaja(); // Recargar estado
}

async function realizarCierre() {
    const fisico = document.getElementById('inputCierreFisico').value;
    if (!fisico) return alert("Debes contar el dinero físico primero.");

    if (!confirm("¿Estás seguro de cerrar la caja? Ya no podrás registrar más operaciones hoy.")) return;

    const res = await fetch('/api/cerrar-caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_nombre: usuario, monto_fisico: fisico })
    });

    const data = await res.json();
    if (data.success) {
        verificarEstadoCaja(); // Esto cargará automáticamente la vista de resumen
    } else {
        alert("Error: " + data.message);
    }
}

function mostrarResumen(datos) {
    document.getElementById('viewResumen').style.display = 'block';
    
    document.getElementById('resInicial').textContent = formato.format(datos.monto_inicial);
    document.getElementById('resSistema').textContent = formato.format(datos.monto_final_sistema);
    document.getElementById('resReal').textContent = formato.format(datos.monto_final_real);
    
    const dif = parseFloat(datos.diferencia);
    const elDif = document.getElementById('resDiferencia');
    elDif.textContent = formato.format(dif);
    
    if(dif === 0) { elDif.style.color = 'green'; elDif.textContent += " (Perfecto)"; }
    else if(dif < 0) { elDif.style.color = 'red'; elDif.textContent += " (Faltante)"; }
    else { elDif.style.color = 'blue'; elDif.textContent += " (Sobrante)"; }
}

// Agrega esta función al final del archivo public/js/caja.js

async function reabrirCaja() {
    if (!confirm("⚠️ ¿Estás seguro de REABRIR la caja?\n\nEsto anulará el cierre actual y te permitirá seguir registrando transacciones hoy.")) {
        return;
    }

    try {
        const res = await fetch('/api/reabrir-caja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_nombre: usuario })
        });

        const data = await res.json();

        if (data.success) {
            // Recargamos el estado: Ahora detectará que está 'ABIERTA' 
            // y te mostrará la pantalla de operaciones automáticamente.
            verificarEstadoCaja(); 
        } else {
            alert("Error: " + data.message);
        }
    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    }
}

async function imprimirReporte() {
    try {
        // 1. Obtener datos del servidor
        const res = await fetch(`/api/reporte-cierre?usuario=${usuario}`);
        const data = await res.json();

        if (!data.success) return alert("Error obteniendo datos del reporte");

        const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

        // 2. Llenar Cabecera
        document.getElementById('printFecha').textContent = data.fecha + ' ' + new Date().toLocaleTimeString();
        document.getElementById('printCajero').textContent = usuario;

        // 3. Llenar Tabla RESUMEN (Totales)
        const tbodyResumen = document.getElementById('printTablaResumen');
        tbodyResumen.innerHTML = '';
        
        let granTotal = 0; // Solo referencial

        data.resumen.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.concepto} <small>(${item.cantidad})</small></td>
                <td class="col-val">${formato.format(item.total_valor)}</td>
            `;
            tbodyResumen.appendChild(tr);
        });

        // 4. Llenar Tabla DETALLE (Lista larga)
        const tbodyDetalle = document.getElementById('printTablaDetalle');
        tbodyDetalle.innerHTML = '';

        data.detalle.forEach(mov => {
            const tr = document.createElement('tr');
            // Cortamos la descripción si es muy larga para que quepa en 80mm
            const descCorta = mov.descripcion.length > 15 ? mov.descripcion.substring(0, 15) + '..' : mov.descripcion;
            
            tr.innerHTML = `
                <td>${mov.hora}</td>
                <td>
                    <strong>${mov.tipo.substring(0,10)}</strong><br>
                    <small>${descCorta}</small>
                </td>
                <td style="text-align:right">${formato.format(mov.monto)}</td>
            `;
            tbodyDetalle.appendChild(tr);
        });

        // Poner el total final que calculó el sistema en el cierre (lo tomamos del HTML actual o de los datos)
        const saldoSistema = document.getElementById('resSistema').textContent;
        document.getElementById('printTotalFinal').textContent = saldoSistema;

        // 5. INICIAR IMPRESIÓN
        window.print();

    } catch (error) {
        console.error("Error al imprimir:", error);
        alert("Hubo un error generando el reporte");
    }
}

function prepararNuevoTurno() {
    // Simplemente ocultamos el resumen y mostramos el formulario de apertura
    document.getElementById('viewResumen').style.display = 'none';
    document.getElementById('viewApertura').style.display = 'block';
    
    // Limpiamos el input para que no quede el valor de la mañana
    document.getElementById('inputBaseInicial').value = '';
    document.getElementById('inputBaseInicial').focus();
}