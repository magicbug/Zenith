# Zenith Settings Sync Backend

Backend API for syncing Zenith Satellite Tracker settings across devices.

## Features

- Magic link authentication (passwordless)
- API key-based authentication
- Settings synchronization
- Rate limiting
- API key revocation
- Contact permission management

## Installation

1. **Database Setup**
   ```bash
   mysql -u root -p < db_schema.sql
   ```

2. **Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your database and AWS SES credentials
   ```

3. **Dependencies** (Optional - for AWS SES)
   ```bash
   composer install
   ```

4. **Permissions**
   ```bash
   chmod 755 sync/
   chmod 644 sync/*.php
   mkdir -p logs
   chmod 755 logs
   ```

5. **Web Server Configuration**
   - Point your web server to the `sync/` directory
   - Ensure PHP 7.4+ is installed
   - Enable mod_rewrite for .htaccess

## Configuration

Edit `.env` file with your settings:

- Database connection details
- AWS SES credentials (for sending magic link emails)
- Application URLs
- Security settings (rate limits, token expiry)
- Admin key (optional)

## API Endpoints

### Public Endpoints

- `GET /health.php` - Health check
- `POST /api/request_magic_link.php` - Request magic link
- `GET /verify.php?token=...` - Verify magic link (web UI)

### Authenticated Endpoints (require API key)

- `GET /api/get_settings.php` - Get user settings
- `POST /api/save_settings.php` - Save user settings
- `POST /api/revoke_api_key.php` - Revoke API key
- `POST /api/regenerate_api_key.php` - Regenerate API key
- `POST /api/update_contact_preference.php` - Update contact preference
- `POST /api/delete_account.php` - Delete account

### Admin Endpoints

- `POST /api/admin/revoke_user_key.php` - Revoke any user's API key

## Cron Jobs

Set up these cron jobs for maintenance:

```bash
# Cleanup expired magic links (daily)
0 2 * * * php /path/to/sync/cleanup.php

# Cleanup old rate limit records (weekly)
0 3 * * 0 php /path/to/sync/cleanup_rate_limits.php

# Cleanup old settings records (weekly) - keeps last 10 versions per user
0 4 * * 0 php /path/to/sync/cleanup_old_settings.php
```

**Note:** The `save_settings.php` endpoint now automatically keeps only the last 10 versions per user when saving, so manual cleanup is optional but recommended for existing data.

## Security

- All API keys are hashed using `password_hash()`
- Magic links expire after 15 minutes
- Rate limiting prevents abuse
- HTTPS required in production
- Input validation and sanitization on all endpoints
- SQL injection prevention via prepared statements
- XSS prevention via output escaping

## Testing

Set `TEST_MODE=true` in `.env` to:
- Skip AWS SES email sending (logs instead)
- Bypass rate limiting
- Enable debug logging

## AWS SES Setup

### IAM Permissions

The IAM user used for AWS SES must have permission to send emails. Create or update an IAM policy with the following:

**Option 1: Specific Identity (Recommended)**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail",
                "ses:SendRawEmail"
            ],
            "Resource": "arn:aws:ses:us-east-1:290279375955:identity/zenithtracker.org"
        }
    ]
}
```

**Option 2: All Identities (Less Secure)**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail",
                "ses:SendRawEmail"
            ],
            "Resource": "*"
        }
    ]
}
```

**Note:** The code uses `ses:SendEmail`, so you **must** include `ses:SendEmail` in your policy. If you only have `ses:SendRawEmail`, add `ses:SendEmail` to fix the AccessDenied error.

**Steps to fix "AccessDenied" error:**
1. Go to AWS IAM Console → Users → `magicbug-geo`
2. Click "Add permissions" → "Create inline policy"
3. Use JSON editor and paste one of the policies above
4. Replace `us-east-1` with your SES region if different
5. Replace `290279375955` with your AWS account ID
6. Replace `zenithtracker.org` with your verified SES identity
7. Save the policy

### SES Identity Verification

Ensure your sending domain/email is verified in AWS SES:
1. Go to AWS SES Console → Verified identities
2. Verify `zenithtracker.org` (or your sending domain)
3. If in SES Sandbox, verify recipient email addresses too

## Troubleshooting

- Check `logs/errors.log` for error messages
- Verify database connection in `config.php`
- Ensure AWS SES credentials are correct
- **AWS AccessDenied errors**: Check IAM permissions (see AWS SES Setup above)
- Check file permissions on `logs/` directory

## License

See main Zenith project license.
