"use client";

import Image from "next/image";
import styles from "./startup-splash.module.css";

export function StartupSplash() {
  return (
    <div
      role="status"
      aria-label="Loading Race Predictor"
      className={styles.splash}
    >
      <Image
        src="/road-to-comrades-v2.webp"
        alt=""
        fill
        sizes="100vw"
        preload
        unoptimized
        className={styles.image}
        onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
      />
    </div>
  );
}
