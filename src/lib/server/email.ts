/** Transactional email through Resend. One function, one template style. */
const FROM = process.env.AUTH_EMAIL_FROM || "Manuscript Editor <editor@sourcelibrary.org>";
/** Where links in emails point. APP_URL when set (production); otherwise the
 *  host the request came in on, so preview deployments link to themselves. */
export function siteUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "albert-book.vercel.app";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function sendEmail(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { id: string };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function letter(opts: { heading: string; lines: string[]; cta: { label: string; url: string }; footer?: string }) {
  const html = `
<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; color: #1a1a1a; line-height: 1.55;">
  <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 16px;">${esc(opts.heading)}</h1>
  ${opts.lines.map((l) => `<p style="margin: 0 0 14px; font-size: 16px;">${esc(l)}</p>`).join("")}
  <p style="margin: 24px 0;"><a href="${opts.cta.url}" style="display: inline-block; background: #18181b; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-size: 15px;">${esc(opts.cta.label)}</a></p>
  <p style="margin: 0 0 8px; font-size: 13px; color: #71717a;">Or paste this link into your browser:<br><span style="word-break: break-all;">${esc(opts.cta.url)}</span></p>
  ${opts.footer ? `<p style="margin: 24px 0 0; font-size: 13px; color: #71717a;">${esc(opts.footer)}</p>` : ""}
</div>`;
  const text = [opts.heading, "", ...opts.lines, "", `${opts.cta.label}: ${opts.cta.url}`, "", opts.footer || ""].join("\n");
  return { html, text };
}
