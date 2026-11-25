# Android beta signups

The "Download for Android" buttons on blackoutmaps.com open a form that asks for an email. `website/api/beta-signup.js` stores each address as a private blob under `beta/` in the `blackout-maps-guides` Blob store. Nothing under `beta/` is publicly readable. Testers are added by hand to the closed-test email list in the Play Console. After signing up, people see the opt-in link <https://play.google.com/apps/testing/app.blackoutmaps>.

The route ignores repeat addresses, allows 5 requests per IP per hour, and drops submissions that fill the hidden `website` field.

## Export the list

The export needs the `BETA_EXPORT_TOKEN` environment variable. You can see its value in the Vercel dashboard: project **blackout-maps** → **Settings** → **Environment Variables** → `BETA_EXPORT_TOKEN` → reveal. Don't share the token or commit it.

```bash
# CSV with a header: email,signed_up_at (UTC)
curl -H "Authorization: Bearer $BETA_EXPORT_TOKEN" https://blackoutmaps.com/api/beta-export -o android-beta.csv

# One email per line, no header, ready to paste into the Play Console list
curl -H "Authorization: Bearer $BETA_EXPORT_TOKEN" "https://blackoutmaps.com/api/beta-export?only=emails"
```

In a browser you can open `https://blackoutmaps.com/api/beta-export?token=<token>` instead. The URL then holds the token, so it ends up in your browser history.

To remove an address:

```bash
curl -X DELETE -H "Authorization: Bearer $BETA_EXPORT_TOKEN" "https://blackoutmaps.com/api/beta-export?email=someone@example.com"
```

To change the token, edit `BETA_EXPORT_TOKEN` in the dashboard and redeploy production.
