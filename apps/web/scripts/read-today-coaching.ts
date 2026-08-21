import { createLocalCoachingService } from "../lib/local-coaching-service.ts";

const service = createLocalCoachingService({
  athleteId: process.env.RACEPREDICTOR_ATHLETE_ID || "athlete_001",
});

try {
  console.log(JSON.stringify(service.buildTodayOverview(), null, 2));
} finally {
  service.close();
}
