# Tokly Backend

## Run

```bash
npm install
npm run dev
```

Server runs at `http://localhost:8000` by default.

## ngrok (expose local server)

Use [ngrok](https://ngrok.com) to expose the backend to the internet (e.g. for Clerk webhooks).

1. **Sign up** at [ngrok.com](https://ngrok.com) and get your [authtoken](https://dashboard.ngrok.com/get-started/your-authtoken).

2. **Configure ngrok** (once):
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

3. **Start the backend**, then in another terminal run:
   ```bash
   ngrok http 8000
   ```

   ngrok will print a public URL (e.g. `https://abc123.ngrok-free.app`). Use that URL in Clerk Dashboard for the webhook endpoint: `https://YOUR_NGROK_URL/webhooks/clerk`.

   **Note:** The URL changes each time you restart ngrok unless you use a reserved domain (paid).
