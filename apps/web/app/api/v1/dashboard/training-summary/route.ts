import { DatabaseSync } from "node:sqlite";
import { withSensitiveRoute } from "../../_security.ts";
import { withCoachingService, success } from "../../coaching/_shared.ts";
import { raceHistoryActor } from "../../../../../lib/server/race-history.ts";
import { getCloudPrismaClient } from "../../../../../../../packages/db/src/cloud/prisma-client.js";
import { getActivities } from "../../../../../lib/local-activities-data-source.ts";
import { localDateInTimezone } from "../../../../../lib/coaching-ui-state.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withSensitiveRoute(async (security, request) => {
  const params = new URL(request.url).searchParams;
  const today = params.get("date");
  const requestedZone = params.get("timezone") ?? "Africa/Johannesburg";
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return Response.json({ error: { code: "VALIDATION_ERROR", message: "A local date is required" } }, { status: 400 });
  if (security.mode === "authenticated") {
    const athleteId = raceHistoryActor(security);
    const prisma = getCloudPrismaClient();
    const projection = await prisma.trainingPlanProjection.findFirst({ where: { athleteId, active: true }, orderBy: { planVersion: "desc" }, select: { plan: true } });
    const plan = projection?.plan as any;
    const planTimezone = plan?.timezone ?? requestedZone;
    const projected = await prisma.calendarSessionProjection.findMany({ where: { athleteId, planId: plan?.id, status: "upcoming" }, select: { sessionId: true, effectiveSession: true } });
    const nextRow = projected.map((row:any)=>({id:row.sessionId,...row.effectiveSession})).filter((x:any)=>x.kind==="run"&&x.date>=today).sort((a:any,b:any)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)))[0];
    const next = nextRow;
    const rows = await prisma.activity.findMany({ where:{athleteId,deletedAt:null,sport:{in:["run","trail_run","treadmill_run"]},occurredAt:{lte:new Date()}},orderBy:[{occurredAt:"desc"},{id:"desc"}],take:1,select:{id:true,title:true,sport:true,occurredAt:true,distanceM:true,elapsedTimeS:true} });
    const a=rows[0];
    return success({timezone:planTimezone,lastRun:a?{status:"ready",id:a.id,title:a.title??"Morning run",date:localDateInTimezone(planTimezone,a.occurredAt),detail:`${(Number(a.distanceM)/1000).toFixed(1)} km · ${Math.floor(a.elapsedTimeS/60)}:${String(a.elapsedTimeS%60).padStart(2,"0")}`}:{status:"empty"},nextSession:next?{status:"ready",id:next.id,title:next.title, date:next.date,detail:[next.durationMinutes?`${next.durationMinutes} min`:null,next.effort??null].filter(Boolean).join(" · ")}:{status:"empty"}});
  }
  return withCoachingService(service=>{
    const db=new DatabaseSync(service.databasePath,{readOnly:true}); let activity:any=null;
    try{activity=db.prepare("SELECT id,title,sport,occurred_at,distance_m,elapsed_time_s FROM activities WHERE athlete_id=? AND deleted_at IS NULL AND sport IN ('run','trail_run','treadmill_run') AND occurred_at<=? ORDER BY occurred_at DESC,id DESC LIMIT 1").get(service.athleteId,new Date().toISOString())}finally{db.close()}
    const sessions=service.listActiveCalendar().filter((x:any)=>x.kind==="run"&&x.effectiveDate>=today&&x.status!=="skipped").sort((a:any,b:any)=>a.effectiveDate.localeCompare(b.effectiveDate)||String(a.startTime??"").localeCompare(String(b.startTime??""))||a.id.localeCompare(b.id));
    const a=activity;const zone=service.getActivePlan()?.timezone??service.loadProfile()?.timezone??requestedZone;const next=sessions[0];
    return {timezone:zone,lastRun:a?{status:"ready",id:a.id,title:a.title??"Morning run",date:localDateInTimezone(zone,new Date(a.occurred_at)),detail:`${(a.distance_m/1000).toFixed(1)} km · ${Math.floor(a.elapsed_time_s/60)}:${String(a.elapsed_time_s%60).padStart(2,"0")}`}:{status:"empty"},nextSession:next?{status:"ready",id:next.id,title:next.title,date:next.effectiveDate,detail:[next.durationMinutes?`${next.durationMinutes} min`:null,next.purpose].filter(Boolean).join(" · ")}:{status:"empty"}};
  });
},{cloudHandling:"actor-scoped"});
