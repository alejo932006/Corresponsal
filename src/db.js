const { Pool } = require('pg');

// Configura aquí tus datos reales de PostgreSQL
const pool = new Pool({
    user: 'postgres',       // Tu usuario de Postgres
    host: 'localhost',      // O la IP de tu servidor
    database: 'Corresponsal', // El nombre de tu base de datos
    password: '0534', // Tu contraseña de Postgres
    port: 5432,
});

module.exports = pool;