# Quick Deployment Checklist

## Pre-Deployment (Do This First)

### 1. Generate Secure SECRET_KEY
```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```
⚠️ **IMPORTANT:** The generated key must be:
- At least 50 characters long
- NOT start with 'django-insecure-'
- Unique for your deployment

Copy the output and save it.

### 2. Create Production .env File
```bash
cp .env.example .env
```

### 3. Edit .env with Production Values
```env
DEBUG=False
SECRET_KEY=<paste-the-generated-key-here>
ALLOWED_HOSTS=your-domain.com,www.your-domain.com
CORS_ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
CSRF_TRUSTED_ORIGINS=https://your-domain.com,https://www.your-domain.com
CSRF_COOKIE_SECURE=True
SESSION_COOKIE_SECURE=True
SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000
LOG_LEVEL=INFO
DB_NAME=scholarx_prod
DB_USER=prod_user
DB_PASSWORD=<strong-password>
DB_HOST=your-db-host
DB_PORT=5432
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=<app-password>
DEFAULT_FROM_EMAIL=noreply@your-domain.com
FRONTEND_URL=https://your-domain.com
FRONTEND_BASE_URL=https://your-domain.com
GEMINI_API_KEY=<your-key>
```

---

## Deployment Steps

### Step 1: Security Check
```bash
cd webapp/backend
python manage.py check --deploy
```
✅ Fix any warnings before proceeding

### Step 2: Collect Static Files
```bash
python manage.py collectstatic --noinput
```

### Step 3: Run Migrations
```bash
python manage.py migrate
```

### Step 4: Install Production Server
```bash
pip install gunicorn
```

### Step 5: Start Application
```bash
gunicorn scholarx_backend.wsgi:application --bind 0.0.0.0:8000 --workers 4
```

### Step 6: Configure Web Server (Nginx)
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        alias /path/to/scholarx/webapp/backend/staticfiles/;
    }
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### Step 7: Set Up HTTPS
Use Let's Encrypt:
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d your-domain.com -d www.your-domain.com
```

---

## Post-Deployment Tests

- [ ] Visit https://your-domain.com - should load
- [ ] Test login at /login.html
- [ ] Test registration
- [ ] Check browser console for errors
- [ ] Verify HTTPS certificate is valid
- [ ] Test API endpoints
- [ ] Check logs: `tail -f webapp/backend/django.log`

---

## Critical Security Checks

✅ **Before Going Live:**

1. **DEBUG is False**
   ```bash
   grep "DEBUG=" .env
   # Should show: DEBUG=False
   ```

2. **SECRET_KEY is unique**
   ```bash
   grep "SECRET_KEY=" .env
   # Should NOT match the default key
   ```

3. **CORS is restricted**
   ```bash
   grep "CORS_ALLOW_ALL_ORIGINS=" .env
   # Should show: CORS_ALLOW_ALL_ORIGINS=False
   ```

4. **Cookies are secure**
   ```bash
   grep "COOKIE_SECURE=" .env
   # Should show: CSRF_COOKIE_SECURE=True, SESSION_COOKIE_SECURE=True
   ```

5. **HTTPS is enabled**
   - Check browser shows 🔒 lock icon
   - No mixed content warnings

---

## Troubleshooting

### 500 Error
```bash
# Check logs
tail -f webapp/backend/django.log

# Common causes:
# - Database connection failed
# - Missing environment variables
# - Static files not collected
```

### CORS Error
```bash
# Verify CORS_ALLOWED_ORIGINS includes your domain
grep "CORS_ALLOWED_ORIGINS=" .env

# Should include: https://your-domain.com
```

### 401 Unauthorized
```bash
# Check cookies are being sent
# In browser DevTools > Network > Headers
# Should see: Cookie: sessionid=...

# Verify CSRF_COOKIE_HTTPONLY=True
grep "CSRF_COOKIE_HTTPONLY=" .env
```

### Static Files Not Loading
```bash
# Recollect static files
python manage.py collectstatic --clear --noinput

# Check nginx config points to correct path
grep "alias" /etc/nginx/sites-enabled/your-domain.conf
```

---

## Rollback Plan

If something goes wrong:

```bash
# 1. Restore previous .env
git checkout .env

# 2. Restart application
systemctl restart scholarx

# 3. Check logs
tail -f webapp/backend/django.log

# 4. Fix issues and redeploy
```

---

## Monitoring

### Check Application Status
```bash
curl https://your-domain.com/api/auth/profile/
# Should return 401 if not logged in (expected)
```

### View Logs
```bash
# Real-time logs
tail -f webapp/backend/django.log

# Last 100 lines
tail -100 webapp/backend/django.log

# Search for errors
grep ERROR webapp/backend/django.log
```

### Database Status
```bash
psql -h your-db-host -U prod_user -d scholarx_prod
# Should connect successfully
```

---

## Important Files

| File | Purpose |
|------|---------|
| `.env` | Production environment variables |
| `DEPLOYMENT_GUIDE.md` | Detailed deployment guide |
| `SECURITY_CHANGES_SUMMARY.md` | All security changes made |
| `webapp/backend/django.log` | Application logs |
| `webapp/backend/staticfiles/` | Static files (CSS, JS, images) |

---

## Support

- **Django Docs:** https://docs.djangoproject.com/en/4.2/
- **Gunicorn Docs:** https://gunicorn.org/
- **Nginx Docs:** https://nginx.org/en/docs/
- **Let's Encrypt:** https://letsencrypt.org/

---

**Ready to Deploy!** ✅

Once all checks pass, your application is ready for production.

**Last Updated:** November 21, 2025
