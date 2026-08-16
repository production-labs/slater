const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Get all projects (just keys and labels for the dropdown)
router.get('/', async (req, res) => {
  try {
	const result = await pool.query(
	  'SELECT key, label, updated_at FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC',
	  [req.session.userId]
	);
	res.json(result.rows);
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to load projects' });
  }
});

// Get a single project
router.get('/:key', async (req, res) => {
  try {
	const result = await pool.query(
	  'SELECT * FROM projects WHERE key = $1 AND owner_id = $2',
	  [req.params.key, req.session.userId]
	);
	if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
	res.json(result.rows[0]);
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to load project' });
  }
});

// Save a project (create or update)
router.post('/:key', async (req, res) => {
  const { key } = req.params;
  const { label, data } = req.body;
  try {
	const result = await pool.query(
	  `INSERT INTO projects (key, label, data, owner_id, updated_at)
	   VALUES ($1, $2, $3, $4, NOW())
	   ON CONFLICT (key) DO UPDATE
	   SET label = $2, data = $3, updated_at = NOW()
	   WHERE projects.owner_id = $4
	   RETURNING *`,
	  [key, label, data, req.session.userId]
	);
	res.json(result.rows[0]);
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to save project' });
  }
});

// Delete a project
router.delete('/:key', async (req, res) => {
  try {
	await pool.query(
	  'DELETE FROM projects WHERE key = $1 AND owner_id = $2',
	  [req.params.key, req.session.userId]
	);
	res.json({ success: true });
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to delete project' });
  }
});

module.exports = router;
