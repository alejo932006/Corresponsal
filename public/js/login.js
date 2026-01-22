document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que la página se recargue sola

    const usuario = document.getElementById('usuario').value;
    const password = document.getElementById('password').value;
    const mensajeError = document.getElementById('mensajeError');

    try {
        const respuesta = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, password })
        });

        const data = await respuesta.json();

        if (data.success) {
            localStorage.setItem('usuario_nombre', data.usuario);
            localStorage.setItem('usuario_rol', data.rol); // <--- AGREGAR ESTO
            window.location.href = 'dashboard.html';
        } else {
            // Muestra el mensaje de error
            mensajeError.style.display = 'block';
            mensajeError.textContent = data.message;
        }

    } catch (error) {
        console.error('Error:', error);
        mensajeError.style.display = 'block';
        mensajeError.textContent = 'Error de conexión con el servidor';
    }
});