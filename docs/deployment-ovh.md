# Migration et déploiement production sur OVHcloud (VPS Dakar)

Ce guide documente la **migration de Railway vers un VPS OVHcloud** (datacenter Dakar) pour passer EducLink en production sur une cible adaptée au marché Afrique francophone.

À lire avec [deployment.md](deployment.md) (variables et flow général) et [deployment-railway.md](deployment-railway.md) (environnement source).

---

## 1) Pourquoi OVHcloud Dakar pour EducLink

| Critère | Bénéfice |
|---|---|
| **Datacenter Dakar (`DAK`)** | Latence 15-30 ms vers Côte d'Ivoire, Sénégal, Mali. Imbattable pour le marché cible. |
| **Entreprise française, RGPD natif** | Argument commercial fort auprès des écoles privées francophones et institutions ex-conventionnées. |
| **Coût fixe prévisible** | ~8-12 €/mois TTC tout inclus, peu importe le nombre d'écoles. |
| **Backup VPS intégré** | Snapshot quotidien automatique (~1 €/mois en option) — répond à OPS-07. |
| **Support francophone réel** | Tickets traités en français, escalade rapide. |

### Quand migrer

- ✅ **Idéal :** après la validation du pilot (1ère école stable depuis 4+ semaines) et avant la 2ᵉ ou 3ᵉ école payante.
- ❌ **Pas avant :** tant que tu itères vite sur le produit, Railway et son déploiement auto à chaque push restent plus productifs.

---

## 2) Prérequis

- Compte OVHcloud actif (création gratuite).
- Domaine `educlink.xyz` (ou équivalent) avec accès DNS — chez le registrar de ton choix.
- Une clé SSH publique locale (`~/.ssh/id_ed25519.pub`) à coller au moment de la commande.
- Dump récent de la base Railway (`pg_dump`) — voir étape 6.
- 1 demi-journée bloquée pour la bascule (la migration en elle-même prend ~2h, le reste est tampon).

---

## 3) Provisionner le VPS

Plan recommandé pour 1-30 écoles :

| Spec | Plan OVH | Coût indicatif |
|---|---|---|
| 2 vCPU, 4 GB RAM, 80 GB SSD NVMe | **VPS Comfort 2** | ~8 €/mois TTC |
| Datacenter | **Dakar (DAK)** | inclus |
| Image | **Ubuntu 24.04 LTS** | inclus |
| Snapshot automatique | option à activer | ~1 €/mois |

Pour 30-100 écoles, passer à **VPS Comfort 3** (4 vCPU, 8 GB RAM, ~15 €/mois) — la migration vers le plan supérieur se fait en place sans réinstall.

À la commande :
1. Choisir l'image **Ubuntu 24.04 LTS**.
2. Coller la clé SSH publique (login par mot de passe à désactiver ensuite).
3. Activer l'option **Snapshot automatique**.
4. Noter l'IPv4 publique attribuée — on l'appellera `$VPS_IP` ci-dessous.

---

## 4) Durcissement initial du serveur

```bash
ssh ubuntu@$VPS_IP   # ou root si OVH a fourni un compte root

# 1. Créer un utilisateur dédié à l'app
sudo adduser --disabled-password --gecos "" educlink
sudo usermod -aG sudo educlink
sudo mkdir -p /home/educlink/.ssh
sudo cp ~/.ssh/authorized_keys /home/educlink/.ssh/
sudo chown -R educlink:educlink /home/educlink/.ssh
sudo chmod 700 /home/educlink/.ssh
sudo chmod 600 /home/educlink/.ssh/authorized_keys

# 2. Désactiver login mot de passe + login root SSH
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# 3. Firewall UFW (HTTPS, HTTP pour Let's Encrypt, SSH)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# 4. fail2ban contre brute force SSH
sudo apt update && sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban

# 5. Mises à jour système (à relancer mensuellement)
sudo apt update && sudo apt upgrade -y
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

Tester avec une nouvelle session : `ssh educlink@$VPS_IP`.

---

## 5) Installer la stack (Node 20 + PostgreSQL 16)

```bash
# Connecté en tant que `educlink`

# Node 20 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential

# PostgreSQL 16
sudo apt install -y postgresql-16 postgresql-contrib

# Vérifier les versions
node --version    # v20.x
psql --version    # psql (PostgreSQL) 16.x

# Créer la DB et l'utilisateur applicatif
sudo -u postgres psql <<EOF
CREATE USER educlink WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE educlink OWNER educlink;
GRANT ALL PRIVILEGES ON DATABASE educlink TO educlink;
EOF
```

> Note : remplacer `CHANGE_ME_STRONG_PASSWORD` par un mot de passe fort (32+ chars). Le `DATABASE_URL` sera : `postgres://educlink:<password>@localhost:5432/educlink`.

---

## 6) Migrer les données depuis Railway

### 6.1 Dump côté Railway

Sur ta machine locale, en utilisant le `DATABASE_URL` Railway (visible dans le dashboard Railway → Postgres service → Connect) :

```bash
# Récupérer le DATABASE_URL Railway
export RAILWAY_DB="postgres://user:pass@host.railway.app:5432/railway"

# Dump complet (schema + data, pas les rôles)
pg_dump "$RAILWAY_DB" \
  --no-owner --no-acl --clean --if-exists \
  --format=plain \
  --file=educlink-railway-$(date +%Y%m%d-%H%M).sql

# Vérifier la taille
ls -lh educlink-railway-*.sql
```

> Le `--no-owner --no-acl` permet de restaurer sous un autre utilisateur (`educlink` au lieu du user Railway).

### 6.2 Upload + restore sur OVH

```bash
# Upload du dump
scp educlink-railway-*.sql educlink@$VPS_IP:/tmp/

# Connecté en SSH sur le VPS
PGPASSWORD='CHANGE_ME_STRONG_PASSWORD' psql -U educlink -h localhost -d educlink \
  -f /tmp/educlink-railway-*.sql

# Vérifier l'import
PGPASSWORD='CHANGE_ME_STRONG_PASSWORD' psql -U educlink -h localhost -d educlink \
  -c "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM students;"
```

Si tu préfères repartir d'un schéma propre + seed (cas pilot, données de démo) :

```bash
cd /home/educlink/app
EDUCLINK_PERSISTENCE=postgres \
  DATABASE_URL='postgres://educlink:PASS@localhost:5432/educlink' \
  npm run db:migrate

EDUCLINK_PERSISTENCE=postgres \
  DATABASE_URL='postgres://educlink:PASS@localhost:5432/educlink' \
  npm run db:seed
```

---

## 7) Déployer le code et configurer l'environnement

```bash
# Connecté en `educlink`
cd /home/educlink
git clone https://github.com/<ton-org>/EducLink.git app
cd app
npm ci --omit=dev
```

Créer `/home/educlink/app/.env.production` (utiliser `.env.production.example` comme base) :

```bash
NODE_ENV=production
PORT=3000
HOST=127.0.0.1                       # Nginx fait le reverse proxy
EDUCLINK_PERSISTENCE=postgres
DATABASE_URL=postgres://educlink:CHANGE_ME_STRONG_PASSWORD@localhost:5432/educlink
SESSION_SECRET=GENERATE_A_64_CHAR_RANDOM_STRING
LOG_FORMAT=json
LOG_LEVEL=info
NEXT_PUBLIC_APP_URL=https://app.educlink.xyz
```

Génération d'un `SESSION_SECRET` solide :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Sécurité : `chmod 600 .env.production` pour que seul `educlink` puisse le lire.

Test manuel rapide (à arrêter avec Ctrl-C) :

```bash
set -a; source .env.production; set +a
npm run start:prod
# Dans un autre terminal : curl -i http://127.0.0.1:3000/healthz
```

---

## 8) PM2 + démarrage automatique au boot

```bash
sudo npm install -g pm2

cd /home/educlink/app
pm2 start "npm run start:prod" --name educlink --time --max-memory-restart 1G
pm2 save

# Génère et installe l'unité systemd pour relancer PM2 au reboot
pm2 startup systemd -u educlink --hp /home/educlink
# La commande ci-dessus affiche une ligne `sudo env PATH=...` à exécuter telle quelle.
```

Commandes utiles au quotidien :

```bash
pm2 status              # état des process
pm2 logs educlink       # tail des logs (live)
pm2 reload educlink     # zero-downtime reload après pull
pm2 restart educlink    # restart franc
```

---

## 9) Nginx + Let's Encrypt (HTTPS)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Configuration `/etc/nginx/sites-available/educlink` :

```nginx
server {
    listen 80;
    server_name app.educlink.xyz;

    # Let's Encrypt validation
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name app.educlink.xyz;

    # Certificats injectés par certbot (étape suivante)
    ssl_certificate /etc/letsencrypt/live/app.educlink.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.educlink.xyz/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    # Limites raisonnables
    client_max_body_size 5M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    access_log /var/log/nginx/educlink_access.log;
    error_log  /var/log/nginx/educlink_error.log;
}
```

Activer + certificat :

```bash
sudo ln -s /etc/nginx/sites-available/educlink /etc/nginx/sites-enabled/educlink
sudo nginx -t   # vérifier la syntaxe
sudo systemctl reload nginx

# Émission du certificat (DNS doit déjà pointer sur le VPS — voir §10)
sudo certbot --nginx -d app.educlink.xyz \
  --non-interactive --agree-tos -m admin@educlink.xyz

# Renouvellement auto vérifié
sudo certbot renew --dry-run
```

> Le timer systemd `certbot.timer` est installé par défaut et renouvelle tout seul 30 jours avant l'expiration.

---

## 10) Bascule DNS

**1 heure avant la bascule :** baisser le TTL du record `A` actuel chez le registrar à 300 s (5 min). Attendre la propagation.

**Au moment de la bascule :**

1. Mettre EducLink Railway en mode lecture seule (ou pause) pour éviter les écritures perdues.
2. Refaire un `pg_dump` Railway et le restaurer sur OVH (delta court).
3. Modifier le record `A` `app.educlink.xyz` → `$VPS_IP`.
4. Attendre la propagation (5-15 min en pratique).
5. Vérifier : `dig app.educlink.xyz` doit renvoyer `$VPS_IP`.

---

## 11) Smoke tests post-bascule

```bash
# Depuis ta machine
curl -i https://app.educlink.xyz/healthz
# Attendu : HTTP 200, {"status":"ok", ...}

# Vérifier les en-têtes de sécurité Sprint 1
curl -sI https://app.educlink.xyz/login | grep -iE 'strict-transport|x-frame|content-security'
# Attendu : HSTS, X-Frame-Options SAMEORIGIN, CSP

# Login admin pilot
curl -i -X POST https://app.educlink.xyz/login \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data 'email=admin@<école-pilot>&password=<mdp>'
# Attendu : 302 vers /dashboard/admin + cookies signés
```

Test métier complet (à faire en navigateur) :
1. Login admin → dashboard charge sans erreur.
2. `/admin/users` → liste correcte du tenant.
3. `/admin/teachers` → créer un compte test → login avec ce compte → dashboard teacher s'affiche.
4. Logout → retour login.

---

## 12) Backups automatiques (réponse à OPS-07)

### 12.1 Backup DB quotidien (rétention 14 jours)

`/home/educlink/scripts/backup-db.sh` :

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR=/home/educlink/backups
RETENTION_DAYS=14
DATE=$(date +%Y%m%d-%H%M)

mkdir -p "$BACKUP_DIR"

PGPASSWORD='CHANGE_ME_STRONG_PASSWORD' \
  pg_dump -U educlink -h localhost -d educlink \
  --no-owner --no-acl \
  --format=custom \
  --file="$BACKUP_DIR/educlink-$DATE.dump"

# Purge des dumps plus vieux que la rétention
find "$BACKUP_DIR" -name 'educlink-*.dump' -mtime +$RETENTION_DAYS -delete

echo "Backup OK : $BACKUP_DIR/educlink-$DATE.dump"
```

```bash
chmod +x /home/educlink/scripts/backup-db.sh
crontab -e
# Ajouter :
# 30 2 * * * /home/educlink/scripts/backup-db.sh >> /home/educlink/backups/cron.log 2>&1
```

### 12.2 Externalisation hors VPS (critique)

Un backup sur la même machine que la DB n'en est pas un. Choisir une cible offsite :

- **OVH Object Storage S3-compatible** (~0,01 €/Go/mois) — `s3cmd` ou `rclone`.
- **Backblaze B2** (~0,005 €/Go/mois) — moins cher, hors UE.
- **Snapshot OVH** (activé à la commande) — couvre tout le VPS mais coût plus élevé.

Exemple `rclone` vers OVH Object Storage, à ajouter au cron après le dump :

```bash
rclone copy "$BACKUP_DIR/educlink-$DATE.dump" ovh-s3:educlink-backups/
```

### 12.3 Test de restauration

**À faire au moins une fois par trimestre** sur un VPS de test :

```bash
PGPASSWORD='PASS' pg_restore -U educlink -h localhost -d educlink_restore_test \
  --clean --if-exists \
  /home/educlink/backups/educlink-YYYYMMDD-HHMM.dump
```

Un backup non testé n'existe pas.

---

## 13) Monitoring minimal

| Outil | Couverture | Coût |
|---|---|---|
| **UptimeRobot** | ping `/healthz` toutes les 5 min, alerte email/Telegram | gratuit jusqu'à 50 monitors |
| **PM2 logs** | tail live + rotation auto | inclus |
| **`/var/log/nginx/educlink_*.log`** | trafic HTTP, erreurs 4xx/5xx | inclus |
| **Sentry** (OPS-06, optionnel) | erreurs applicatives en stack-trace | gratuit jusqu'à 5k erreurs/mois |

Configurer **UptimeRobot** dès le jour 1 : 1 monitor HTTPS sur `https://app.educlink.xyz/healthz`, alerte vers ton email perso.

Rotation des logs Nginx déjà gérée par `logrotate` (config par défaut). Pour PM2 :

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
```

---

## 14) Mises à jour applicatives (workflow quotidien)

```bash
# Sur ton poste : push sur main
git push origin main

# Sur le VPS, en SSH
cd /home/educlink/app
git pull
npm ci --omit=dev
npm run db:migrate    # idempotent, safe à relancer
pm2 reload educlink   # zero-downtime
```

Optionnel : automatiser via un webhook GitHub Actions qui SSH sur le VPS et exécute ces 4 commandes. Pour le pilot, le déploiement manuel reste sain (sentinel humain).

---

## 15) Plan de rollback (retour à Railway en < 30 min)

Si quelque chose casse en production OVH dans les premières 48h :

1. **DNS** : remettre le record `A` `app.educlink.xyz` → ancien hostname Railway (CNAME ou IP Railway).
2. **DB** : si des écritures ont eu lieu sur OVH, dump immédiat et merge manuel avec Railway (cas rare en pilot).
3. **TTL bas (300 s)** = bascule effective en 5-10 min.
4. **Garde Railway actif 7 jours** après la migration avant de couper l'abonnement.

> Ne supprime jamais le projet Railway tant que la production OVH n'a pas tourné 1 semaine complète sans incident.

---

## 16) Coûts indicatifs (référence mensuelle)

| Poste | Coût | Note |
|---|---|---|
| VPS OVH Comfort 2 Dakar | ~8 € TTC | 2 vCPU, 4 GB RAM |
| Snapshot automatique | ~1 € TTC | recommandé |
| Object Storage backups (10 Go) | ~0,10 € | très négligeable |
| Domaine `.xyz` ou `.app` | ~1-2 € | amorti annuel |
| UptimeRobot, Let's Encrypt | gratuit | — |
| **Total ~10-12 €/mois** | | pour 1-30 écoles |

À comparer avec Railway qui démarre à 5 $/mois en "Hobby" mais grimpe vite à 20-50 $/mois avec un service web + un Postgres en usage continu.

---

## 17) Hors-scope volontaire

- **CI/CD automatisé** (GitHub Actions → SSH deploy) : sain mais pas critique pour le pilot.
- **Haute dispo multi-zone** : pas avant 50+ écoles. Pour l'instant, le snapshot quotidien + le RTO < 1h suffit.
- **CDN** (Cloudflare devant Nginx) : utile quand on aura beaucoup de statiques ou que les utilisateurs viendront de multiples régions hors Afrique de l'Ouest.
- **PostgreSQL managé OVH (Public Cloud Databases)** : envisageable si tu veux te débarrasser de la gestion DB — compter ~25-30 €/mois supplémentaires. Pas nécessaire au début.

---

## Référence rapide — checklist J-Day

- [ ] VPS Comfort 2 Dakar commandé, accessible en SSH (§3)
- [ ] Utilisateur `educlink`, SSH par clé, UFW, fail2ban (§4)
- [ ] Node 20 + PostgreSQL 16 installés, DB `educlink` créée (§5)
- [ ] Dump Railway restauré sur OVH (§6)
- [ ] Code cloné, `.env.production` rempli avec `SESSION_SECRET` fort (§7)
- [ ] PM2 lance l'app au boot (§8)
- [ ] Nginx + Let's Encrypt OK, `curl https://app.educlink.xyz/healthz` → 200 (§9, §11)
- [ ] DNS basculé, propagation vérifiée (§10)
- [ ] Cron backup quotidien + externalisation S3 (§12)
- [ ] UptimeRobot configuré (§13)
- [ ] Railway gardé actif pendant 7 jours (§15)
