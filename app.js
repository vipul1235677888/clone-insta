const express = require("express");
const app = express();
const PORT = Number(process.env.PORT || process.env.port || 5000);
const cors = require("cors");
const path = require("path");
const { pool } = require("./config");

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use(require("./routes/auth"));
app.use(require("./routes/createPost"));
app.use(require("./routes/user"));

app.use(express.static(path.join(__dirname, "./frontend/build")));
app.get("*", (req, resp) => {
  resp.sendFile(path.join(__dirname, "./frontend/build/index.html"), (err) => {
    if (err) resp.status(500).send(err.message);
  });
});

async function start() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log("Successfully connected to MySQL");
    app.listen(PORT, () => console.log("server is running on " + PORT));
  } catch (err) {
    console.error("MySQL connection failed:", err.message);
    process.exit(1);
  }
}

start();
