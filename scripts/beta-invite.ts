/**
 * Invites a beta tester (Clerk Access mode is invite-only), with the
 * invitation's redirect pointed at the live app's own /sign-up — something
 * the Clerk dashboard can't do (dashboard invites carry no redirect and go
 * through Clerk's hosted sign-up page instead).
 *
 *   npm run beta:invite -- someone@example.com            # send an invite
 *   npm run beta:invite -- someone@example.com --resend   # revoke pending + send a fresh one
 *
 * Uses CLERK_SECRET_KEY from .env.local; the app URL defaults to the live
 * site, override with ELOCU_APP_URL. Clerk emails the invitation.
 */
import { loadEnvConfig } from "@next/env";
import { createClerkClient } from "@clerk/backend";

loadEnvConfig(process.cwd());

async function main() {
  const email = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const resend = process.argv.includes("--resend");
  if (!email || !email.includes("@")) {
    console.error("Usage: npm run beta:invite -- <email> [--resend]");
    process.exit(1);
  }
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error("CLERK_SECRET_KEY is not set.");
    process.exit(1);
  }
  const appUrl = (process.env.ELOCU_APP_URL || "https://elocu-six.vercel.app").replace(/\/$/, "");
  const clerk = createClerkClient({ secretKey });

  const existingUser = (await clerk.users.getUserList({ emailAddress: [email] })).data[0];
  if (existingUser) {
    console.log(`${email} already has an account — nothing to send.`);
    process.exit(0);
  }

  const pending = (await clerk.invitations.getInvitationList({ limit: 100, status: "pending" })).data.filter(
    (i) => i.emailAddress.toLowerCase() === email.toLowerCase()
  );
  if (pending.length > 0 && !resend) {
    console.log(`${email} already has a pending invitation (sent ${new Date(pending[0].createdAt).toISOString()}). Use --resend to revoke it and send a fresh one.`);
    process.exit(0);
  }
  // Clerk has no "resend": revoke the pending one (its link stops working)
  // and issue a new invitation, which emails again.
  for (const inv of pending) await clerk.invitations.revokeInvitation(inv.id);

  const inv = await clerk.invitations.createInvitation({ emailAddress: email, notify: true, redirectUrl: `${appUrl}/sign-up` });
  console.log(
    `${pending.length > 0 ? `Revoked ${pending.length} pending invitation(s) and sent` : "Sent"} a new invitation to ${inv.emailAddress} (${inv.status}) → ${appUrl}/sign-up`
  );
  if (pending.length > 0) console.log("Tell them to use the newest email — the earlier link no longer works.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
