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
    const inputBase = document.getElementById('inputBaseInicial');
    const monto = inputBase.value;

    // 1. Validación Básica: Que no esté vacío
    if (!monto || monto < 0) {
        return alert("⚠️ Por favor ingresa un monto base válido.");
    }

    // 2. Formatear el dinero para que el humano lo lea bien
    // Esto evita el error visual de "100000" vs "1000000"
    const montoLegible = new Intl.NumberFormat('es-CO', { 
        style: 'currency', 
        currency: 'COP', 
        minimumFractionDigits: 0 
    }).format(monto);

    // 3. MENÚ DE CONFIRMACIÓN (El paso de seguridad)
    const confirmado = confirm(
        `🛑 CONFIRMACIÓN DE SEGURIDAD\n\n` +
        `Vas a iniciar el turno con una Base Inicial de:\n` +
        `👉 ${montoLegible}\n\n` +
        `¿Confirmas que has contado el dinero físico y coincide?`
    );

    // Si el usuario le da a "Cancelar", detenemos todo.
    if (!confirmado) return;

    // 4. Si aceptó, procedemos con el envío al servidor
    try {
        const res = await fetch('/api/apertura-caja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario_nombre: usuario, monto: monto })
        });

        const data = await res.json();

        if (data.success) {
            verificarEstadoCaja(); // Recargar la pantalla
        } else {
            alert("Error: " + data.message);
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión al abrir la caja");
    }
}

async function realizarCierre() {
    const rol = localStorage.getItem('usuario_rol');
    if (rol !== 'admin') return alert("⛔ Acceso denegado: Solo el Admin puede cerrar caja.");
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
        const res = await fetch(`/api/reporte-cierre?usuario=${usuario}`);
        const data = await res.json();

        if (!data.success) return alert("Error obteniendo datos del reporte");

        const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

        // --- 0. ESTILOS DE IMPRESIÓN (INCRUSTADOS PARA FUERZA BRUTA) ---
        // Esto asegura que la letra sea nítida y negra
        const estilosImpresion = `
            <style>
                @media print {
                    body, html, * {
                        font-family: 'Courier New', Courier, monospace !important; /* Fuente tipo máquina de escribir (NÍTIDA) */
                        color: #000000 !important; /* NEGRO PURO (Evita borrosidad) */
                        text-shadow: none !important;
                        background: none !important;
                        font-weight: 600 !important; /* Un poco más gruesa para legibilidad */
                    }
                    /* Ocultar elementos no deseados */
                    .no-print, nav, .navbar, button { display: none !important; }
                    
                    /* Ajuste de márgenes para tirilla */
                    @page { margin: 0; size: auto; }
                    body { margin: 5px; }

                    /* Tablas limpias */
                    table { width: 100%; border-collapse: collapse; }
                    th { border-bottom: 2px solid black !important; padding: 2px 0; }
                    td { border-bottom: 1px dashed black !important; padding: 2px 0; }
                    
                    /* Títulos de grupo limpios (Sin fondo gris) */
                    .grupo-header { 
                        border-top: 2px solid black; 
                        border-bottom: 1px solid black; 
                        margin-top: 5px; 
                        text-transform: uppercase;
                    }
                }
            </style>
        `;

        // Inyectamos los estilos al documento antes de imprimir
        const divEstilos = document.createElement('div');
        divEstilos.innerHTML = estilosImpresion;
        document.body.appendChild(divEstilos);

        // --- 1. ENCABEZADO (Texto NEGRO y fuente MONOSPACE) ---
        const divHeader = document.querySelector('.ticket-header');
        divHeader.innerHTML = `
            <div style="text-align: center; margin-bottom: 10px; font-family: 'Courier New', monospace;">
                <h2 style="margin: 0; font-size: 1.4rem; font-weight: 900;">CORRESPONSAL BANCARIO</h2>
                <p style="margin: 2px 0; font-weight: bold;">Surtitodo Ideal</p>
                <p style="margin: 2px 0; font-size: 0.9rem;">NIT: 94253367-5</p>
            </div>
            <div style="border-top: 2px solid black; margin: 5px 0; width: 100%;"></div>
            <div style="text-align: center; margin-top: 5px; font-family: 'Courier New', monospace;">
                <h3 style="margin: 0; font-size: 1.1rem; font-weight: 900;">REPORTE DE CIERRE</h3>
                <div style="font-size: 0.9rem; margin-top: 4px; text-align: left;">
                    <p style="margin: 2px 0;"><strong>FECHA:</strong> ${data.fecha}</p>
                    <p style="margin: 2px 0;"><strong>HORA:</strong> ${new Date().toLocaleTimeString()}</p>
                    <p style="margin: 2px 0;"><strong>CAJERO:</strong> ${usuario}</p>
                </div>
            </div>
            <div style="border-bottom: 2px solid black; margin: 5px 0; width: 100%;"></div>
        `;

        // --- 2. RESUMEN (Sin fondos, solo texto negro) ---
        const tbodyResumen = document.getElementById('printTablaResumen');
        tbodyResumen.innerHTML = '';
        data.resumen.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 4px 0; font-size: 11px;">${item.concepto} <br><small>(${item.cantidad} ops)</small></td>
                <td style="text-align:right; font-size: 12px; font-weight: bold;">${formato.format(item.total_valor)}</td>
            `;
            tbodyResumen.appendChild(tr);
        });

        // --- 3. DETALLE (Fuente compacta y nítida) ---
        const tbodyDetalle = document.getElementById('printTablaDetalle');
        tbodyDetalle.innerHTML = '';
        
        // Cabecera limpia
        const thead = document.querySelector('.ticket-table-detail thead tr');
        if(thead) {
            thead.innerHTML = `
                <th style="text-align:left; width:15%; font-size:10px;">HORA</th>
                <th style="text-align:left; width:55%; font-size:10px;">DESCRIPCIÓN</th>
                <th style="text-align:right; width:30%; font-size:10px;">VALOR</th>
            `;
        }

        const grupos = {};
        data.detalle.forEach(mov => {
            if (!grupos[mov.tipo]) grupos[mov.tipo] = [];
            grupos[mov.tipo].push(mov);
        });

        for (const [tipo, movimientos] of Object.entries(grupos)) {
            // Título de Grupo: SIN FONDO GRIS, solo negrita y bordes
            const trHeader = document.createElement('tr');
            trHeader.innerHTML = `
                <td colspan="3" style="font-weight:900; font-size:11px; padding: 8px 0 2px 0; border-bottom: 1px solid black; text-transform:uppercase;">
                    >> ${tipo}
                </td>
            `;
            tbodyDetalle.appendChild(trHeader);

            movimientos.forEach(mov => {
                const tr = document.createElement('tr');
                // Quitamos la columna "Tipo" para dar más espacio a la descripción
                tr.innerHTML = `
                    <td style="vertical-align:top; font-size:10px; padding-top:2px;">${mov.hora}</td>
                    <td style="vertical-align:top; font-size:10px; padding-top:2px; padding-right:5px; line-height:1.1;">
                        ${mov.descripcion}
                    </td>
                    <td style="text-align:right; vertical-align:top; font-size:10px; padding-top:2px; font-weight:bold;">${formato.format(mov.monto)}</td>
                `;
                tbodyDetalle.appendChild(tr);
            });
        }

        // Total Final
        const saldoSistema = document.getElementById('resSistema').textContent;
        document.getElementById('printTotalFinal').textContent = saldoSistema;
        document.getElementById('printTotalFinal').style.fontWeight = "900"; // Extra negrita
        document.getElementById('printTotalFinal').style.fontSize = "1.2rem";

        // Imprimir y luego remover los estilos para no afectar la web normal
        window.print();
        setTimeout(() => { document.body.removeChild(divEstilos); }, 1000);

    } catch (error) {
        console.error("Error al imprimir:", error);
        alert("Hubo un error generando el reporte");
    }
}
// --- FUNCIONES PARA EL MODAL DE NUEVO TURNO ---

function prepararNuevoTurno() {
    // En lugar de window.confirm, mostramos nuestro modal bonito
    const modal = document.getElementById('modalNuevoTurno');
    modal.style.display = 'flex'; // 'flex' activa el centrado del CSS
}

function cerrarModal() {
    document.getElementById('modalNuevoTurno').style.display = 'none';
}

function confirmarNuevoTurnoAccion() {
    // 1. Ocultamos el modal
    cerrarModal();

    // 2. Ejecutamos la lógica de limpieza (lo que hacías antes)
    document.getElementById('viewResumen').style.display = 'none';
    document.getElementById('viewApertura').style.display = 'block';
    
    // 3. Limpiamos y enfocamos
    const inputBase = document.getElementById('inputBaseInicial');
    inputBase.value = '';
    inputBase.focus();
}

async function resetearBaseDatos() {
    // 1. Primera advertencia
    if (!confirm("⚠️ ¡ADVERTENCIA CRÍTICA! ⚠️\n\n¿Estás seguro de que quieres borrar TODO el historial del sistema?\n\nSe creará una copia de seguridad antes de borrar.")) {
        return;
    }

    // 2. Segunda advertencia (Pedir confirmación escrita)
    const confirmacion = prompt("Para confirmar, escribe exactamente: BORRAR TODO");

    if (confirmacion !== "BORRAR TODO") {
        return alert("Operación cancelada. El código no coincide.");
    }

    // 3. Mostrar estado de carga (esto puede tardar unos segundos por el backup)
    const btn = document.querySelector('button[onclick="resetearBaseDatos()"]');
    const textoOriginal = btn.innerText;
    btn.innerText = "⏳ Creando respaldo y borrando...";
    btn.disabled = true;

    try {
        const res = await fetch('/api/admin/reset-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmacion })
        });

        const data = await res.json();

        if (data.success) {
            alert("✅ " + data.message);
            // Recargar la página para volver al estado de "Apertura"
            window.location.reload();
        } else {
            alert("❌ Error: " + data.message);
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    } finally {
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
}

const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault(); // Evita que la página recargue o salte
            
            if(confirm("¿Seguro que deseas cerrar sesión?")) {
                // 1. Borramos las credenciales guardadas
                localStorage.removeItem('usuario_nombre');
                localStorage.removeItem('usuario_rol');
                
                // 2. Redirigimos al login
                window.location.href = 'login.html';
            }
        });
    }