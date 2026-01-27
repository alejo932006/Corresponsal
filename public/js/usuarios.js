/* public/js/usuarios.js */

document.addEventListener('DOMContentLoaded', () => {
    cargarUsuarios();

    // Evento Crear Usuario
    document.getElementById('formCrear').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Obtenemos los valores
        const nombreCompleto = document.getElementById('nombre').value;
        const usuarioLogin = document.getElementById('usuario').value;
        const password = document.getElementById('password').value;
        const rol = document.getElementById('rol').value;

        // PREPARAR DATOS:
        // Tu base de datos actual usa el campo 'nombre' para el login.
        // Por eso, enviaremos el 'usuarioLogin' en el campo 'nombre' para que funcione el ingreso.
        const data = {
            nombre: usuarioLogin, // Usamos el login como nombre para la DB
            password: password,
            rol: rol
        };

        try {
            // CORRECCIÓN: La ruta correcta en app.js es '/api/usuarios' (POST)
            const res = await fetch('/api/usuarios', { 
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            
            const result = await res.json();
            
            if(result.success) {
                alert('Usuario creado con éxito');
                cerrarModal();
                cargarUsuarios();
            } else {
                alert('Error: ' + (result.message || 'No se pudo crear'));
            }
        } catch(err) { 
            console.error(err); 
            alert('Error de conexión con el servidor'); 
        }
    });
});

async function cargarUsuarios() {
    const grid = document.getElementById('gridUsuarios');
    // Spinner de carga más bonito
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p>Cargando equipo...</p></div>';

    try {
        const res = await fetch('/api/usuarios');
        const data = await res.json(); 

        const listaUsuarios = data.usuarios || data; 

        if (!Array.isArray(listaUsuarios)) {
            grid.innerHTML = '<p style="color:red; text-align:center;">Error de datos.</p>';
            return;
        }

        grid.innerHTML = '';

        if(listaUsuarios.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; background:white; border-radius:20px;"><h3>No hay usuarios</h3><p style="color:#777">Empieza creando uno nuevo con el botón superior.</p></div>';
            return;
        }

        listaUsuarios.forEach(u => {
            // Determinar estilo del rol
            const rolClass = u.rol === 'admin' ? 'role-admin' : 'role-user';
            const rolTexto = u.rol === 'admin' ? 'ADMINISTRADOR' : 'CAJERO';

            const card = document.createElement('div');
            card.className = 'user-card';
            
            // HTML DE LA TARJETA PRO
            card.innerHTML = `
                <div class="card-bg-decoration"></div>
                
                <div class="card-content">
                    <div class="avatar-container">
                        <span style="font-weight:600;">${u.nombre.charAt(0).toUpperCase()}</span>
                    </div>
                    
                    <h3 class="user-name">${u.nombre}</h3>
                    <p class="user-handle"><i class="fa-solid fa-at"></i> ${u.nombre}</p> <span class="role-badge ${rolClass}">${rolTexto}</span>

                    <div class="card-actions">
                        <button class="action-btn btn-key" onclick="cambiarClave(${u.id}, '${u.nombre}')" title="Cambiar Contraseña">
                            <i class="fa-solid fa-key"></i>
                        </button>
                        <button class="action-btn btn-del" onclick="eliminarUsuario(${u.id})" title="Eliminar Usuario">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch(err) { 
        console.error(err); 
        grid.innerHTML = '<p style="text-align:center; color:#ef5350;">Error de conexión.</p>'; 
    }
}

// --- FUNCIONES DE ACCIÓN ---

async function eliminarUsuario(id) {
    if(!confirm('¿Estás seguro de ELIMINAR este usuario? Esta acción es irreversible.')) return;

    try {
        const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
        const data = await res.json();
        
        if(data.success) {
            alert('Usuario eliminado.');
            cargarUsuarios();
        } else {
            alert('Error al eliminar: ' + (data.message || 'Desconocido'));
        }
    } catch(e) { console.error(e); alert('Error de conexión'); }
}

async function cambiarClave(id, nombreUser) {
    const newPass = prompt(`Ingresa la NUEVA contraseña para ${nombreUser}:`);
    if(!newPass) return;

    try {
        const res = await fetch(`/api/usuarios/${id}/clave`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ password: newPass })
        });
        const data = await res.json();

        if(data.success) alert('Contraseña actualizada correctamente.');
        else alert('Error al actualizar.');
    } catch(e) { console.error(e); alert('Error de conexión'); }
}

// --- MODAL ---
function abrirModal() {
    const form = document.getElementById('formCrear');
    if(form) form.reset();
    document.getElementById('modalUsuario').style.display = 'flex';
}

function cerrarModal() {
    document.getElementById('modalUsuario').style.display = 'none';
}