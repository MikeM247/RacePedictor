import Link from "next/link";

export function TrainingTools() {
  return <section className="coach-panel supporting-management" aria-label="Training tools">
    <h2>Training tools</h2>
    <nav aria-label="Supporting management">
      <Link className="text-link" href="/dashboard/plan">Goal and plan management →</Link>
      <Link className="text-link" href="/dashboard/activities">Activity history and import →</Link>
      <Link className="text-link" href="/dashboard/data-quality">Data quality and recovery →</Link>
    </nav>
  </section>;
}
