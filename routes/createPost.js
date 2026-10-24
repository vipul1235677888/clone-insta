const express = require("express");
const router = express.Router();
const requireLogin = require("../middlewares/requireLogin");
const { pool } = require("../config");

async function fetchPost(postId) {
  const [postRows] = await pool.execute(
    `SELECT p.id AS _id, p.body, p.photo, p.postedBy AS postedById,
            p.createdAt, p.updatedAt,
            u.id AS authorId, u.fullName AS authorFullName, u.Photo AS authorPhoto
     FROM posts p JOIN users u ON u.id = p.postedBy
     WHERE p.id = ?`,
    [postId]
  );
  if (!postRows.length) return null;

  const row = postRows[0];
  const [likeRows] = await pool.execute(
    "SELECT userId FROM post_likes WHERE postId = ? ORDER BY createdAt",
    [postId]
  );
  const [commentRows] = await pool.execute(
    `SELECT c.id AS _id, c.comment, c.createdAt, u.id AS commenterId,
            u.fullName AS commenterFullName
     FROM comments c JOIN users u ON u.id = c.userId
     WHERE c.postId = ? ORDER BY c.createdAt`,
    [postId]
  );

  return {
    _id: row._id,
    body: row.body,
    photo: row.photo,
    postedBy: {
      _id: row.authorId,
      fullName: row.authorFullName,
      Photo: row.authorPhoto,
    },
    likes: likeRows.map((like) => like.userId),
    comments: commentRows.map((comment) => ({
      _id: comment._id,
      comment: comment.comment,
      postedBy: {
        _id: comment.commenterId,
        fullName: comment.commenterFullName,
      },
      createdAt: comment.createdAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function fetchPostsWhere(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  const posts = [];
  for (const row of rows) {
    const post = await fetchPost(row.id);
    if (post) posts.push(post);
  }
  return posts;
}

router.get("/allposts", requireLogin, async (req, resp) => {
  try {
    const posts = await fetchPostsWhere(
      "SELECT id FROM posts ORDER BY createdAt DESC"
    );
    resp.json(posts);
  } catch (err) {
    console.error("Fetch all posts error:", err);
    resp.status(500).json({ error: "Unable to fetch posts" });
  }
});

router.post("/createPost", requireLogin, async (req, resp) => {
  try {
    const { body, pic } = req.body || {};
    if (!body || !pic) {
      return resp.status(422).json({ error: "Please add all the fields" });
    }
    const [result] = await pool.execute(
      "INSERT INTO posts (body, photo, postedBy) VALUES (?, ?, ?)",
      [body, pic, req.user._id]
    );
    const post = await fetchPost(result.insertId);
    resp.json({ post });
  } catch (err) {
    console.error("Create post error:", err);
    resp.status(500).json({ error: "Unable to create post" });
  }
});

router.get("/myposts", requireLogin, async (req, resp) => {
  try {
    const posts = await fetchPostsWhere(
      "SELECT id FROM posts WHERE postedBy = ? ORDER BY createdAt DESC",
      [req.user._id]
    );
    resp.json(posts);
  } catch (err) {
    console.error("Fetch my posts error:", err);
    resp.status(500).json({ error: "Unable to fetch your posts" });
  }
});

router.put("/like", requireLogin, async (req, resp) => {
  try {
    const { postId } = req.body || {};
    if (!postId) return resp.status(422).json({ error: "postId is required" });
    await pool.execute(
      "INSERT IGNORE INTO post_likes (userId, postId) VALUES (?, ?)",
      [req.user._id, postId]
    );
    const post = await fetchPost(postId);
    if (!post) return resp.status(404).json({ error: "Post not found" });
    resp.json(post);
  } catch (err) {
    console.error("Like error:", err);
    resp.status(500).json({ error: "Unable to like post" });
  }
});

router.put("/unlike", requireLogin, async (req, resp) => {
  try {
    const { postId } = req.body || {};
    if (!postId) return resp.status(422).json({ error: "postId is required" });
    await pool.execute(
      "DELETE FROM post_likes WHERE userId = ? AND postId = ?",
      [req.user._id, postId]
    );
    const post = await fetchPost(postId);
    if (!post) return resp.status(404).json({ error: "Post not found" });
    resp.json(post);
  } catch (err) {
    console.error("Unlike error:", err);
    resp.status(500).json({ error: "Unable to unlike post" });
  }
});

router.put("/comment", requireLogin, async (req, resp) => {
  try {
    const { postId, text } = req.body || {};
    if (!postId || !text) {
      return resp.status(422).json({ error: "postId and text are required" });
    }
    await pool.execute(
      "INSERT INTO comments (postId, userId, comment) VALUES (?, ?, ?)",
      [postId, req.user._id, text]
    );
    const post = await fetchPost(postId);
    if (!post) return resp.status(404).json({ error: "Post not found" });
    resp.json(post);
  } catch (err) {
    console.error("Comment error:", err);
    resp.status(500).json({ error: "Unable to add comment" });
  }
});

router.delete("/deletePost/:postId", requireLogin, async (req, resp) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, postedBy FROM posts WHERE id = ? LIMIT 1",
      [req.params.postId]
    );
    if (!rows.length) return resp.status(404).json({ error: "Post not found" });
    if (String(rows[0].postedBy) !== String(req.user._id)) {
      return resp.status(403).json({ error: "You can only delete your own post" });
    }
    await pool.execute("DELETE FROM posts WHERE id = ?", [req.params.postId]);
    resp.json({ message: "Successfully deleted" });
  } catch (err) {
    console.error("Delete post error:", err);
    resp.status(500).json({ error: "Unable to delete post" });
  }
});

router.get("/myfollowingpost", requireLogin, async (req, resp) => {
  try {
    const posts = await fetchPostsWhere(
      `SELECT p.id FROM posts p
       JOIN follows f ON f.followingId = p.postedBy
       WHERE f.followerId = ? ORDER BY p.createdAt DESC`,
      [req.user._id]
    );
    resp.json(posts);
  } catch (err) {
    console.error("Following posts error:", err);
    resp.status(500).json({ error: "Unable to fetch following posts" });
  }
});

module.exports = router;
