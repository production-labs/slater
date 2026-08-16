const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Save a receipt
router.post('/:projectKey/:index', async (req, res) => {
  const { projectKey, index } = req.params;
  const { image_data } = req.body;
  try {
	const result = await pool.query(
	  `INSERT INTO receipts (project_key, expense_index, image_data, owner_id)
	   VALUES ($1, $2, $3, $4)
	   ON CONFLICT (project_key, expense_index) DO UPDATE
	   SET image_data = $3, created_at = NOW()
	   WHERE receipts.owner_id = $4
	   RETURNING id`,
	  [projectKey, parseInt(index), image_data, req.session.userId]
	);
	res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to save receipt' });
  }
});

// Get all receipts for a project
router.get('/:projectKey', async (req, res) => {
  try {
	const result = await pool.query(
	  'SELECT expense_index, image_data FROM receipts WHERE project_key = $1 AND owner_id = $2 ORDER BY expense_index',
	  [req.params.projectKey, req.session.userId]
	);
	res.json(result.rows);
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to load receipts' });
  }
});

// Delete all receipts for a project
router.delete('/:projectKey', async (req, res) => {
  try {
	await pool.query(
	  'DELETE FROM receipts WHERE project_key = $1 AND owner_id = $2',
	  [req.params.projectKey, req.session.userId]
	);
	res.json({ success: true });
  } catch (err) {
	console.error(err);
	res.status(500).json({ error: 'Failed to delete receipts' });
  }
});

module.exports = router;
