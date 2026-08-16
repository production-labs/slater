const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const FIELDS = 'id, user_id, name, contact_name, contact_email, contact_phone, address, city, state, zip, invoicing_email, invoicing_text, default_project_type, website, timezone, logo, is_default, created_at, updated_at';

// Get all agencies for current user
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${FIELDS} FROM agencies WHERE user_id = $1 ORDER BY is_default DESC, name ASC`,
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load agencies' });
  }
});

// Get single agency
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${FIELDS} FROM agencies WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.session.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load agency' });
  }
});

// Create agency
router.post('/', async (req, res) => {
  try {
    const { name, contact_name, contact_email, contact_phone, address, city, state,
            zip, invoicing_email, invoicing_text, default_project_type, website,
            timezone, logo, is_default } = req.body;
    if (is_default) {
      await pool.query('UPDATE agencies SET is_default = false WHERE user_id = $1', [req.session.userId]);
    }
    const result = await pool.query(
      `INSERT INTO agencies (user_id, name, contact_name, contact_email, contact_phone,
       address, city, state, zip, invoicing_email, invoicing_text, default_project_type,
       website, timezone, logo, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING ${FIELDS}`,
      [req.session.userId, name||'', contact_name||'', contact_email||'', contact_phone||'',
       address||'', city||'', state||'', zip||'', invoicing_email||'', invoicing_text||'',
       default_project_type||'location_shoot', website||'', timezone||'PT', logo||'',
       is_default || false]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create agency' });
  }
});

// Update agency
router.put('/:id', async (req, res) => {
  try {
    const { name, contact_name, contact_email, contact_phone, address, city, state,
            zip, invoicing_email, invoicing_text, default_project_type, website,
            timezone, logo, is_default } = req.body;
    if (is_default) {
      await pool.query('UPDATE agencies SET is_default = false WHERE user_id = $1', [req.session.userId]);
    }
    const result = await pool.query(
      `UPDATE agencies SET name=$1, contact_name=$2, contact_email=$3, contact_phone=$4,
       address=$5, city=$6, state=$7, zip=$8, invoicing_email=$9, invoicing_text=$10,
       default_project_type=$11, website=$12, timezone=$13, logo=$14, is_default=$15,
       updated_at=NOW() WHERE id=$16 AND user_id=$17 RETURNING ${FIELDS}`,
      [name||'', contact_name||'', contact_email||'', contact_phone||'', address||'',
       city||'', state||'', zip||'', invoicing_email||'', invoicing_text||'',
       default_project_type||'location_shoot', website||'', timezone||'PT', logo||'',
       is_default||false, req.params.id, req.session.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update agency' });
  }
});

// Delete agency
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM agencies WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete agency' });
  }
});

// Set default agency
router.post('/:id/set-default', async (req, res) => {
  try {
    await pool.query('UPDATE agencies SET is_default = false WHERE user_id = $1', [req.session.userId]);
    await pool.query('UPDATE agencies SET is_default = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set default' });
  }
});

module.exports = router;
