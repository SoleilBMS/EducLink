#!/usr/bin/env node
const { spawn } = require('node:child_process');

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(' ')} terminated with signal ${signal}`));
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function main() {
  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'staging',
    EDUCLINK_PERSISTENCE: process.env.EDUCLINK_PERSISTENCE || 'postgres',
    LOG_FORMAT: process.env.LOG_FORMAT || 'json'
  };

  await run('npm', ['run', 'db:migrate'], env);

  if (env.STAGING_RUN_SEED === 'true') {
    await run('npm', ['run', 'db:seed'], env);
  }

  await run('node', ['apps/web/src/server.js'], env);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error.message);
  process.exitCode = 1;
});
