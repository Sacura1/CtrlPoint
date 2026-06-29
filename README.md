# CtrlPoint

CtrlPoint is a web hosting service, it builds and deploys web apps to Massa DeWeb. The platform supports browser-based builds, file uploads, GitHub deploys, and an agent API for x402-paid deployments.

## Project Layout

- `client` - web app frontend
- `server` - API, deployment worker, billing, auth, and agent endpoints
- `ctrlpoint-app` - React Native mobile app
- `packages` - shared or published packages

## Local Development

Install dependencies in the app you are working on:

```bash
cd client
npm install
```

```bash
cd server
npm install
```

Run the frontend:

```bash
cd client
npm run dev
```

Run the backend:

```bash
cd server
npm run dev
```

## Build Checks

```bash
cd client
npm run build
```

```bash
cd server
npm run build
```

## Notes

Secrets belong in environment variables, not in Git. Generated local scripts, private notes, mobile build artifacts, and native splash outputs are intentionally ignored.
