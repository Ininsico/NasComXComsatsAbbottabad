import { config } from '../config.js';

/**
 * Transactional email through Brevo, in one place so invitations and alerts send the same
 * way. Returns { sent, error } rather than throwing: an unreachable email provider must not
 * fail the action that triggered it — an invitation is still valid without its email.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!config.brevo.configured) {
    return { sent: false, error: 'Brevo is not configured on this server' };
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': config.brevo.apiKey,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: config.brevo.senderEmail, name: config.brevo.senderName },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const body = (await response.text().catch(() => '')).slice(0, 200);
      return { sent: false, error: `${response.status} ${body}`.trim() };
    }

    return { sent: true };
  } catch (error) {
    return { sent: false, error: error.message };
  }
}

/** The invitation email: what workspace, what access, and the link that starts the account. */
export function invitationEmail({ workspaceName, level, roleName, link, invitedBy }) {
  const access = roleName ? `${level}, role “${roleName}”` : level;

  const text = [
    `${invitedBy} invited you to ${workspaceName} on the NasCom CRM.`,
    '',
    `Your access: ${access}.`,
    '',
    `Open this link to create your account: ${link}`,
    '',
    'If you did not expect this, ignore this email — the link expires in seven days.',
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#0f172a">
      <p>${invitedBy} invited you to <strong>${workspaceName}</strong> on the NasCom CRM.</p>
      <p>Your access: <strong>${access}</strong>.</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">
          Create your account
        </a>
      </p>
      <p style="color:#475569;font-size:13px">Or paste this into your browser:<br />${link}</p>
      <p style="color:#475569;font-size:13px">
        If you did not expect this, ignore this email — the link expires in seven days.
      </p>
    </div>
  `;

  return { subject: `${invitedBy} invited you to ${workspaceName}`, text, html };
}
