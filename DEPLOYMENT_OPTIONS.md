# SCHOLARX - Deployment Options Guide

## 📋 Overview

This guide covers multiple deployment options for the SCHOLARX project, from quick cloud deployments to traditional VPS setups.

**Project Structure:**
- **Backend:** Django REST API (`webapp/backend/`)
- **Frontend:** Static HTML/CSS/JS (`webapp/frontend/`)
- **Database:** PostgreSQL
- **Additional Services:** Chatbot (ML models), Schedule Matching

---

## 🎯 Quick Reference: Deployment Options

| Platform | Difficulty | Cost | Best For | Setup Time |
|----------|-----------|------|----------|------------|
| **Render** | ⭐ Easy | Free tier available | Quick deployment, auto-scaling | 15-30 min |
| **Railway** | ⭐ Easy | Free tier available | Simple setup, good DX | 15-30 min |
| **Heroku** | ⭐⭐ Medium | Paid | Established platform | 20-40 min |
| **DigitalOcean App Platform** | ⭐⭐ Medium | Paid | Managed platform | 20-40 min |
| **AWS/GCP/Azure** | ⭐⭐⭐ Hard | Pay-as-you-go | Enterprise, full control | 1-2 hours |
| **VPS (DigitalOcean/Linode)** | ⭐⭐⭐ Hard | $5-20/month | Full control, cost-effective | 1-2 hours |

---

## 📁 Project Structure & Requirements

### Key Files:
- **Backend:** `webapp/backend/` (Django application)
- **Frontend:** `webapp/frontend/` (Static files)
- **Environment:** `.env` file needed in `webapp/backend/`
- **Requirements:** `webapp/backend/requirements.txt`

### Environment Variables:
Create `.env` file in `webapp/backend/` directory (see `.env.example` for template)

---

## 🚀 Option 1: Render (Recommended for Quick Deployment)

**Best for:** Quick deployment, free tier, automatic HTTPS

### Pros:
- ✅ Free tier available
- ✅ Automatic HTTPS/SSL
- ✅ Auto-deploy from Git
- ✅ PostgreSQL database included
- ✅ Easy environment variable management

### Cons:
- ⚠️ Free tier spins down after inactivity
- ⚠️ Limited customization

### Steps:

1. **Create Render Account**
   - Go to https://render.com
   - Sign up with GitHub

2. **Create PostgreSQL Database**
   - Dashboard → New → PostgreSQL
   - Name: `scholarx-db`
   - Note the connection details

3. **Create Web Service**
   - Dashboard → New → Web Service
   - Connect your GitHub repository
   - Settings:
     - **Name:** `scholarx-backend`
     - **Environment:** `Python 3`
     - **Build Command:** `cd webapp/backend && pip install -r requirements.txt`
     - **Start Command:** `cd webapp/backend && gunicorn scholarx_backend.wsgi:application --bind 0.0.0.0:$PORT`
     - **Root Directory:** `webapp/backend`

4. **Configure Environment Variables**
   - In Render dashboard → Environment
   - Add all variables from `.env.example`:
     ```
     DEBUG=False
     SECRET_KEY=<generate-new-key>
     ALLOWED_HOSTS=your-app.onrender.com
     DB_NAME=<from-postgres-db>
     DB_USER=<from-postgres-db>
     DB_PASSWORD=<from-postgres-db>
     DB_HOST=<from-postgres-db>
     DB_PORT=5432
     CORS_ALLOWED_ORIGINS=https://your-app.onrender.com
     CSRF_TRUSTED_ORIGINS=https://your-app.onrender.com
     GEMINI_API_KEY=<your-key>
     ```

5. **Deploy Frontend (Static Site)**
   - Dashboard → New → Static Site
   - Connect repository
   - **Build Command:** (leave empty or `echo "No build needed"`)
   - **Publish Directory:** `webapp/frontend`
   - Update `CORS_ALLOWED_ORIGINS` in backend to include frontend URL

6. **Run Migrations**
   - After first deployment, go to Shell
   - Run: `cd webapp/backend && python manage.py migrate`
   - Run: `cd webapp/backend && python manage.py collectstatic --noinput`

### Cost: Free tier available, $7/month for always-on

---

## 🚂 Option 2: Railway

**Best for:** Simple deployment, good developer experience

### Pros:
- ✅ Free tier with $5 credit
- ✅ Automatic HTTPS
- ✅ PostgreSQL included
- ✅ Simple configuration

### Steps:

1. **Create Railway Account**
   - Go to https://railway.app
   - Sign up with GitHub

2. **Create New Project**
   - New Project → Deploy from GitHub
   - Select your repository

3. **Add PostgreSQL Database**
   - New → Database → PostgreSQL
   - Railway automatically provides connection variables

4. **Configure Service**
   - Add service → GitHub Repo
   - Settings:
     - **Root Directory:** `webapp/backend`
     - **Start Command:** `gunicorn scholarx_backend.wsgi:application --bind 0.0.0.0:$PORT`
     - **Build Command:** `pip install -r requirements.txt`

5. **Set Environment Variables**
   - Variables tab → Add all from `.env.example`
   - Railway auto-provides: `DATABASE_URL`, `PORT`
   - You need to add: `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, etc.

6. **Deploy Frontend**
   - Add another service → Static Site
   - **Root Directory:** `webapp/frontend`

### Cost: Free tier with $5 credit, then pay-as-you-go

---

## 🟣 Option 3: Heroku

**Best for:** Established platform, extensive documentation

### Pros:
- ✅ Well-documented
- ✅ Large ecosystem
- ✅ Add-ons available

### Cons:
- ⚠️ No free tier (removed in 2022)
- ⚠️ More expensive

### Steps:

1. **Install Heroku CLI**
   ```bash
   # Windows
   # Download from https://devcenter.heroku.com/articles/heroku-cli
   ```

2. **Create Heroku App**
   ```bash
   heroku login
   heroku create scholarx-backend
   ```

3. **Add PostgreSQL**
   ```bash
   heroku addons:create heroku-postgresql:mini
   ```

4. **Configure Environment Variables**
   ```bash
   heroku config:set DEBUG=False
   heroku config:set SECRET_KEY=$(python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
   heroku config:set ALLOWED_HOSTS=scholarx-backend.herokuapp.com
   # Add all other variables from .env.example
   ```

5. **Create Procfile**
   Create `webapp/backend/Procfile`:
   ```
   web: gunicorn scholarx_backend.wsgi:application --bind 0.0.0.0:$PORT
   ```

6. **Deploy**
   ```bash
   cd webapp/backend
   git subtree push --prefix webapp/backend heroku main
   # Or use Heroku Git
   heroku git:remote -a scholarx-backend
   git push heroku main
   ```

7. **Run Migrations**
   ```bash
   heroku run python manage.py migrate
   heroku run python manage.py collectstatic --noinput
   ```

### Cost: $5-7/month minimum

---

## ☁️ Option 4: DigitalOcean App Platform

**Best for:** Managed platform with good performance

### Steps:

1. **Create App**
   - Dashboard → Create → App
   - Connect GitHub repository

2. **Configure Backend Service**
   - Add Component → Web Service
   - **Source Directory:** `webapp/backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Run Command:** `gunicorn scholarx_backend.wsgi:application --bind 0.0.0.0:$PORT`
   - **Environment Variables:** Add all from `.env.example`

3. **Add Database**
   - Add Component → Database → PostgreSQL
   - Select plan

4. **Add Static Site (Frontend)**
   - Add Component → Static Site
   - **Source Directory:** `webapp/frontend`

### Cost: $5-12/month

---

## 🖥️ Option 5: VPS Deployment (DigitalOcean/Linode/Vultr)

**Best for:** Full control, cost-effective, learning

### Pros:
- ✅ Full control
- ✅ Cost-effective ($5-20/month)
- ✅ No vendor lock-in

### Cons:
- ⚠️ Manual setup required
- ⚠️ You manage security updates
- ⚠️ More technical knowledge needed

### Steps:

1. **Create VPS**
   - DigitalOcean/Linode/Vultr
   - Ubuntu 22.04 LTS
   - Minimum: 1GB RAM, 1 CPU (2GB+ recommended)

2. **Initial Server Setup**
   ```bash
   # SSH into server
   ssh root@your-server-ip
   
   # Update system
   apt update && apt upgrade -y
   
   # Create non-root user
   adduser scholarx
   usermod -aG sudo scholarx
   su - scholarx
   ```

3. **Install Dependencies**
   ```bash
   # Python
   sudo apt install python3-pip python3-venv python3-dev -y
   
   # PostgreSQL
   sudo apt install postgresql postgresql-contrib -y
   
   # Nginx
   sudo apt install nginx -y
   
   # Git
   sudo apt install git -y
   ```

4. **Setup PostgreSQL**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE scholarx_prod;
   CREATE USER scholarx_user WITH PASSWORD 'strong_password';
   GRANT ALL PRIVILEGES ON DATABASE scholarx_prod TO scholarx_user;
   \q
   ```

5. **Clone Repository**
   ```bash
   cd /var/www
   sudo git clone https://github.com/yourusername/scholarx.git
   sudo chown -R scholarx:scholarx scholarx
   cd scholarx
   ```

6. **Setup Python Environment**
   ```bash
   cd webapp/backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   pip install gunicorn
   ```

7. **Create .env File**
   ```bash
   cp .env.example .env
   nano .env
   # Fill in all production values
   ```

8. **Run Migrations**
   ```bash
   python manage.py migrate
   python manage.py collectstatic --noinput
   python manage.py createsuperuser
   ```

9. **Setup Gunicorn Service**
   Create `/etc/systemd/system/scholarx.service`:
   ```ini
   [Unit]
   Description=ScholarX Gunicorn daemon
   After=network.target
   
   [Service]
   User=scholarx
   Group=www-data
   WorkingDirectory=/var/www/scholarx/webapp/backend
   Environment="PATH=/var/www/scholarx/webapp/backend/venv/bin"
   ExecStart=/var/www/scholarx/webapp/backend/venv/bin/gunicorn \
       --workers 3 \
       --bind unix:/var/www/scholarx/webapp/backend/scholarx.sock \
       scholarx_backend.wsgi:application
   
   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start scholarx
   sudo systemctl enable scholarx
   ```

10. **Configure Nginx**
    Create `/etc/nginx/sites-available/scholarx`:
    ```nginx
    server {
        listen 80;
        server_name your-domain.com www.your-domain.com;
    
        location / {
            proxy_pass http://unix:/var/www/scholarx/webapp/backend/scholarx.sock;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    
        location /static/ {
            alias /var/www/scholarx/webapp/backend/staticfiles/;
        }
    
        location /media/ {
            alias /var/www/scholarx/webapp/backend/media/;
        }
    }
    ```

    ```bash
    sudo ln -s /etc/nginx/sites-available/scholarx /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

11. **Setup SSL with Let's Encrypt**
    ```bash
    sudo apt install certbot python3-certbot-nginx -y
    sudo certbot --nginx -d your-domain.com -d www.your-domain.com
    ```

12. **Deploy Frontend**
    - Option A: Serve from Nginx
      ```nginx
      location / {
          root /var/www/scholarx/webapp/frontend;
          try_files $uri $uri/ /index.html;
      }
      ```
    
    - Option B: Use separate static hosting (Netlify, Vercel, Cloudflare Pages)

### Cost: $5-20/month

---

## 🔧 Option 6: AWS/GCP/Azure (Enterprise)

**Best for:** Enterprise applications, high traffic, full control

### AWS Setup (Brief):

1. **EC2 Instance** (or use Elastic Beanstalk)
2. **RDS PostgreSQL** database
3. **S3** for static/media files
4. **CloudFront** CDN
5. **Route 53** for DNS
6. **Application Load Balancer** for scaling

### GCP Setup (Brief):

1. **Cloud Run** (serverless containers)
2. **Cloud SQL** PostgreSQL
3. **Cloud Storage** for static files
4. **Cloud CDN**

### Azure Setup (Brief):

1. **App Service** (managed Django)
2. **Azure Database for PostgreSQL**
3. **Blob Storage** for media
4. **Azure CDN**

---

## 📝 Pre-Deployment Checklist (All Options)

### 1. Generate Secret Key
```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### 2. Create .env File
- Copy `.env.example` to `.env` in `webapp/backend/`
- Fill in all production values
- **Never commit .env to Git**

### 3. Security Checks
```bash
cd webapp/backend
python manage.py check --deploy
```

### 4. Test Locally
```bash
# Set DEBUG=False in .env
python manage.py collectstatic --noinput
python manage.py migrate
gunicorn scholarx_backend.wsgi:application --bind 0.0.0.0:8000
```

### 5. Database Setup
- Create production database
- Run migrations
- Create superuser (if needed)

---

## 🔐 Environment Variables Reference

All variables should be set in your deployment platform's environment variable settings.

**Required:**
- `DEBUG=False`
- `SECRET_KEY=<generated-key>`
- `ALLOWED_HOSTS=<your-domain>`
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- `CORS_ALLOWED_ORIGINS=<your-frontend-url>`
- `CSRF_TRUSTED_ORIGINS=<your-frontend-url>`

**Recommended:**
- `GEMINI_API_KEY` (for chatbot)
- `EMAIL_*` settings (for email functionality)
- `FRONTEND_URL` (for redirects)

See `webapp/backend/.env.example` for complete list.

---

## 🚨 Common Deployment Issues

### Issue: Static Files Not Loading
**Solution:**
```bash
python manage.py collectstatic --noinput
```
Ensure `STATIC_ROOT` is correctly configured and web server serves `/static/`

### Issue: CORS Errors
**Solution:**
- Check `CORS_ALLOWED_ORIGINS` includes your frontend URL
- Ensure protocol matches (http vs https)
- Restart application after changing env vars

### Issue: Database Connection Failed
**Solution:**
- Verify database credentials
- Check firewall/security groups allow connections
- Ensure database is accessible from deployment platform

### Issue: 500 Internal Server Error
**Solution:**
- Check application logs
- Verify all environment variables are set
- Run `python manage.py check --deploy`
- Check database migrations are applied

---

## 📊 Recommended Deployment Strategy

### For Quick Start (Development/Demo):
**→ Use Render or Railway** (15-30 minutes)

### For Production (Small-Medium Scale):
**→ Use DigitalOcean App Platform or VPS** ($5-20/month)

### For Enterprise/Large Scale:
**→ Use AWS/GCP/Azure** (Full control, auto-scaling)

---

## 🔄 Continuous Deployment

### GitHub Actions Example:
Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Render
        # Use Render webhook or API
```

---

## 📚 Additional Resources

- **Django Deployment:** https://docs.djangoproject.com/en/4.2/howto/deployment/
- **Gunicorn:** https://gunicorn.org/
- **Nginx:** https://nginx.org/en/docs/
- **Let's Encrypt:** https://letsencrypt.org/

---

## ✅ Post-Deployment Checklist

- [ ] Application accessible via HTTPS
- [ ] All environment variables set correctly
- [ ] Database migrations applied
- [ ] Static files collected and served
- [ ] Frontend can communicate with backend (CORS working)
- [ ] Login/Registration working
- [ ] API endpoints responding
- [ ] Email functionality tested (if configured)
- [ ] Monitoring/logging set up
- [ ] Backup strategy in place

---

**Last Updated:** December 2024  
**Project:** SCHOLARX  
**Backend Location:** `webapp/backend/`  
**Frontend Location:** `webapp/frontend/`  
**Environment File:** `webapp/backend/.env`

