# Going live: Heavyworks Garage

This guide puts the app on the internet at your own web address, with HTTPS and nightly backups. One person who is comfortable typing commands can do it in about an hour. Most of the time is waiting for the domain to start working.

**What you get**
- The app at an address like `https://app.heavyworksgarage.com`, on phones and computers
- A padlock (HTTPS), renewed automatically
- A backup every night at 2am, kept for 14 days, plus a weekly copy of the whole server
- Updates installed with one command

**Monthly cost (approximate)**

| Item | Cost |
|---|---|
| DigitalOcean server, Singapore, 2 GB memory | US$12 / month |
| DigitalOcean weekly server backups | US$2.40 / month |
| Domain name (`.com` about RM 60/year; `.com.my` about RM 100/year) | about RM 5–9 / month |
| **Total** | **about RM 75 / month** |

---

## Step 1. Buy the domain name

Buy a domain from any registrar (Namecheap, Cloudflare or GoDaddy for `.com`; Exabytes or Shinjiru for `.com.my`). You will use a sub-address of it for the app, for example `app.heavyworksgarage.com`. Your website or email on the main domain is not affected.

## Step 2. Create the server

1. Sign up at **digitalocean.com** and add a payment card.
2. Click **Create → Droplets**:
   - **Region:** Singapore
   - **Image:** Ubuntu 24.04 (LTS)
   - **Size:** Basic → Regular → **2 GB / 1 CPU** (US$12)
   - **Backups:** turn on **weekly** backups
   - **Authentication:** choose **SSH key** if you have one, otherwise a strong password (write it down somewhere safe)
   - **Hostname:** `heavyworks`
3. Click **Create Droplet**. When it is ready, copy its **IPv4 address** (for example `128.199.10.20`).

## Step 3. Point the address at the server

At your domain registrar, open the DNS settings and add:

| Type | Name | Value |
|---|---|---|
| A | `app` | the droplet's IPv4 address |

**Domain bought from Wix:** in your Wix account go to **Domains**, click **⋯** next to the domain, choose **Manage DNS Records**, find **A (Host)**, click **+ Add Record**, enter Host name `app` and the droplet's IP address under Points to, then **Save**. Leave the other records alone, so a Wix website on the main domain keeps working.

It usually works within 15 minutes, but can take a few hours. To check, open a terminal on your computer and run `ping app.heavyworksgarage.com`: the address shown should be the droplet's.

## Step 4. Install the app

Connect to the server. On Mac, use Terminal; on Windows, use PowerShell:

```bash
ssh root@128.199.10.20
```

Then run these commands one block at a time:

```bash
# 1. Updates, firewall, Docker and swap space (the build needs extra memory)
apt update && apt upgrade -y
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
curl -fsSL https://get.docker.com | sh
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

```bash
# 2. Download the app. The repository is private, so GitHub asks for a username and a token:
#    GitHub → Settings → Developer settings → Fine-grained tokens → "Contents: Read-only" on this repository.
git clone https://github.com/superpowercranemachinerysdnbhd/heavydutygarage.git /opt/heavyworks
cd /opt/heavyworks/deploy
```

```bash
# 3. Settings: your address and a random database password
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
nano .env        # set DOMAIN=app.heavyworksgarage.com (and LABOUR_RATE). Save: Ctrl+O, Enter, Ctrl+X
```

```bash
# 4. Start it (the first build takes 3–5 minutes)
docker compose up -d --build
docker compose ps        # app and db should say "healthy" after a minute
```

Open `https://app.heavyworksgarage.com`. You should see the sign-in page with a padlock.

## Step 5. Create the Boss account

On the server, in `/opt/heavyworks/deploy`:

```bash
docker compose exec app npm run user:create -- --name "Tan Boon Hock" --phone 0123456789 --role boss --password "choose-a-strong-one"
```

Sign in with that phone number and password, then change the password under **Account**. This is a fresh, empty system with no demo data.

## Step 6. Load your workshop

As the Boss, in this order:

1. **Team → New**: Supervisor, mechanics, assistants, painters, fabricators and cleaners, each with their phone number, a first password and pay rate. Give each person their password. They can change it under Account and choose their language.
2. **Machinery → Models**: the models you service most (make, model, type, specs, known issues).
3. **Customers**: your regular customers, with their report language.
4. **Machinery → New**: machines currently in the yard, with serial numbers.
5. **Parts → Categories**, then **Parts** and **Purchasing → Suppliers**. Use **Purchasing → Import prices** for suppliers' price lists (CSV).
6. **Jobs**: open jobs for the machines already being worked on.

**Phones:** open the address in Chrome (Android) or Safari (iPhone) and choose **Add to Home Screen**. The app then opens full screen with the Heavyworks icon.

## Step 7. First two weeks

- Run the new system alongside your current one (whiteboard or book) for a week, then switch.
- At the end of each day the Supervisor checks that every job's status, labour and parts are up to date.
- Write down anything confusing or missing and send it over. Fixes are installed with Step 8.

---

## Step 8. Installing updates

```bash
cd /opt/heavyworks/deploy && ./update.sh
```

This backs up first, downloads the new version, rebuilds and restarts. The app is down for about a minute, so do it outside working hours.

## Backups

- **Every night at 2am** the server saves the database and all photos into `/opt/heavyworks/deploy/backups`. It keeps 14 days.
- **Every week** DigitalOcean copies the whole server, backups folder included. These copies are kept in a different place from the server.
- **Once a month (recommended)**, copy the latest backup to a computer in the office:
  ```bash
  scp -r root@128.199.10.20:/opt/heavyworks/deploy/backups ./heavyworks-backups
  ```

**Restoring** (only if something went badly wrong). List the backups with `ls backups/`, then:

```bash
cd /opt/heavyworks/deploy && ./restore.sh 2026-10-16_0200
```

It asks you to type `RESTORE` before replacing anything. Everything entered after that backup is lost.

## Useful commands

All are run on the server in `/opt/heavyworks/deploy`.

| To | Run |
|---|---|
| See if everything is running | `docker compose ps` |
| See the app's recent messages | `docker compose logs --tail 50 app` |
| Restart the app | `docker compose restart app` |
| Back up right now | `docker compose exec backup sh /backup.sh now` |
| Create another login from the command line | `docker compose exec app npm run user:create -- --name "…" --phone … --role supervisor --password "…"` |

## Security notes

- Only ports 80 and 443 (web) and 22 (SSH) are open. The database cannot be reached from the internet.
- Passwords are stored hashed. Sign-in locks for 15 minutes after 8 wrong passwords for one phone number, or 30 from one place.
- When someone leaves, the Boss sets them to inactive on their Team page. Their sign-in stops working at once.
- Keep `deploy/.env` private: it holds the database password.
- Optional: add a free uptime check (for example UptimeRobot) on `https://app.heavyworksgarage.com/api/health`. It emails you if the app stops answering.
