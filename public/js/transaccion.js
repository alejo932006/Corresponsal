let baseActual = 0;

document.addEventListener('DOMContentLoaded', () => {
    const usuario = localStorage.getItem('usuario_nombre') || 'Usuario';
    document.getElementById('nombreUsuario').textContent = usuario;

    cargarOpciones();        // Para llenar los selectores (Bancos)
    cargarBaseCaja();        // Para mostrar el dinero en efectivo
    cargarMisMovimientos();  // <--- ¡ESTA ES LA QUE TE FALTA!

    const radiosCategoria = document.querySelectorAll('input[name="categoria"]');
    radiosCategoria.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const categoriaSeleccionada = e.target.value;
            filtrarTipos(categoriaSeleccionada);
        });
    });

    // Manejar el envío del formulario
    document.getElementById('formTransaccion').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Capturar datos
        const tipo_id = document.getElementById('selectTipo').value;
        const banco_id = document.getElementById('selectBanco').value;
        const monto = document.getElementById('inputMonto').value;
        const descripcion = document.getElementById('inputDesc').value;
        const usuario_nombre = localStorage.getItem('usuario_nombre');

        // Validar
        if(!tipo_id || !banco_id || !monto) {
            alert("Por favor completa todos los campos");
            return;
        }

        // Enviar al Backend
        try {
            const response = await fetch('/api/transacciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo_id, banco_id, monto, descripcion, usuario_nombre })
            });

            const data = await response.json();

            if (data.success) {
                document.getElementById('inputMonto').value = '';
                document.getElementById('inputDesc').value = '';
                document.getElementById('inputMonto').focus();

                cargarMisMovimientos();
                cargarBaseCaja();
            } else {
                alert('Error: ' + data.message);
            }

            if (data.message.includes('CAJA CERRADA')) {
                window.location.href = 'caja.html';
            }

        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        }
    });
    cargarBaseCaja();
});

async function cargarOpciones() {
    try {
        const res = await fetch('/api/config-formulario');
        const data = await res.json();

        if (data.success) {
            // 1. Llenar Bancos (Igual que antes)
            const selectBanco = document.getElementById('selectBanco');
            selectBanco.innerHTML = '<option value="">Seleccione...</option>';
            data.bancos.forEach(banco => {
                const opt = document.createElement('option');
                opt.value = banco.id;
                opt.textContent = banco.nombre;
                selectBanco.appendChild(opt);
            });

            // 2. GUARDAR Tipos en memoria (No los pintamos todavía)
            todosLosTipos = data.tipos; 
        }
    } catch (error) {
        console.error('Error cargando opciones:', error);
    }
}

// NUEVA FUNCIÓN: Filtra el select de tipos según la categoría
function filtrarTipos(categoria) {
    const selectTipo = document.getElementById('selectTipo');
    const divTipo = document.getElementById('groupTipo');

    // Limpiar select
    selectTipo.innerHTML = '<option value="">Seleccione una opción...</option>';

    // Filtrar array en memoria
    const tiposFiltrados = todosLosTipos.filter(t => t.categoria === categoria);

    // Llenar select
    tiposFiltrados.forEach(tipo => {
        const opt = document.createElement('option');
        opt.value = tipo.id;
        opt.textContent = tipo.nombre;
        selectTipo.appendChild(opt);
    });

    // Mostrar el select con animación suave
    divTipo.style.display = 'block';
    setTimeout(() => divTipo.style.opacity = '1', 10);
}

async function cargarMisMovimientos() {
    const usuario = localStorage.getItem('usuario_nombre');
    const container = document.getElementById('listaMovimientos');
    const contadorBadge = document.getElementById('contadorMovimientos');
    const totalTurnoLabel = document.getElementById('totalTurno');
    
    try {
        const res = await fetch(`/api/mis-movimientos?usuario=${usuario}`);
        const data = await res.json();

        if (data.success) {
            container.innerHTML = ''; // Limpiar lista
            
            const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
            let sumaTotal = 0;

            if (data.movimientos.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding: 40px; color: #a0aec0;">
                        <p>📭</p>
                        <p>Sin movimientos hoy</p>
                    </div>`;
                return;
            }

            data.movimientos.forEach(mov => {
                // Sumamos para el total del pie de página
                // (Nota: Aquí sumamos valor absoluto, si quieres restar retiros dependería de la lógica contable,
                // pero usualmente el cajero quiere saber "cuánto volumen moví").
                sumaTotal += parseFloat(mov.monto);

                // Crear el elemento Tarjeta
                const div = document.createElement('div');
                div.className = 'feed-item';
                
                // Determinamos un icono simple según el texto (opcional)
                let icon = '📄';
                if(mov.tipo.includes('Nequi')) icon = '📱';
                if(mov.tipo.includes('Servicio')) icon = '💡';
                if(mov.tipo.includes('Retiro')) icon = '💸';

                div.innerHTML = `
                    <div class="feed-left">
                        <span class="feed-time">${mov.hora}</span>
                        <div class="feed-info">
                            <h4>${icon} ${mov.tipo}</h4>
                            <p>${mov.descripcion}</p>
                        </div>
                    </div>
                    <div class="feed-amount">
                        ${formato.format(mov.monto)}
                    </div>
                `;
                container.appendChild(div);
            });

            // Actualizar contadores
            contadorBadge.textContent = data.movimientos.length;
            totalTurnoLabel.textContent = formato.format(sumaTotal);
        }
    } catch (error) {
        console.error("Error cargando historial:", error);
    }
}

// Función para obtener y mostrar la base con BLOQUEO DE SEGURIDAD
async function cargarBaseCaja() {
    const usuario = localStorage.getItem('usuario_nombre');
    
    try {
        const res = await fetch(`/api/base-caja?usuario=${usuario}`);
        const data = await res.json();

        if (data.success) {
            
            // --- 1. BLOQUE DE SEGURIDAD ---
            // Si la caja NO está abierta (data.cajaAbierta es false), lo sacamos de aquí.
            if (!data.cajaAbierta) {
                alert("⚠️ ATENCIÓN: No has realizado la APERTURA DE CAJA hoy.\n\nEl sistema te redirigirá para que ingreses la base inicial antes de operar.");
                window.location.href = 'caja.html'; // Redirección forzada
                return; // ¡Importante! Detenemos la función aquí.
            }
            // ------------------------------

            // --- 2. MOSTRAR DATOS (Solo si la caja está abierta) ---
            const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
            
            baseActual = data.base; // Guardamos en variable global para cálculos
            
            // Actualizar interfaz visual
            document.getElementById('txtBaseActual').textContent = formato.format(data.base);
            document.getElementById('txtBaseInicial').textContent = `Base Inicial: ${formato.format(data.baseInicial)}`;

            // Asegurar estilo correcto (ya que está abierta)
            document.getElementById('txtBaseActual').style.color = 'white'; 
            
            // Ocultar cualquier botón de abrir caja que haya quedado residual
            const btnContainer = document.getElementById('btnAbrirCajaContainer');
            if (btnContainer) {
                btnContainer.style.display = 'none';
            }
        }
    } catch (error) {
        console.error(error);
    }
}

// Función para abrir caja (Base Inicial)
async function abrirCaja() {
    const montoStr = prompt("Ingrese el monto de la BASE INICIAL en efectivo:");
    if (!montoStr) return;
    
    const monto = parseFloat(montoStr);
    if (isNaN(monto)) return alert("Número inválido");

    const usuario = localStorage.getItem('usuario_nombre');

    await fetch('/api/apertura-caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_nombre: usuario, monto: monto })
    });

    cargarBaseCaja(); // Recargar widget
}

// Función para Ajustar Descuadres (La parte inteligente)
async function ajustarBase() {
    // 1. Preguntar cuánto dinero hay FÍSICAMENTE
    const realStr = prompt(`El sistema dice que debe haber: $${baseActual}\n\n¿Cuánto dinero contaste FÍSICAMENTE en el cajón?`);
    if (!realStr) return;

    const real = parseFloat(realStr);
    if (isNaN(real)) return alert("Número inválido");

    // 2. Calcular la diferencia
    const diferencia = real - baseActual;

    if (diferencia === 0) {
        return alert("¡Excelente! La caja cuadra perfectamente.");
    }

    // 3. Confirmar el ajuste
    const tipoDiferencia = diferencia > 0 ? "SOBRAN" : "FALTAN";
    const confirmar = confirm(`Hay una diferencia: ${tipoDiferencia} $${Math.abs(diferencia)}.\n\n¿Deseas crear un registro de ajuste automático para cuadrar la caja?`);

    if (confirmar) {
        // Buscamos el ID del tipo "Ajuste / Descuadre Caja" (Supongamos que es ID 6 o buscamos dinamicamente)
        // Para simplificar, enviaremos una transacción normal pero con un tipo especial.
        
        // NOTA: Debes averiguar qué ID tiene tu tipo "Ajuste". 
        // Si ejecutaste mi SQL anterior, probablemente sea el último ID.
        // Haremos un truco: Enviar el nombre del tipo y que el backend lo busque, o usar el ID fijo si lo sabes.
        // Asumiremos que buscamos el ID en el backend o lo tienes fijo.
        
        // Vamos a reusar la API de transacciones normal
        // Necesitamos saber el ID del tipo "Ajuste". 
        // TIP: Puedes ver en tu tabla tipos_transaccion cuál ID es. Digamos que es el 6.
        const ID_TIPO_AJUSTE = 10; // <--- CAMBIA ESTO POR EL ID REAL EN TU BASE DE DATOS

        // Si falta plata (diferencia negativa), el monto de la transaccion debe ser negativo para restar de la base
        // Si sobra plata, positivo.
        
        const usuario = localStorage.getItem('usuario_nombre');

        await fetch('/api/transacciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo_id: ID_TIPO_AJUSTE, 
                banco_id: 1, // Bancolombia por defecto o crear un "Banco Interno"
                monto: diferencia, // Puede ser negativo
                descripcion: `Ajuste por descuadre (Sistema: ${baseActual} vs Físico: ${real})`,
                usuario_nombre: usuario
            })
        });

        alert("Ajuste realizado.");
        cargarBaseCaja();
        cargarMisMovimientos(); // También aparece en el historial
    }
}