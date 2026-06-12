// Page showcase dev-only — rend tous les composants du design system
// en light + dark cote a cote. Accessible via /__design, gardee par NODE_ENV.

function renderShowcaseHtml() {
  const renderSection = (theme) => `
    <section data-theme="${theme}" style="padding: 32px; background: var(--el-color-bg);">
      <h1>${theme === 'light' ? '☀️ Light mode' : '🌙 Dark mode'}</h1>

      <h2><span class="el-card-title-accent"></span>Boutons</h2>
      <div class="el-card">
        <button type="button">Primary</button>
        <button type="button" class="el-button-secondary">Secondary</button>
        <button type="button" class="el-button-link">Ghost</button>
        <button type="button" class="el-button-destructive">Destructive</button>
      </div>

      <h2><span class="el-card-title-accent"></span>Badges</h2>
      <div class="el-card">
        <span class="el-badge">Default</span>
        <span class="el-badge is-success">Success</span>
        <span class="el-badge is-warning">Warning</span>
        <span class="el-badge is-error">Error</span>
        <span class="el-badge is-info">Info</span>
      </div>

      <h2><span class="el-card-title-accent"></span>Banners</h2>
      <div class="el-banner is-success">Action realisee avec succes</div>
      <div class="el-banner is-warning">Attention, verification recommandee</div>
      <div class="el-banner is-error">Une erreur est survenue</div>
      <div class="el-banner is-info">Information generale</div>

      <h2><span class="el-card-title-accent"></span>Cards</h2>
      <div class="el-card">
        <h3>Card par defaut</h3>
        <p>Contenu standard avec ombre soft.</p>
      </div>
      <div class="el-card is-interactive">
        <h3>Card interactive</h3>
        <p>Hover → scale + ombre plus prononcee.</p>
      </div>
      <div class="el-card is-highlight">
        <h3>Card highlight</h3>
        <p>Bordure top gradient brand.</p>
      </div>
      <div class="el-card is-elevated">
        <h3>Card elevated</h3>
        <p>Ombre prononcee pour mise en avant.</p>
      </div>

      <h2><span class="el-card-title-accent"></span>Avatars (6 palettes)</h2>
      <div class="el-card" style="display:flex; gap:12px; align-items:center;">
        <span class="el-avatar is-palette-1">JD</span>
        <span class="el-avatar is-palette-2">AB</span>
        <span class="el-avatar is-palette-3">CE</span>
        <span class="el-avatar is-palette-4">FG</span>
        <span class="el-avatar is-palette-5">HI</span>
        <span class="el-avatar is-palette-6">KL</span>
        <span class="el-avatar is-small is-palette-1">SM</span>
        <span class="el-avatar is-large is-palette-2">LG</span>
      </div>

      <h2><span class="el-card-title-accent"></span>Formulaires</h2>
      <div class="el-card">
        <label>Email
          <input type="email" placeholder="vous@exemple.fr" />
        </label>
        <label>Mot de passe
          <input type="password" placeholder="********" />
        </label>
        <label>Message
          <textarea rows="3" placeholder="Tapez votre message..."></textarea>
        </label>
        <label>Choix
          <select>
            <option>Option A</option>
            <option>Option B</option>
          </select>
        </label>
        <button type="button">Valider</button>
      </div>

      <h2><span class="el-card-title-accent"></span>Table</h2>
      <table>
        <thead><tr><th>Nom</th><th>Role</th><th>Statut</th></tr></thead>
        <tbody>
          <tr><td>Alice Dupont</td><td>Enseignante</td><td><span class="el-badge is-success">Actif</span></td></tr>
          <tr><td>Bob Martin</td><td>Parent</td><td><span class="el-badge is-warning">En attente</span></td></tr>
          <tr><td>Charlie Diallo</td><td>Admin</td><td><span class="el-badge is-info">Connecte</span></td></tr>
        </tbody>
      </table>

      <h2><span class="el-card-title-accent"></span>Empty state</h2>
      <div class="el-empty">
        <svg class="el-empty-illustration" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="el-empty-grad-${theme}" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#4F46E5"/>
              <stop offset="100%" stop-color="#7C3AED"/>
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r="40" fill="url(#el-empty-grad-${theme})" opacity="0.15"/>
          <rect x="28" y="30" width="40" height="36" rx="4" stroke="url(#el-empty-grad-${theme})" stroke-width="2.5" fill="none"/>
          <path d="M28 38h40M34 48h28M34 56h20" stroke="url(#el-empty-grad-${theme})" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <p class="el-empty-title">Aucun element a afficher</p>
        <p class="el-empty-message">Lorsque vous aurez ajoute du contenu, il apparaitra ici.</p>
        <button type="button">Ajouter le premier element</button>
      </div>

      <h2><span class="el-card-title-accent"></span>Skeleton loader</h2>
      <div class="el-card">
        <span class="el-skeleton" style="width: 60%; height: 1.5em; display:block; margin-bottom: 12px;"></span>
        <span class="el-skeleton" style="width: 90%; height: 1em; display:block; margin-bottom: 8px;"></span>
        <span class="el-skeleton" style="width: 80%; height: 1em; display:block;"></span>
      </div>

      <h2><span class="el-card-title-accent"></span>Typo</h2>
      <div class="el-card">
        <h1>Heading 1 — Nunito 900</h1>
        <h2>Heading 2 — Nunito 800</h2>
        <h3>Heading 3 — Nunito 700</h3>
        <p>Paragraphe — Nunito 400, line-height 1.6. <a href="#">Lien indigo</a> et <code>code inline</code>.</p>
      </div>
    </section>
  `;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Design Showcase — EducLink</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap"><link rel="stylesheet" href="/assets/design-system.css"></head><body style="margin: 0;">
    <header style="padding: 24px 32px; background: var(--el-color-surface); border-bottom: 1px solid var(--el-color-border);">
      <h1 style="margin: 0;">Design Showcase — EducLink (Klassly-style)</h1>
      <p style="margin: 4px 0 0; color: var(--el-color-text-secondary);">Page dev-only — composants en light + dark cote a cote.</p>
    </header>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0;">
      ${renderSection('light')}
      ${renderSection('dark')}
    </div>
  </body></html>`;
}

module.exports = { renderShowcaseHtml };
