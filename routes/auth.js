const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool, JWT_secret } = require("../config");

router.post("/signup", async (req, resp) => {
  try {
    const { fullName, userName, email, password } = req.body || {};
    if (!fullName || !userName || !email || !password) {
      return resp.status(422).json({ error: "Please add all the fields" });
    }

    const [existing] = await pool.execute(
      "SELECT id FROM users WHERE userName = ? OR email = ? LIMIT 1",
      [userName, email]
    );
    if (existing.length) {
      return resp.status(422).json({
        error: "User already exist of that email or Username",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await pool.execute(
      "INSERT INTO users (fullName, userName, email, password) VALUES (?, ?, ?, ?)",
      [fullName, userName, email, hashedPassword]
    );
    return resp.json({ message: "Registered successfully" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return resp.status(422).json({
        error: "User already exist of that email or Username",
      });
    }
    console.error("Signup error:", err);
    return resp.status(500).json({ error: "Unable to register user" });
  }
});

router.post("/signin", async (req, resp) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return resp.status(422).json({ error: "Please add email and password" });
    }

    const [rows] = await pool.execute(
      "SELECT id, fullName, email, userName, password FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    const savedUser = rows[0];
    if (!savedUser) {
      return resp.status(422).json({ error: "Invalid Email" });
    }

    const match = await bcrypt.compare(password, savedUser.password);
    if (!match) {
      return resp.status(422).json({ error: "Wrong Password" });
    }

    const token = jwt.sign({ _id: savedUser.id }, JWT_secret);
    return resp.json({
      token,
      user: {
        _id: savedUser.id,
        fullName: savedUser.fullName,
        email: savedUser.email,
        userName: savedUser.userName,
      },
    });
  } catch (err) {
    console.error("Signin error:", err);
    return resp.status(500).json({ error: "Unable to sign in" });
  }
});

module.exports = router;
