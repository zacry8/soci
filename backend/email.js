import { config } from "./config.js";

const RESEND_API_URL = "https://api.resend.com/emails";

function hasResendConfig() {
  return Boolean(config.resendApiKey && config.emailFrom);
}

function shouldSendEmail() {
  if (!config.emailEnabled) return false;
  return hasResendConfig();
}

export async function sendEmail({ to, subject, html, text }) {
  const recipient = String(to || "").trim().toLowerCase();
  if (!recipient) {
    return { ok: false, skipped: true, reason: "missing-recipient" };
  }

  if (!shouldSendEmail()) {
    const reason = config.emailEnabled ? "missing-config" : "email-disabled";
    return { ok: false, skipped: true, reason };
  }

  const payload = {
    from: config.emailFrom,
    to: [recipient],
    subject: String(subject || "Soci Notification"),
    html: String(html || ""),
    text: String(text || "")
  };

  if (config.emailReplyTo) {
    payload.reply_to = config.emailReplyTo;
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.resendApiKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[soci] resend delivery failed", {
        status: response.status,
        recipient,
        error: data?.message || data?.error || "Unknown Resend error"
      });
      return { ok: false, skipped: false, reason: "resend-error" };
    }

    return { ok: true, skipped: false, id: data?.id || "" };
  } catch (error) {
    console.error("[soci] resend request failed", {
      recipient,
      error: error?.message || String(error)
    });
    return { ok: false, skipped: false, reason: "network-error" };
  }
}

export function sendWelcomeEmail({ to, name, workspaceName }) {
  const safeName = String(name || "there").trim() || "there";
  const safeWorkspace = String(workspaceName || "your workspace").trim() || "your workspace";
  const subject = `Welcome to Soci, ${safeName}`;
  const text = `Welcome to Soci! Your workspace "${safeWorkspace}" is ready. Sign in at ${config.appBaseUrl}.`;
  const html = `<p>Welcome to <strong>Soci</strong>, ${safeName}.</p><p>Your workspace <strong>${safeWorkspace}</strong> is ready.</p><p>Sign in: <a href="${config.appBaseUrl}">${config.appBaseUrl}</a></p>`;
  return sendEmail({ to, subject, text, html });
}

export function sendUserInviteEmail({ to, name, inviterName, temporaryPassword }) {
  const safeName = String(name || "there").trim() || "there";
  const safeInviter = String(inviterName || "Your admin").trim() || "Your admin";
  const hasPassword = Boolean(temporaryPassword);
  const subject = "You were invited to Soci";
  const passwordLine = hasPassword
    ? `Temporary password: ${temporaryPassword}\nPlease change it after logging in.`
    : "Use your existing credentials to sign in.";
  const text = `${safeInviter} invited you to Soci, ${safeName}.\nSign in: ${config.appBaseUrl}\n${passwordLine}`;
  const html = `<p>${safeInviter} invited you to <strong>Soci</strong>, ${safeName}.</p><p>Sign in: <a href="${config.appBaseUrl}">${config.appBaseUrl}</a></p><p>${hasPassword ? `<strong>Temporary password:</strong> ${temporaryPassword}<br/>Please change it after logging in.` : "Use your existing credentials to sign in."}</p>`;
  return sendEmail({ to, subject, text, html });
}
