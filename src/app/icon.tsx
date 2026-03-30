import { ImageResponse } from "next/og";

export const size = {
  height: 512,
  width: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "linear-gradient(135deg, #0f172a 0%, #164e63 55%, #f59e0b 100%)",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "rgba(255,255,255,0.14)",
            border: "20px solid rgba(255,255,255,0.24)",
            borderRadius: 120,
            color: "white",
            display: "flex",
            fontSize: 220,
            fontWeight: 700,
            height: 360,
            justifyContent: "center",
            width: 360,
          }}
        >
          F
        </div>
      </div>
    ),
    size,
  );
}
