import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 53682);
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET before running this script.");
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPES.join(" "));
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, REDIRECT_URI);
  if (requestUrl.pathname !== "/oauth2callback") {
    res.writeHead(404).end("Not found");
    return;
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Missing OAuth code.");
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) throw new Error(await tokenResponse.text());
    const token = await tokenResponse.json();

    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Refresh token created successfully! You can close this tab and return to the terminal.");

    const refreshToken = token.refresh_token;
    if (refreshToken) {
      const currentKey = process.env.OPENROUTER_API_KEY || "your_openrouter_api_key_here";
      const envContent = [
        `GMAIL_CLIENT_ID=${clientId}`,
        `GMAIL_CLIENT_SECRET=${clientSecret}`,
        `GMAIL_REFRESH_TOKEN=${refreshToken}`,
        `OPENROUTER_API_KEY=${currentKey}`,
        `OPENROUTER_MODEL=google/gemini-2.5-flash-lite`,
        `GMAIL_BACKFILL=true`,
        `GMAIL_RESET_DATA=false`,
        ""
      ].join("\n");
      const fsSync = await import("node:fs");
      fsSync.writeFileSync(".env", envContent);
      console.log("\n✅ Successfully generated and saved GMAIL_REFRESH_TOKEN to .env!");
      console.log(`GMAIL_REFRESH_TOKEN=${refreshToken}`);
    } else {
      console.log("\n⚠️ No refresh token returned. (Google only returns it the first time you consent).");
      console.log("Tip: Remove the app from https://myaccount.google.com/permissions and retry.");
    }
    server.close();
  } catch (error) {
    res.writeHead(500).end("Token exchange failed. Check the terminal.");
    console.error(error);
    server.close(() => process.exit(1));
  }
});

server.listen(PORT, () => {
  console.log(`OAuth callback listening at ${REDIRECT_URI}`);
  console.log("\nOpen this URL and approve Gmail read-only access:\n");
  console.log(authUrl.toString());
});
