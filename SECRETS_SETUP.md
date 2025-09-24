# Secrets Configuration Setup

This document explains how to set up the secrets configuration for the SCHOLARX scheduling algorithm.

## Quick Setup

1. **Copy the example secrets file:**
   ```bash
   cp secrets.example.py secrets.py
   ```

2. **Edit `secrets.py` with your actual values:**
   - Replace `https://your-project.supabase.co` with your Supabase URL
   - Replace `your_supabase_service_key_here` with your actual Supabase service key
   - Update other database credentials as needed

3. **The `secrets.py` file is automatically ignored by git** (see `.gitignore`)

## Security Notes

- ✅ **DO NOT** commit `secrets.py` to version control
- ✅ **DO** commit `secrets.example.py` as a template
- ✅ **DO** commit `.gitignore` to ensure secrets are ignored
- ✅ **DO** use environment variables in production

## Usage Examples

### Basic Usage
```python
from schedule import create_matcher_from_secrets

# Create a matcher using Supabase (default)
matcher = create_matcher_from_secrets('supabase')

# Or create using PostgreSQL
matcher = create_matcher_from_secrets('postgresql')

# Or create using SQLAlchemy
matcher = create_matcher_from_secrets('sqlalchemy')
```

### Manual Configuration
```python
from schedule import DatabaseConfig, EnhancedWebScheduleMatcher

# Using secrets directly
config = DatabaseConfig.create_config_from_secrets('supabase')
matcher = EnhancedWebScheduleMatcher(config)
```

### Testing
```python
# Run the test function
python schedule.py
```

## Environment Variables (Alternative)

For production deployments, you can also use environment variables instead of the secrets file:

```python
import os

# In your code, you can check for environment variables
SUPABASE_URL = os.getenv('SUPABASE_URL', 'fallback_url')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY', 'fallback_key')
```

## File Structure

```
SCHOLARX/
├── schedule.py              # Main application code
├── secrets.py              # Your actual secrets (ignored by git)
├── secrets.example.py      # Template for secrets (committed to git)
├── .gitignore              # Ensures secrets.py is ignored
└── SECRETS_SETUP.md        # This documentation
```

## Troubleshooting

### Error: "secrets.py not found"
- Make sure you've copied `secrets.example.py` to `secrets.py`
- Check that `secrets.py` is in the same directory as `schedule.py`

### Error: "Supabase URL and service key not found"
- Verify that your `secrets.py` file contains the correct values
- Make sure the variable names match exactly (case-sensitive)

### Error: "PostgreSQL credentials not found"
- Ensure all PostgreSQL variables are set in `secrets.py`
- Check that the database server is running and accessible
