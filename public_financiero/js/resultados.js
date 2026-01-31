/* public_financiero/js/resultados.js */

let datosSistema = {
    caja: 0,
    corresponsal: 0,
    terceros_cobrar: 0,
    terceros_pagar: 0,
    bancos: 0
};

document.addEventListener('DOMContentLoaded', () => {
    const userStr = sessionStorage.getItem('fin_user');
    if (!userStr) { window.location.href = 'login2.html'; return; }
    const user = JSON.parse(userStr);
    document.getElementById('userDisplay').textContent = user.nombre;

    cargarMetricas();
    cargarHistorial();
});

async function cargarMetricas() {
    try {
        const res = await fetch('/api/financiero/resultados/metricas-actuales');
        const data = await res.json();
        if(data.success) {
            datosSistema = {
                caja: data.caja_diario,
                corresponsal: data.corresponsal, 
                terceros_cobrar: data.terceros_cobrar,
                terceros_pagar: data.terceros_pagar, // ESTO ES CUSTODIA (Valor exacto de la otra pestaña)
                bancos: data.total_bancos
            };
            
            // 1. CAJA
            document.getElementById('sys_caja').value = fmt(datosSistema.caja);
            
            // 2. PAGAR (SOLO CUSTODIA, SIN BANCOS, SIN NADA RARO)
            document.getElementById('sys_pagar').value = fmt(datosSistema.terceros_pagar);
            
            // 3. COBRAR
            document.getElementById('sys_cobrar').value = fmt(datosSistema.terceros_cobrar);
            
            document.getElementById('fis_bancos').placeholder = datosSistema.bancos;

            calcular();
        }
    } catch(e) { console.error(e); }
}

function calcular() {
    // 1. Obtener Bases (Manual)
    const bases = parseFloat(document.getElementById('manual_base').value) || 0;
    
    // 2. TU FÓRMULA EXACTA:
    // (Saldo Caja Diario + Saldo Cuentas por Pagar) - (Saldo Cuentas por Cobrar + Bases Caja)
    
    const bloqueSuma = datosSistema.caja + datosSistema.terceros_pagar;
    const bloqueResta = datosSistema.terceros_cobrar + bases;
    
    const totalSistema = bloqueSuma - bloqueResta;
    
    document.getElementById('sys_total').textContent = fmt(totalSistema);

    // 3. Calcular Total Físico (Lo que cuentas en billetes)
    const v = (id) => parseFloat(document.getElementById(id).value) || 0;
    const totalFisico = v('fis_efectivo') + v('fis_monedas') + v('fis_bancos') + v('fis_qr') + v('fis_datafono');
    
    document.getElementById('fis_total').textContent = fmt(totalFisico);

    // 4. Diferencia
    const diferencia = totalFisico - totalSistema;
    
    const diffEl = document.getElementById('diff_value');
    const circle = document.getElementById('diff_circle');
    const icon = document.getElementById('diff_icon');
    const text = document.getElementById('diff_text');

    diffEl.textContent = fmt(diferencia);

    if (Math.abs(diferencia) < 100) { 
        circle.className = 'diff-circle bien';
        icon.className = 'fa-solid fa-check';
        text.textContent = 'Cuadrado';
        diffEl.style.color = '#2e7d32';
    } else if (diferencia > 0) {
        circle.className = 'diff-circle bien';
        icon.className = 'fa-solid fa-plus';
        text.textContent = 'Sobrante';
        diffEl.style.color = '#1565c0';
    } else {
        circle.className = 'diff-circle mal';
        icon.className = 'fa-solid fa-exclamation';
        text.textContent = 'Faltante';
        diffEl.style.color = '#c62828';
    }
}

async function guardarCierre() {
    if(!confirm('¿Estás seguro de guardar este cierre?')) return;

    const v = (id) => parseFloat(document.getElementById(id).value) || 0;
    const sysTotal = parseFloat(document.getElementById('sys_total').textContent.replace(/[$.]/g,'')) || 0;
    const fisTotal = parseFloat(document.getElementById('fis_total').textContent.replace(/[$.]/g,'')) || 0;
    const diff = fisTotal - sysTotal;

    const data = {
        fecha: new Date().toISOString().split('T')[0],
        hora: new Date().toTimeString().substring(0,5),
        usuario_id: JSON.parse(sessionStorage.getItem('fin_user')).id,
        
        saldo_caja_diario: datosSistema.caja,
        saldo_cuentas_por_pagar: datosSistema.terceros_pagar, // Guardamos Custodia
        saldo_cuentas_por_cobrar: datosSistema.terceros_cobrar,
        bases_caja: v('manual_base'),
        
        resultado_sistema: sysTotal,
        total_fisico: fisTotal,
        diferencia: diff,
        
        detalles_fisicos: {
            efectivo: v('fis_efectivo'), monedas: v('fis_monedas'), 
            bancos: v('fis_bancos'), qr: v('fis_qr'), datafono: v('fis_datafono') 
        },
        observaciones: document.getElementById('observaciones').value
    };

    try {
        const res = await fetch('/api/financiero/resultados', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        if(res.ok) { alert('Cierre guardado con éxito'); location.reload(); } 
        else { alert('Error al guardar'); }
    } catch(e) { console.error(e); }
}

async function cargarHistorial() {
    const res = await fetch('/api/financiero/resultados');
    const data = await res.json();
    const tbody = document.getElementById('tablaHistorial');
    tbody.innerHTML = '';

    data.datos.forEach(r => {
        const diff = parseFloat(r.diferencia);
        let tagClass = Math.abs(diff) < 100 ? 'tag-ok' : 'tag-error';
        let tagText = Math.abs(diff) < 100 ? 'CUADRADO' : (diff > 0 ? 'SOBRANTE' : 'FALTANTE');

        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.fecha.split('T')[0]}</td><td>${r.hora}</td><td>${fmt(r.bases_caja)}</td><td>${fmt(r.resultado_sistema)}</td><td>${fmt(r.total_fisico)}</td><td style="font-weight:bold; color: ${diff < 0 ? 'red' : 'black'}">${fmt(diff)}</td><td><span class="result-tag ${tagClass}">${tagText}</span></td>`;
        tbody.appendChild(tr);
    });
}

function fmt(v) { return parseFloat(v).toLocaleString('es-CO', { style: 'currency', currency: 'COP' }); }
function logout() { sessionStorage.removeItem('fin_user'); window.location.href = 'login2.html'; }