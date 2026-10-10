import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const alt = "Bekvor: know where your music appears commercially";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The link preview (WhatsApp, LinkedIn, Slack): the name, the promise, the product's verdicts. */
export default function OpenGraphImage() {
  const chip = (label: string, color: string, bg: string) => (
    <div style={{ display: "flex", padding: "12px 24px", borderRadius: 999, fontSize: 28, fontWeight: 600, color, background: bg }}>{label}</div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f4f4f6", color: "#1a1a1d" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 14, background: "#1a1a1d", color: "#f4f4f6", fontSize: 24, fontWeight: 700 }}>{BRAND.mark}</div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>{BRAND.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 80, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>Know where your music appears commercially.</div>
          <div style={{ display: "flex", fontSize: 32, color: "#5b5b63" }}>Paid TikTok posts, matched to your songs and checked against your licences.</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {chip("Cleared", "#1a7f4b", "#dff3e8")}
          {chip("Needs review", "#0b6bcb", "#dbeafe")}
          {chip("Potential mismatch", "#c4281c", "#fde2e0")}
        </div>
      </div>
    ),
    { ...size },
  );
}
