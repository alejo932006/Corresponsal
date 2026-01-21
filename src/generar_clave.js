const bcrypt = require('bcrypt');

const passwordPlana = '12345';

bcrypt.hash(passwordPlana, 10, (err, hash) => {
    if (err) console.error(err);
    console.log('--- COPIA ESTE CÓDIGO DE ABAJO ---');
    console.log(hash);
    console.log('----------------------------------');
});