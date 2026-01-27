document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const usuario = document.getElementById('usuario').value;
    const password = document.getElementById('password').value;
    const btn = document.getElementById('btnIngresar');
    const msg = document.getElementById('mensajeError');

    // Estado de carga
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verificando...';
    btn.disabled = true;
    msg.style.display = 'none';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, password })
        });

        const data = await response.json();

        if (data.success) {
            // Guardar sesión (puedes usar localStorage o sessionStorage)
            sessionStorage.setItem('fin_user', JSON.stringify(data.user));
            
            // Efecto visual de éxito
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Correcto';
            btn.style.background = '#4caf50';
            
            setTimeout(() => {
                // Redirigir a la página principal (que crearemos luego)
                window.location.href = 'menu.html';
            }, 800);
        } else {
            throw new Error(data.message);
        }

    } catch (error) {
        btn.innerHTML = 'INGRESAR <i class="fa-solid fa-arrow-right"></i>';
        btn.style.background = '#1e3c72';
        btn.disabled = false;
        
        msg.textContent = error.message || 'Error de conexión';
        msg.style.display = 'block';
    }
});