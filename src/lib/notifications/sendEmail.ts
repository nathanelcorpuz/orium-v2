import { formatCentavos } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/forecastLabels";
import type { DueTodayItem } from "./dueTodayForecast";

// Resend's plain REST API, called directly via fetch - deliberately no
// `resend` npm package (CLAUDE.md: "No new dependencies without asking").
// RESEND_API_KEY lives only in .env.local/Vercel's env settings, never
// committed. NOTIFICATION_FROM_EMAIL defaults to Resend's own shared test
// sender (works with zero setup, no domain verification) - swap it for a
// verified address on your own domain once you have one, no code change
// needed.
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Orium <onboarding@resend.dev>";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmailHtml(items: DueTodayItem[], currency: string, dateStr: string): string {
  const rows = items
    .map((item) => {
      const label = TYPE_LABEL[item.type as keyof typeof TYPE_LABEL] ?? item.type;
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #E9E9E7;">${escapeHtml(item.name)}
          <span style="color:#999;font-size:12px;text-transform:capitalize;"> - ${escapeHtml(label)}</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #E9E9E7;text-align:right;white-space:nowrap;">
          ${escapeHtml(formatCentavos(item.amount, currency))}
        </td>
      </tr>`;
    })
    .join("");

  return `<div style="font-family:Inter,Arial,sans-serif;color:#37352F;max-width:480px;margin:0 auto;">
    <h1 style="font-size:18px;">Due today - ${escapeHtml(dateStr)}</h1>
    <p style="color:#666;font-size:14px;">${items.length} transaction${items.length === 1 ? "" : "s"} forecasted for today.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>
    <p style="margin-top:16px;font-size:12px;color:#999;">
      Change when you receive this in Orium's Settings page.
    </p>
  </div>`;
}

export async function sendDueTodayEmail(
  toEmail: string,
  items: DueTodayItem[],
  currency: string,
  dateStr: string,
): Promise<{ error: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "RESEND_API_KEY is not set." };

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.NOTIFICATION_FROM_EMAIL || DEFAULT_FROM,
      to: [toEmail],
      subject: `Orium: ${items.length} transaction${items.length === 1 ? "" : "s"} due today`,
      html: renderEmailHtml(items, currency, dateStr),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { error: `Resend API error (${response.status}): ${body}` };
  }
  return { error: null };
}
