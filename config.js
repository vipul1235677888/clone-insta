const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "clone_insta_app",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "clone_insta",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
});

module.exports = {
  pool,
  // Keep the existing value temporarily so already-issued JWTs remain verifiable.
  // Move this secret to an environment variable and rotate it after migration.
  JWT_secret: process.env.JWT_SECRET || "qiwansfbiewugfbdk",
};
