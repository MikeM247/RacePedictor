import { signIn } from "../../auth.ts";
import styles from "./sign-in.module.css";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="sign-in-heading">
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">RP</span>
          <p className={styles.eyebrow}><strong>Race Predictor</strong><span>Night Ops · Owner access</span></p>
        </div>
        <h1 id="sign-in-heading">Your training dashboard, online</h1>
        <p className={styles.intro}>
          Sign in with the owner GitHub account to view synced workouts and Second Brain status.
        </p>
        <form action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/dashboard" });
        }}>
          <button className={styles.button} type="submit">Continue with GitHub</button>
        </form>
        <p className={styles.note}>Only the configured owner account is accepted.</p>
      </section>
    </main>
  );
}
