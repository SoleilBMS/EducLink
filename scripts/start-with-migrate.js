#!/usr/bin/env node
// Wrapper de démarrage pour la production : exécute les migrations
// puis lance le serveur HTTP.
//
// Comportement :
//   - Si EDUCLINK_AUTO_MIGRATE=0, saute la migration (utile si tu pilotes
//     les schémas via un release command Railway distinct).
//   - Sinon, lance `packages/database/src/migrate.js` comme sous-processus
//     synchrone. Échec migration → exit non-zéro, le serveur ne démarre pas.
//   - L'environnement (NODE_ENV, EDUCLINK_PERSISTENCE, DATABASE_URL...) est
//     propagé tel quel ; il doit donc être préparé en amont (cross-env dans
//     le script npm, ou les variables injectées par Railway).
//
// Les migrations sont idempotentes (table schema_migrations), donc le wrapper
// peut tourner à chaque redémarrage sans dommage.

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const shouldAutoMigrate = process.env.EDUCLINK_AUTO_MIGRATE !== '0';

if (shouldAutoMigrate) {
  console.log('[start-with-migrate] Running database migrations before server start...');
  const migrateScript = path.resolve(__dirname, '../packages/database/src/migrate.js');
  const result = spawnSync(process.execPath, [migrateScript], {
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) {
    console.error(`[start-with-migrate] Migration failed (exit ${result.status ?? 'unknown'}), aborting server start.`);
    process.exit(result.status ?? 1);
  }
  console.log('[start-with-migrate] Migrations complete.');
} else {
  console.log('[start-with-migrate] EDUCLINK_AUTO_MIGRATE=0 — migrations skipped.');
}

// Charge le serveur après migration pour que la connexion DB initiale voie
// le schéma à jour. server.js exporte `startServer` mais ne le déclenche pas
// automatiquement lorsqu'il est requis comme module.
const { startServer } = require('../apps/web/src/server.js');

startServer().catch((error) => {
  console.error('[start-with-migrate] Server startup failed:', error);
  process.exitCode = 1;
});
