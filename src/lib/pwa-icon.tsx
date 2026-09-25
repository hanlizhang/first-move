import { ImageResponse } from "next/og";

export function pwaIcon(size: number): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#312e81",
      }}
    >
      <div
        style={{
          width: "64%",
          height: "64%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: size * 0.13,
          background: "#f7f4ee",
          color: "#312e81",
          fontSize: size * 0.37,
          fontWeight: 800,
          letterSpacing: -size * 0.035,
        }}
      >
        1<span style={{ color: "#d97706", marginLeft: size * 0.01 }}>→</span>
      </div>
    </div>,
    { width: size, height: size },
  );
}
