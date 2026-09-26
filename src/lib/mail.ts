import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// Envio de e-mail por SMTP (opcional): redefinição de senha e digest diário.
// Configurado pelo admin com SMTP_*; sem SMTP_HOST, os recursos de e-mail ficam ocultos.

export type SmtpConfig = { host: string; port: number; secure: boolean; user?: string; pass?: string; from: string };

type Env = Record<string, string | undefined>;

export function readSmtpConfig(env: Env = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(env.SMTP_PORT) || 587;
  const user = env.SMTP_USER?.trim() || undefined;
  const from = env.SMTP_FROM?.trim() || user;
  if (!from) return null;
  return {
    host,
    port,
    // 465 = TLS direto; 587/25 = STARTTLS. SMTP_SECURE força um ou outro.
    secure: env.SMTP_SECURE ? ["1", "true", "yes"].includes(env.SMTP_SECURE.toLowerCase()) : port === 465,
    user,
    pass: env.SMTP_PASSWORD || undefined,
    from,
  };
}

export const isMailConfigured = () => readSmtpConfig() !== null;

let transport: { key: string; transporter: Transporter } | null = null;

function transporterFor(config: SmtpConfig) {
  const key = JSON.stringify(config);
  if (transport?.key !== key) {
    transport = {
      key,
      transporter: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user ? { user: config.user, pass: config.pass } : undefined,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
      }),
    };
  }
  return transport.transporter;
}

export async function sendMail(message: { to: string; subject: string; text: string; html: string }) {
  const config = readSmtpConfig();
  if (!config) throw new Error("SMTP não configurado.");
  await transporterFor(config).sendMail({ from: config.from, ...message });
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Layout simples e compatível com clientes de e-mail (estilos inline). */
export function emailLayout({ title, bodyHtml, footer }: { title: string; bodyHtml: string; footer?: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f7fafe;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a">
<div style="max-width:600px;margin:0 auto;padding:32px 20px">
<p style="margin:0 0 16px;font-weight:600;color:#1b3f63">openRSS</p>
<div style="background:#ffffff;border:1px solid #dbe3ee;border-radius:14px;padding:24px;line-height:1.55;font-size:15px">
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
${bodyHtml}
</div>
${footer ? `<p style="margin:16px 0 0;font-size:12px;color:#64748b">${escapeHtml(footer)}</p>` : ""}
</div></body></html>`;
}

export function buttonHtml(label: string, url: string) {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1b3f63;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">${escapeHtml(label)}</a></p>`;
}

export { escapeHtml };
