import Image from "next/image";

export function StartupSplash() {
  return (
    <div
      role="status"
      aria-label="Loading Race Predictor"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        backgroundColor: "#000000",
      }}
    >
      <Image
        src="/racepredictor-app-icon-512.png"
        alt=""
        width={512}
        height={512}
        priority
        unoptimized
        style={{ display: "block", width: "min(62.5vmin, 480px)", height: "auto" }}
      />
    </div>
  );
}
