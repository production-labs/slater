const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function importProjects() {
  const filePath = process.argv[2];
  if (!filePath) {
	console.error('Usage: node import.js <path-to-backup.json>');
	process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const backup = JSON.parse(raw);
  
  // Projects are nested inside backup.projects
  const projects = backup.projects || backup;
  const keys = Object.keys(projects).filter(k => k.startsWith('cs_'));
  
  console.log(`Importing ${keys.length} projects...`);

  for (const key of keys) {
	const project = projects[key];
	const label = project.label || key;
	try {
	  await pool.query(
		`INSERT INTO projects (key, label, data, updated_at)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (key) DO UPDATE
		 SET label = $2, data = $3, updated_at = NOW()`,
		[key, label, project]
	  );
	  console.log(`✓ ${label}`);
	} catch (err) {
	  console.error(`✗ ${key}: ${err.message}`);
	}
  }

  console.log('Done!');
  await pool.end();
}

importProjects();