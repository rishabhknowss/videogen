import db from "@/prisma/db";
import { Account } from "@prisma/client";

export async function refreshGoogleToken(account: Account): Promise<Account | null> {
  if (!account.refresh_token) {
    console.error("No refresh token available for account", account.id);
    return null;
  }

  try {
    // Google OAuth token endpoint
    const tokenEndpoint = "https://oauth2.googleapis.com/token";

    // Get client credentials from environment variables
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("Google OAuth client credentials missing");
      return null;
    }

    // Prepare request for token refresh
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Failed to refresh token:", errorData);
      return null;
    }

    const data = await response.json();

    // Calculate new expiry time
    const expiresAt = Math.floor(Date.now() / 1000 + data.expires_in);

    // Update the account with the new tokens
    const updatedAccount = await db.account.update({
      where: {
        id: account.id,
      },
      data: {
        access_token: data.access_token,
        expires_at: expiresAt,
        token_type: data.token_type,
      },
    });

    return updatedAccount;
  } catch (error) {
    console.error("Error refreshing Google token:", error);
    return null;
  }
}