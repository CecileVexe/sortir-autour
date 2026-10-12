import { ImageResponse } from "next/og";

/** Home-screen icon (iOS): the logo on a square background, rendered as PNG at build time. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10.5" fill="none" stroke="#a9c4b0" stroke-width="1.4"/><circle cx="16" cy="16" r="6" fill="none" stroke="#a9c4b0" stroke-width="1.4"/><rect x="9" y="14" width="14" height="4" rx="1" fill="#f2c230"/></svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1f3d2e" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={150} height={150} />
      </div>
    ),
    size,
  );
}
