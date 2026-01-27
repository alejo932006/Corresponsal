/* public_financiero/js/usuarios.js */

document.addEventListener('DOMContentLoaded', () => {
    // Validar sesión (opcional, si quieres proteger esta ventana)
    // const userStr = sessionStorage.getItem('fin_user');
    // if (!userStr) { window.location.href = 'login2.html'; return; }

    cargarUsuarios();

    // 1. Guardar Clave Administrativa
    document.getElementById('formClaveAdmin').addEventListener('submit', async (e) => {
        e.preventDefault();
        const clave = document.getElementById('nuevaClaveAdmin').value;
        if(!confirm('¿Seguro que deseas cambiar la Clave Administrativa del sistema?')) return;

        try {
            const res = await fetch('/api/financiero/config/clave-admin', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ nueva_clave: clave })
            });
            const data = await res.json();
            if(data.success) {
                alert('¡Clave Administrativa actualizada correctamente!');
                document.getElementById('nuevaClaveAdmin').value = '';
            } else {
                alert('Error: ' + data.message);
            }
        } catch(e) { console.error(e); alert('Error de conexión'); }
    });

    // 2. Crear Nuevo Usuario
    document.getElementById('formUsuario').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            nombre: document.getElementById('u_nombre').value,
            usuario: document.getElementById('u_usuario').value,
            password: document.getElementById('u_pass').value
        };

        try {
            const res = await fetch('/api/financiero/usuarios', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            const d = await res.json();
            if(d.success) {
                alert('Usuario creado correctamente');
                cerrarModal();
                cargarUsuarios();
            } else {
                alert('Error: ' + d.message);
            }
        } catch(e) { console.error(e); alert('Error de conexión'); }
    });
});

// --- FUNCIONES ---

async function cargarUsuarios() {
    const div = document.getElementById('listaUsuarios');
    div.innerHTML = '<p>Cargando usuarios...</p>';
    
    try {
        const res = await fetch('/api/financiero/usuarios');
        const data = await res.json();
        div.innerHTML = '';

        if(data.datos.length === 0) {
            div.innerHTML = '<p>No hay usuarios registrados.</p>';
            return;
        }

        data.datos.forEach(u => {
            const card = document.createElement('div');
            card.className = 'user-card';
            card.innerHTML = `
                <div class="user-info">
                    <h3>${u.nombre_completo}</h3>
                    <p><i class="fa-solid fa-user"></i> ${u.usuario}</p>
                </div>
                <div style="display:flex; gap:5px;">
                    <button onclick="resetPass(${u.id}, '${u.usuario}')" class="btn-sync" title="Cambiar Contraseña" 
                            style="background:#ff9800; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;">
                        <i class="fa-solid fa-key"></i>
                    </button>
                    <button onclick="eliminarUsuario(${u.id})" class="btn-delete" title="Eliminar Usuario" 
                            style="background:#d32f2f; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            div.appendChild(card);
        });
    } catch(e) { console.error(e); div.innerHTML = '<p>Error cargando lista.</p>'; }
}

function abrirModalUsuario() {
    document.getElementById('formUsuario').reset();
    document.getElementById('modalUsuario').style.display = 'flex';
}

function cerrarModal() {
    document.getElementById('modalUsuario').style.display = 'none';
}

async function eliminarUsuario(id) {
    if(!confirm('¡CUIDADO! ¿Estás seguro de eliminar este usuario? No podrá volver a ingresar.')) return;
    try {
        await fetch(`/api/financiero/usuarios/${id}`, { method: 'DELETE' });
        cargarUsuarios();
    } catch(e) { alert('Error eliminando'); }
}

async function resetPass(id, nombreUsuario) {
    const newPass = prompt(`Ingresa la NUEVA contraseña para el usuario "${nombreUsuario}":`);
    if(!newPass) return; // Si cancela o deja vacío

    try {
        const res = await fetch(`/api/financiero/usuarios/${id}/clave`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ password: newPass })
        });
        const d = await res.json();
        if(d.success) alert('Contraseña actualizada correctamente.');
        else alert('Error al actualizar.');
    } catch(e) { alert('Error de conexión'); }
}