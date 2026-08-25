import http from "node:http";
import { URL } from "node:url";
import fsSync from "node:fs";
import { execSync } from "node:child_process";

// Auto-load local .env file if present
if (fsSync.existsSync(".env")) {
  const envContent = fsSync.readFileSync(".env", "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const PORT = Number(process.env.PORT || 53682);
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env before running this script.");
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

    res.writeHead(200, { "content-type": "text/html" });
    res.end("<h2>Refresh token created successfully!</h2><p>You can close this tab and return to the terminal.</p>");

    const refreshToken = token.refresh_token;
    if (refreshToken) {
      // Update .env file preserving all existing keys
      let envContent = fsSync.existsSync(".env") ? fsSync.readFileSync(".env", "utf8") : "";
      if (/^GMAIL_REFRESH_TOKEN=.*$/m.test(envContent)) {
        envContent = envContent.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, `GMAIL_REFRESH_TOKEN=${refreshToken}`);
      } else {
        envContent = envContent.trim() + `\nGMAIL_REFRESH_TOKEN=${refreshToken}\n`;
      }
      fsSync.writeFileSync(".env", envContent);

      console.log("\n=======================================================");
      console.log("✅ Successfully generated new GMAIL_REFRESH_TOKEN!");
      console.log("=======================================================");
      console.log(`GMAIL_REFRESH_TOKEN=${refreshToken}`);
      console.log("Updated local .env file.");

      // Attempt to automatically update GitHub Secrets
      try {
        execSync(`gh secret set GMAIL_REFRESH_TOKEN --body "${refreshToken}"`, { stdio: "pipe" });
        console.log("✅ Successfully updated GMAIL_REFRESH_TOKEN in GitHub Repository Secrets!");
      } catch (ghErr) {
        console.log("ℹ️ To update GitHub Secret manually, run:");
        console.log(`gh secret set GMAIL_REFRESH_TOKEN --body "${refreshToken}"`);
      }

      console.log("\n💡 IMPORTANT PERMANENT FIX FOR 7-DAY EXPIRATION:");
      console.log("If your Google Cloud OAuth app is in 'Testing' mode, refresh tokens expire every 7 days.");
      console.log("To make it permanent:");
      console.log("1. Go to https://console.cloud.google.com/apis/credentials/consent");
      console.log("2. Under 'Publishing status', click 'PUBLISH APP'.");
      console.log("=======================================================\n");
    } else {
      console.log("\n⚠️ No refresh token returned. (Google only returns it when prompt=consent is used).");
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
  console.log(`\nOAuth callback server listening at ${REDIRECT_URI}`);
  console.log("=======================================================");
  console.log("👉 Click or open this URL in your browser to authorize:");
  console.log("=======================================================");
  console.log(authUrl.toString());
  console.log("=======================================================\n");
});
