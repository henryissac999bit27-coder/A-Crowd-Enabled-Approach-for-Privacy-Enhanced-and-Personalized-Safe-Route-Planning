const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'henry@258',
    database: 'safe_route',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = db;