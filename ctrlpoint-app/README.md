# CtrlPoint Mobile App

Expo React Native app for the existing CtrlPoint backend.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure the backend URL. On a physical device, use your machine LAN IP instead of `localhost`.

   ```bash
   cp .env.example .env
   ```

3. Start the app:

   ```bash
   npm run start
   ```

Google sign-in reads the Expo public Google client IDs from `.env`. The backend must have the same Google OAuth client configured with `GOOGLE_CLIENT_ID`.
