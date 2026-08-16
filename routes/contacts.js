const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT contacts FROM users WHERE id = $1', [req.session.userId]);
    res.json(result.rows[0]?.contacts || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load contacts' });
  }
});

router.put('/', async (req, res) => {
  try {
    await pool.query('UPDATE users SET contacts = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(req.body), req.session.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save contacts' });
  }
});

module.exports = router;
