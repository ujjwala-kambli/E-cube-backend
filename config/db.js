
const mysql = require("mysql2/promise");

const sslConfig = (process.env.DB_SSL === "true" || (process.env.DB_HOST && !["127.0.0.1", "localhost"].includes(process.env.DB_HOST)))
    ? { minVersion: "TLSv1.2", rejectUnauthorized: true }
    : undefined;

const db = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "DevFlow@123",
    database: process.env.DB_NAME || "ecube_pcb",
    port: Number(process.env.DB_PORT || 3306),
    ssl: sslConfig,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function testDatabase() {
    try {
        const connection = await db.getConnection();

        console.log("MySQL Connected Successfully");

        connection.release();
    } catch (error) {
        console.error(
            "MySQL connection failed:",
            error.message
        );
    }
}

testDatabase();

module.exports = db;