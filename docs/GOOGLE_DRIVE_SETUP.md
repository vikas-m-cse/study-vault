# Google Drive integration setup

StudyVault uses the official Google Picker to let a user choose a Drive file from the Add Resource dialog. A selected file is saved as a link resource; StudyVault does not copy the file into its local storage. The file's existing Google Drive sharing permissions continue to apply.

## 1. Configure Google Cloud

Use one Google Cloud project for all three values:

1. Enable **Google Picker API** and **Google Drive API**.
2. Create an **API key**. Restrict it to websites and allow the deployed StudyVault origin and `https://docs.google.com/*`. Restrict API usage to Google Picker API (and Drive API if needed).
3. Create an **OAuth client ID** of type **Web application**. Add the exact public StudyVault origin under **Authorized JavaScript origins** (for example, `https://your-production-domain.vercel.app`) and add `http://localhost:5173` for local development.
4. Find the Google Cloud **project number**. This is the Picker App ID.
5. Configure the OAuth consent screen. While the app is in Testing, add the Google accounts that should be able to use the picker as test users. For wider public use, complete Google's consent-screen verification requirements as applicable.

Official guide: https://developers.google.com/workspace/drive/picker/guides/web-picker

## 2. Add Vercel environment variables

In Vercel → StudyVault project → Settings → Environment Variables, add these for **Production** and **Preview** as needed:

- `VITE_GOOGLE_PICKER_API_KEY` — the API key
- `VITE_GOOGLE_CLIENT_ID` — the OAuth web client ID
- `VITE_GOOGLE_APP_ID` — the numeric Google Cloud project number

Add the same values to a local `.env.local` file to test locally. Do not commit `.env.local`. These are browser-side values because the Picker runs in the browser; protect the API key with HTTP referrer and API restrictions. Never put an OAuth client secret in a `VITE_*` variable.

## 3. Redeploy and test

After saving the Vercel variables, trigger a fresh deployment. Open Add Resource → **Choose from Google Drive**, sign in, select a file, then save the resource. Test with a file whose permissions allow the signed-in account to open it.

If the app reports that Drive is not configured, verify the three environment variable names exactly and redeploy.
