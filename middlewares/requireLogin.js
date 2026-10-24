const jwt = require("jsonwebtoken");
const { pool, JWT_secret } = require("../config");

module.exports = async (req, resp, next) => {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return resp.status(401).json({ error: "You must have logged in" });
  }

  try {
    const token = authorization.replace(/^Bearer\s+/, "");
    const payload = jwt.verify(token, JWT_secret);
    const [rows] = await pool.execute(
      `SELECT id AS _id, fullName, userName, email, Photo
       FROM users WHERE id = ? LIMIT 1`,
      [payload._id]
    );

    if (!rows.length) {
      return resp.status(401).json({ error: "User not found" });
    }

    const user = rows[0];
    const [following] = await pool.execute(
      "SELECT followingId FROM follows WHERE followerId = ?",
      [user._id]
    );
    user.following = following.map((row) => row.followingId);
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return resp.status(401).json({ error: "You must have logged in" });
    }
    console.error("Authentication error:", err);
    return resp.status(500).json({ error: "Authentication failed" });
  }
};
