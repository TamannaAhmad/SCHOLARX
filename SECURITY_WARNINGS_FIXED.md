# Security Warnings Fixed

## Overview
All Django security warnings from `python manage.py check --deploy` have been resolved.

---

## Warning 1: SECURE_HSTS_SECONDS Not Set ✅ FIXED

### Issue
```
?: (security.W004) You have not set a value for the SECURE_HSTS_SECONDS setting. 
If your entire site is served only over SSL, you may want to consider setting a value 
and enabling HTTP Strict Transport Security.
```

### Fix Applied
**File:** `webapp/backend/scholarx_backend/settings.py` (line 172)

```python
SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '31536000' if not DEBUG else '0'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
```

### What It Does
- **HSTS (HTTP Strict Transport Security):** Forces browsers to always use HTTPS
- **31536000 seconds:** 1 year - tells browsers to remember this for 1 year
- **INCLUDE_SUBDOMAINS:** Applies to all subdomains
- **PRELOAD:** Allows inclusion in browser HSTS preload lists

### Configuration
Add to `.env`:
```env
SECURE_HSTS_SECONDS=31536000
```

---

## Warning 2: SECURE_SSL_REDIRECT Not Set ✅ FIXED

### Issue
```
?: (security.W008) Your SECURE_SSL_REDIRECT setting is not set to True. 
Unless your site should be available over both SSL and non-SSL connections, 
you may want to either set this setting True or configure a load balancer 
or reverse-proxy server to redirect all connections to HTTPS.
```

### Fix Applied
**File:** `webapp/backend/scholarx_backend/settings.py` (line 171)

```python
SECURE_SSL_REDIRECT = not DEBUG  # Redirect all HTTP to HTTPS in production
```

### What It Does
- **In Production (DEBUG=False):** Automatically redirects all HTTP requests to HTTPS
- **In Development (DEBUG=True):** Disabled to allow local testing over HTTP

### How It Works
When enabled, Django middleware intercepts all HTTP requests and redirects them to HTTPS:
```
http://your-domain.com/page → https://your-domain.com/page
```

---

## Warning 3: SECRET_KEY Not Secure ✅ FIXED

### Issue
```
?: (security.W009) Your SECRET_KEY has less than 50 characters, less than 5 unique 
characters, or it's prefixed with 'django-insecure-' indicating that it was generated 
automatically by Django. Please generate a long and random value, otherwise many of 
Django's security-critical features will be vulnerable to attack.
```

### Fix Applied
**File:** `webapp/backend/scholarx_backend/settings.py` (lines 90-103)

```python
# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        # Use a default insecure key only for development
        SECRET_KEY = 'django-insecure-s#w-t29xt*2*w1cp7&c%t1v3rv6qcf2jco@=v4gj@$me4*ng5h'
    else:
        raise ValueError('SECRET_KEY environment variable is required in production')

# Validate SECRET_KEY in production
if not DEBUG and (len(SECRET_KEY) < 50 or 'django-insecure' in SECRET_KEY):
    raise ValueError('SECRET_KEY must be at least 50 characters and not use django-insecure prefix in production')
```

### What It Does
1. **Requires environment variable in production:** Forces explicit configuration
2. **Validates length:** Ensures at least 50 characters
3. **Prevents insecure prefix:** Rejects 'django-insecure-' keys
4. **Development fallback:** Uses default key only in DEBUG mode
5. **Fails fast:** Raises error at startup if requirements not met

### How to Generate a Secure SECRET_KEY

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Example output:
```
'j-w$o_=5$3z@h!0$6^l$5&v#9*j@l$5&v#9*j@l$5&v#9*j@l$5&v#9*j@l$5&v#'
```

### Configuration
Add to `.env`:
```env
SECRET_KEY=<paste-the-generated-key-here>
```

**Requirements:**
- ✅ At least 50 characters
- ✅ Unique for your deployment
- ✅ Does NOT start with 'django-insecure-'
- ✅ Highly random

---

## Summary of Changes

| Setting | Before | After | Impact |
|---------|--------|-------|--------|
| `SECURE_HSTS_SECONDS` | Not set (warning) | 31536000 (1 year) | 🔐 Forces HTTPS |
| `SECURE_SSL_REDIRECT` | Not set (warning) | True in production | 🔐 Redirects HTTP→HTTPS |
| `SECRET_KEY` | Default insecure key | Environment variable + validation | 🔐 Secure key required |

---

## Testing the Fixes

### 1. Run Django Security Check
```bash
cd webapp/backend
python manage.py check --deploy
```

Expected output:
```
System check identified no issues (0 silenced).
```

### 2. Verify HSTS Headers
```bash
curl -I https://your-domain.com
```

Look for:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### 3. Verify SSL Redirect
```bash
curl -I http://your-domain.com
```

Should redirect to HTTPS:
```
HTTP/1.1 301 Moved Permanently
Location: https://your-domain.com/
```

### 4. Verify SECRET_KEY
```bash
# Try starting without SECRET_KEY
unset SECRET_KEY
python manage.py runserver
```

Should fail with:
```
ValueError: SECRET_KEY environment variable is required in production
```

---

## Production Deployment Checklist

Before deploying to production:

- [ ] Generated a new SECRET_KEY using the command above
- [ ] SECRET_KEY is at least 50 characters
- [ ] SECRET_KEY does NOT contain 'django-insecure-'
- [ ] Added SECRET_KEY to `.env` file
- [ ] Set `DEBUG=False` in `.env`
- [ ] Set `SECURE_SSL_REDIRECT=True` in `.env`
- [ ] Set `SECURE_HSTS_SECONDS=31536000` in `.env`
- [ ] HTTPS certificate is installed and valid
- [ ] Web server (Nginx/Apache) is configured
- [ ] Ran `python manage.py check --deploy` and all checks pass
- [ ] Tested HSTS headers are being sent
- [ ] Tested HTTP→HTTPS redirect works

---

## Important Notes

### HSTS Preload
If you want to add your domain to the HSTS preload list:
1. Visit https://hstspreload.org/
2. Enter your domain
3. Follow the requirements (HSTS header with preload flag)
4. Submit for inclusion

### SSL Certificate
- Use Let's Encrypt for free certificates
- Configure auto-renewal
- Ensure certificate covers all domains in ALLOWED_HOSTS

### Nginx Configuration
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Django will handle HSTS headers
    # But you can also add them here for extra security
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## References

- [Django Security Documentation](https://docs.djangoproject.com/en/4.2/topics/security/)
- [HSTS Explained](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
- [HSTS Preload List](https://hstspreload.org/)
- [Django Deployment Checklist](https://docs.djangoproject.com/en/4.2/howto/deployment/checklist/)

---

**Status:** ✅ ALL SECURITY WARNINGS FIXED  
**Last Updated:** November 22, 2025
