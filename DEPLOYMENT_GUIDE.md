# SCHOLARX Deployment Guide

## Pre-Deployment Checklist

### ✅ Security Fixes Applied

1. **Environment Variables Configuration**
   - `SECRET_KEY` now uses environment variable
   - `DEBUG` mode controlled by environment
   - `ALLOWED_HOSTS` configurable via environment
   - All sensitive data moved to `.env` file

2. **CORS Security**
   - `CORS_ALLOW_ALL_ORIGINS` now defaults to `False`
   - Specific origins must be configured via environment variables
   - CSRF protection enabled

3. **Cookie Security**
   - `CSRF_COOKIE_HTTPONLY = True` (prevents XSS token theft)
   - `SESSION_COOKIE_HTTPONLY = True` (prevents XSS session theft)
   - `CSRF_COOKIE_SECURE` and `SESSION_COOKIE_SECURE` set based on DEBUG mode
   - `CSRF_COOKIE_SAMESITE = 'Strict'` in production, `'Lax'` in development

4. **Logging Security**
   - Log level now controlled by `LOG_LEVEL` environment variable
   - Defaults to `INFO` (no sensitive DEBUG logs in production)

5. **Frontend Security**
   - Removed hardcoded API URLs
   - Dynamic API URL detection based on hostname
   - Authentication tokens now stored in httpOnly cookies (not localStorage)
   - Removed localStorage-based token storage

---

## Deployment Steps

### 1. Create Production `.env` File

Copy `.env.example` to `.env` and fill in production values:

```bash
cp .env.example .env
```

Edit `.env` with your production values:

```env
# Django Settings
DEBUG=False
SECRET_KEY=your-very-long-random-secret-key-here
ALLOWED_HOSTS=your-domain.com,www.your-domain.com

# CORS Settings
CORS_ALLOW_ALL_ORIGINS=False
CORS_ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
CSRF_TRUSTED_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Cookie Security
CSRF_COOKIE_SECURE=True
SESSION_COOKIE_SECURE=True

# Logging
LOG_LEVEL=INFO

# Database (use production database)
DB_NAME=scholarx_prod
DB_USER=prod_user
DB_PASSWORD=strong-password-here
DB_HOST=your-db-host.com
DB_PORT=5432

# Email Configuration
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
DEFAULT_FROM_EMAIL=noreply@your-domain.com

# Frontend URLs
FRONTEND_URL=https://your-domain.com
FRONTEND_BASE_URL=https://your-domain.com

# Gemini API
GEMINI_API_KEY=your-gemini-api-key
```

### 2. Generate a Secure SECRET_KEY

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Use the output as your `SECRET_KEY` in `.env`.

### 3. Run Django Security Check

```bash
python manage.py check --deploy
```

Fix any warnings that appear.

### 4. Collect Static Files

```bash
python manage.py collectstatic --noinput
```

### 5. Run Database Migrations

```bash
python manage.py migrate
```

### 6. Set Up HTTPS

- Use Let's Encrypt (free SSL certificates)
- Configure your web server (Nginx/Apache) to redirect HTTP to HTTPS
- Update `CSRF_COOKIE_SECURE` and `SESSION_COOKIE_SECURE` to `True`

### 7. Configure Web Server

**Nginx Example:**
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

    location /media/ {
        alias /path/to/scholarx/webapp/backend/media/;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### 8. Use Production WSGI Server

Replace Django's development server with Gunicorn:

```bash
pip install gunicorn
gunicorn scholarx_backend.wsgi:application --bind 0.0.0.0:8000 --workers 4
```

Or use systemd service for auto-restart.

---

## Additional Security Recommendations

### 1. Add Rate Limiting

Install `django-ratelimit`:
```bash
pip install django-ratelimit
```

Add to views:
```python
from django_ratelimit.decorators import ratelimit

@ratelimit(key='ip', rate='5/m', method='POST')
def login(request):
    ...
```

### 2. Enable HSTS (HTTP Strict Transport Security)

Add to `settings.py`:
```python
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
```

### 3. Set Security Headers

Add to `settings.py`:
```python
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_SECURITY_POLICY = {
    "default-src": ("'self'",),
    "script-src": ("'self'", "'unsafe-inline'"),
    "style-src": ("'self'", "'unsafe-inline'"),
}
```

### 4. Database Backups

Set up automated daily backups:
```bash
# Daily backup script
pg_dump -U $DB_USER $DB_NAME > /backups/scholarx_$(date +%Y%m%d).sql
```

### 5. Monitor Logs

Set up log aggregation (ELK Stack, Datadog, etc.) to monitor for:
- Failed login attempts
- Database errors
- API errors
- Security warnings

### 6. Update Dependencies

Regularly update packages:
```bash
pip install --upgrade -r requirements.txt
```

---

## Monitoring & Maintenance

### Health Checks

Create a health check endpoint:
```python
@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({'status': 'ok'})
```

### Database Optimization

Run periodically:
```bash
python manage.py dbshell
VACUUM ANALYZE;
```

### Log Rotation

Configure logrotate for `django.log`:
```
/path/to/django.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
}
```

---

## Troubleshooting

### CORS Errors

Check that your frontend domain is in `CORS_ALLOWED_ORIGINS`:
```python
# In .env
CORS_ALLOWED_ORIGINS=https://your-domain.com
```

### 401 Unauthorized Errors

- Ensure cookies are being sent with `credentials: 'include'` in fetch calls
- Check that `CSRF_COOKIE_HTTPONLY` is `True`
- Verify session cookie is being set by backend

### Static Files Not Loading

```bash
python manage.py collectstatic --clear --noinput
```

### Database Connection Issues

Test connection:
```bash
psql -h $DB_HOST -U $DB_USER -d $DB_NAME
```

---

## Rollback Plan

If deployment fails:

1. Keep previous version running
2. Revert `.env` to previous settings
3. Restart application server
4. Check logs for errors
5. Fix issues and redeploy

---

## Performance Optimization

### 1. Enable Caching

Install Redis:
```bash
pip install django-redis
```

Add to `settings.py`:
```python
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6379/1',
    }
}
```

### 2. Database Query Optimization

Use `select_related()` and `prefetch_related()` in views to reduce N+1 queries.

### 3. CDN for Static Files

Use CloudFlare or AWS CloudFront for static file delivery.

---

## Support & Documentation

- Django Deployment: https://docs.djangoproject.com/en/4.2/howto/deployment/
- Security: https://docs.djangoproject.com/en/4.2/topics/security/
- CORS: https://github.com/adamchainz/django-cors-headers

---

**Last Updated:** November 21, 2025
**Version:** 1.0
