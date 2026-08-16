// Run once: node migrate-agencies.js
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add dba column to users
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS dba TEXT`);

    // 2. Add billing_email and invoicing_text columns if they don't exist yet
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_billing_email TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_invoicing_text TEXT`);

    // 3. Create agencies table
    await client.query(`
      CREATE TABLE IF NOT EXISTS agencies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT,
        contact_name TEXT,
        contact_email TEXT,
        contact_phone TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        zip TEXT,
        invoicing_email TEXT,
        invoicing_text TEXT,
        default_project_type TEXT DEFAULT 'location_shoot',
        website TEXT,
        timezone TEXT DEFAULT 'PT',
        logo TEXT,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 4. Add agency_id to projects
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS agency_id INTEGER REFERENCES agencies(id)`);

    // 5. Migrate existing agency data from users into agencies table (skip if already done)
    const existing = await client.query(`SELECT COUNT(*) FROM agencies`);
    if (parseInt(existing.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO agencies (user_id, name, contact_name, contact_email, contact_phone,
          address, city, state, zip, invoicing_email, invoicing_text,
          default_project_type, timezone, logo, is_default)
        SELECT id, agency_name, agency_billing_contact, agency_billing_email, agency_phone,
          agency_address, agency_city, agency_state, agency_zip, agency_billing_email,
          agency_invoicing_text, agency_project_type, agency_timezone, agency_logo, true
        FROM users
        WHERE agency_name IS NOT NULL AND agency_name != ''
      `);
      console.log('Migrated agency data from users table');

      // 6. Assign default agency to existing projects
      await client.query(`
        UPDATE projects p
        SET agency_id = (
          SELECT a.id FROM agencies a WHERE a.user_id = p.owner_id AND a.is_default = true LIMIT 1
        )
        WHERE p.owner_id IS NOT NULL AND p.agency_id IS NULL
      `);
      console.log('Assigned agency_id to existing projects');
    } else {
      console.log('Agencies table already has data, skipping migration');
    }

    await client.query('COMMIT');
    console.log('Migration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
