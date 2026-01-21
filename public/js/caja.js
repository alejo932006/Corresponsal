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