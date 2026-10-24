const express = require("express");
const router = express.Router();
const requireLogin = require("../middlewares/requireLogin");
const { pool } = require("../config");

async function fetchUser(userId, includePassword = false) {
  const columns = includePassword
    ? "id AS _id, fullName, userName, email, password, Photo"
    : "id AS _id, fullName, userName, email, Photo";
  const [rows] = await pool.execute(
    `SELECT ${columns} FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  const user = rows[0];
  const [followers] = await pool.execute(
    "SELECT followerId FROM follows WHERE followingId = ?",
    [userId]
  );
  const [following] = await pool.execute(
    "SELECT followingId FROM follows WHERE followerId = ?",
    [userId]
  );
  user.followers = followers.map((row) => row.followerId);
  user.following = following.map((row) => row.followingId);
  return user;
}

router.get("/user/:id", async (req, resp) => {
  try {
    const user = await fetchUser(req.params.id);
    if (!user) return resp.status(404).json({ error: "User not Found" });

    const [postRows] = await pool.execute(
      "SELECT id FROM posts WHERE postedBy = ? ORDER BY createdAt DESC",
      [req.params.id]
    );
    const post = [];
    for (const row of postRows) {
      const [details] = await pool.execute(
        `SELECT p.id AS _id, p.body, p.photo, p.createdAt, p.updatedAt,
                u.id AS authorId
         FROM posts p JOIN users u ON u.id = p.postedBy WHERE p.id = ?`,
        [row.id]
      );
      if (details.length) {
        const p = details[0];
        const [likes] = await pool.execute(
          "SELECT userId FROM post_likes WHERE postId = ?", [row.id]
        );
        const [comments] = await pool.execute(
          `SELECT c.id AS _id, c.comment, u.id AS commenterId, u.fullName AS commenterName
           FROM comments c JOIN users u ON u.id = c.userId
           WHERE c.postId = ? ORDER BY c.createdAt`, [row.id]
        );
        post.push({
          _id: p._id,
          body: p.body,
          photo: p.photo,
          postedBy: { _id: p.authorId },
          likes: likes.map((x) => x.userId),
          comments: comments.map((x) => ({
            _id: x._id, comment: x.comment,
            postedBy: { _id: x.commenterId, fullName: x.commenterName }
          })),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        });
      }
    }
    resp.status(200).json({ user, post });
  } catch (err) {
    console.error("Get user profile error:", err);
    resp.status(500).json({ error: "Unable to fetch user profile" });
  }
});

router.put("/follow", requireLogin, async (req, resp) => {
  const connection = await pool.getConnection();
  try {
    const followId = Number(req.body.followId);
    const currentId = Number(req.user._id);
    if (!followId || followId === currentId) {
      return resp.status(422).json({ error: "Invalid user to follow" });
    }
    await connection.beginTransaction();
    const [target] = await connection.execute(
      "SELECT id FROM users WHERE id = ? LIMIT 1", [followId]
    );
    if (!target.length) {
      await connection.rollback();
      return resp.status(404).json({ error: "User not found" });
    }
    await connection.execute(
      "INSERT IGNORE INTO follows (followerId, followingId) VALUES (?, ?)",
      [currentId, followId]
    );
    await connection.commit();
    resp.json(await fetchUser(currentId));
  } catch (err) {
    await connection.rollback();
    console.error("Follow error:", err);
    resp.status(500).json({ error: "Unable to follow user" });
  } finally {
    connection.release();
  }
});

router.put("/unfollow", requireLogin, async (req, resp) => {
  try {
    const followId = Number(req.body.followId);
    await pool.execute(
      "DELETE FROM follows WHERE followerId = ? AND followingId = ?",
      [req.user._id, followId]
    );
    resp.json(await fetchUser(req.user._id));
  } catch (err) {
    console.error("Unfollow error:", err);
    resp.status(500).json({ error: "Unable to unfollow user" });
  }
});

router.put("/uploadProfilePic", requireLogin, async (req, resp) => {
  try {
    const { pic } = req.body || {};
    if (!pic) return resp.status(422).json({ error: "pic is required" });
    await pool.execute("UPDATE users SET Photo = ? WHERE id = ?", [pic, req.user._id]);
    resp.json(await fetchUser(req.user._id));
  } catch (err) {
    console.error("Profile photo update error:", err);
    resp.status(500).json({ error: "Unable to update profile photo" });
  }
});

module.exports = router;
