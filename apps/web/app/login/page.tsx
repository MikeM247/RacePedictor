import { signIn } from "../../auth.ts";
import styles from "./sign-in.module.css";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="sign-in-heading">
        <p className={styles.eyebrow}>Race Predictor</p>
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
