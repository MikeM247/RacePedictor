import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PGlite } from "@electric-sql/pglite";
import {
  readLocalImages,
  withLocalImages,
  writeLocalImages,
  readLocalImageAsset,
  putLocalImageAsset,
  readCloudImages,
  writeCloudImages,
  putCloudImageAsset,
  readCloudImageAsset,
  ImageRevisionConflict,
  type ImageSql,
} from "../../../packages/db/src/milestone-images.ts";
import { emptyImageState } from "../../../packages/core/src/contracts/milestone-images.ts";
import { normalizeMilestoneImage } from "../lib/server/milestone-images.ts";
import { nextRunningSession, savedTrainingTimezone } from "../lib/server/home-training.ts";
import {
  syncMilestoneImages,
  type ImageManifest,
  type ImageSyncClient,
} from "../../../packages/db/src/local-milestone-image-sync.ts";
import { assignEntryImage } from "../../../packages/core/src/services/milestone-images.ts";
test("local image reads do not create tables; CAS, asset ownership and saved records survive reload", () => {
  const file = path.join(
    mkdtempSync(path.join(tmpdir(), "milestone-images-")),
    "local.sqlite",
  );
  assert.equal(readLocalImages(file, "a").revision, 0);
  assert.equal(readLocalImageAsset(file, "a", "a".repeat(64)), null);
  withLocalImages(file, (db) => {
    writeLocalImages(db, "a", 0, emptyImageState());
    putLocalImageAsset(db, "a", {
      id: "a".repeat(64),
      bytes: Buffer.from("image"),
      width: 66,
      height: 66,
    });
    assert.throws(
      () => writeLocalImages(db, "a", 0, emptyImageState()),
      ImageRevisionConflict,
    );
  });
  assert.equal(readLocalImages(file, "a").revision, 1);
  assert.equal(readLocalImages(file, "b").revision, 0);
  assert.equal(readLocalImageAsset(file, "b", "a".repeat(64)), null);
  assert.equal(readLocalImageAsset(file, "a", "a".repeat(64))?.width, 66);
});
test("PostgreSQL image migration, CAS, foreign keys and byte ownership", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE TABLE athletes(id TEXT PRIMARY KEY); INSERT INTO athletes VALUES ('a'),('b');",
    );
    await db.exec(
      readFileSync(
        new URL(
          "../../../packages/db/prisma/migrations/20261031090000_milestone_images/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const sql: ImageSql = {
      $queryRawUnsafe: async <T>(q: string, ...values: unknown[]) =>
        (await db.query(q, values)).rows as T,
      $executeRawUnsafe: async (q: string, ...values: unknown[]) =>
        (await db.query(q, values)).affectedRows ?? 0,
    };
    assert.equal((await readCloudImages("a", sql)).revision, 0);
    await writeCloudImages("a", 0, emptyImageState(), sql);
    await assert.rejects(
      writeCloudImages("a", 0, emptyImageState(), sql),
      ImageRevisionConflict,
    );
    assert.equal((await readCloudImages("b", sql)).revision, 0);
    await assert.rejects(
      writeCloudImages("foreign", 0, emptyImageState(), sql),
    );
    const image = {
      id: "b".repeat(64),
      bytes: Buffer.from("image"),
      width: 66,
      height: 66,
    };
    await putCloudImageAsset("a", image, sql);
    assert.equal((await readCloudImageAsset("a", image.id, sql))?.width, 66);
    assert.equal(await readCloudImageAsset("b", image.id, sql), null);
  } finally {
    await db.close();
  }
});
test("upload processing checks bytes/dimensions and strips metadata into bounded transparent WebP", async () => {
  const input = await sharp({
    create: {
      width: 1200,
      height: 600,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  const asset = await normalizeMilestoneImage(input);
  assert.equal(asset.width, 512);
  assert.equal(asset.height, 256);
  assert.equal(asset.id.length, 64);
  const metadata = await sharp(asset.bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.hasAlpha, true);
  assert.equal(metadata.exif, undefined);
  await assert.rejects(normalizeMilestoneImage(Buffer.from("<svg></svg>")));
  await assert.rejects(
    normalizeMilestoneImage(Buffer.alloc(5 * 1024 * 1024 + 1)),
  );
  const small = await sharp({
    create: { width: 63, height: 64, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await assert.rejects(normalizeMilestoneImage(small));
});
test("next session uses effective dates and skips rest/skipped sessions; stable ordering", () => {
  const session = (
    id: string,
    kind: "run" | "rest",
    date: string,
    status: "upcoming" | "skipped" = "upcoming",
  ) => ({
    id,
    title: id,
    kind,
    effectiveDate: date,
    status,
    durationMinutes: 40,
  });
  const result = nextRunningSession(
    [
      session("rest", "rest", "2026-10-30"),
      session("past", "run", "2026-10-29"),
      session("skipped", "run", "2026-10-30", "skipped"),
      session("second", "run", "2026-11-02"),
      session("first", "run", "2026-10-31"),
    ],
    "2026-10-30",
  );
  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.equal(result.item.id, "first");
});
test("paired sync publishes pending choices, rejects concurrent state, and preserves pending writes on failure", async () => {
  const file = path.join(
      mkdtempSync(path.join(tmpdir(), "image-sync-")),
      "sync.sqlite",
    ),
    source = { kind: "target" as const, id: "race" };
  let remote: ImageManifest = { revision: 0, state: emptyImageState() };
  const client: ImageSyncClient = {
    getMilestoneImages: async () => structuredClone(remote),
    getMilestoneImageAsset: async () => {
      throw new Error("no asset");
    },
    putMilestoneImageAsset: async () => {},
    putMilestoneImages: async (input) => {
      throw new Error(String(input));
    },
  };
  client.putMilestoneImages = async (_token, change) => {
    assert.equal(change.expectedRevision, remote.revision);
    remote = { revision: remote.revision + 1, state: change.state };
    return structuredClone(remote);
  };
  withLocalImages(file, (db) =>
    writeLocalImages(
      db,
      "a",
      0,
      assignEntryImage(emptyImageState(), [source], {
        kind: "catalogue",
        id: "oldies",
      }),
      { cloudRevision: 0, pending: true },
    ),
  );
  assert.equal(
    (
      await syncMilestoneImages({
        databasePath: file,
        athleteId: "a",
        client,
        token: "test-token",
      })
    ).status,
    "current",
  );
  assert.equal(readLocalImages(file, "a").pending, false);
  let local = readLocalImages(file, "a");
  withLocalImages(file, (db) =>
    writeLocalImages(
      db,
      "a",
      local.revision,
      assignEntryImage(local.state, [source], {
        kind: "catalogue",
        id: "comrades",
      }),
      { cloudRevision: remote.revision, pending: true },
    ),
  );
  remote = {
    revision: remote.revision + 1,
    state: assignEntryImage(remote.state, [source], {
      kind: "catalogue",
      id: "best-of-the-best",
    }),
  };
  assert.equal(
    (
      await syncMilestoneImages({
        databasePath: file,
        athleteId: "a",
        client,
        token: "test-token",
      })
    ).status,
    "conflict",
  );
  local = readLocalImages(file, "a");
  assert.ok(local.remoteState);
  assert.equal(local.pending, true);
  withLocalImages(file, (db) =>
    writeLocalImages(db, "a", local.revision, local.state, {
      cloudRevision: remote.revision,
      pending: true,
    }),
  );
  client.putMilestoneImages = async () => {
    throw new Error("network lost");
  };
  await assert.rejects(
    syncMilestoneImages({
      databasePath: file,
      athleteId: "a",
      client,
      token: "test-token",
    }),
  );
  assert.equal(readLocalImages(file, "a").pending, true);
});

test("local training summaries select the latest eligible run and survive missing activity data independently", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { readHomeTraining } = await import("../lib/server/home-training.ts");
  const file = path.join(
    mkdtempSync(path.join(tmpdir(), "home-training-")),
    "local.sqlite",
  );
  const before = {
    database: process.env.RACEPREDICTOR_DATABASE_PATH,
    athlete: process.env.RACEPREDICTOR_ATHLETE_ID,
  };
  process.env.RACEPREDICTOR_DATABASE_PATH = file;
  process.env.RACEPREDICTOR_ATHLETE_ID = "a";
  try {
    const missing = await readHomeTraining(
      { mode: "local", actor: null },
      new Date("2026-10-30T12:00:00Z"),
    );
    assert.equal(missing.lastRun.status, "unavailable");
    assert.equal(missing.nextSession.status, "empty");
    const db = new DatabaseSync(file);
    db.exec(
      "CREATE TABLE activities(id TEXT,athlete_id TEXT,title TEXT,occurred_at TEXT,distance_m REAL,elapsed_time_s INTEGER,sport TEXT,deleted_at TEXT)",
    );
    const insert = db.prepare("INSERT INTO activities VALUES(?,?,?,?,?,?,?,?)");
    for (const [id, athlete, date, sport, deleted] of [
      ["older", "a", "2026-10-29T07:00:00Z", "run", null],
      ["latest", "a", "2026-10-30T06:00:00Z", "trail_run", null],
      ["future", "a", "2026-11-01T06:00:00Z", "run", null],
      ["foreign", "b", "2026-10-30T10:00:00Z", "run", null],
      ["deleted", "a", "2026-10-30T11:00:00Z", "run", "removed"],
      ["non-run", "a", "2026-10-30T11:30:00Z", "other", null],
    ])
      insert.run(id, athlete, id, date, 5100, 2358, sport, deleted);
    db.close();
    const result = await readHomeTraining(
      { mode: "local", actor: null },
      new Date("2026-10-30T12:00:00Z"),
    );
    assert.equal(result.lastRun.status, "ready");
    if (result.lastRun.status === "ready")
      assert.equal(result.lastRun.item.id, "latest");
    assert.equal(result.nextSession.status, "empty");
  } finally {
    if (before.database === undefined)
      delete process.env.RACEPREDICTOR_DATABASE_PATH;
    else process.env.RACEPREDICTOR_DATABASE_PATH = before.database;
    if (before.athlete === undefined)
      delete process.env.RACEPREDICTOR_ATHLETE_ID;
    else process.env.RACEPREDICTOR_ATHLETE_ID = before.athlete;
  }
});

test("cloud staging verifies ownership and checksum, normalizes bytes and finalizes idempotently without assigning a milestone", async () => {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const { createHash } = await import("node:crypto");
  const { buildActorContext } = await import(
    "../../../packages/core/src/contracts/auth.ts"
  );
  const { initiateImageUpload, finalizeImageUpload, imageUploadDependencies } =
    await import("../lib/server/milestone-image-uploads.ts");
  const png = await sharp({
    create: {
      width: 96,
      height: 96,
      channels: 4,
      background: { r: 0, g: 120, b: 180, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const checksum = createHash("sha256").update(png).digest("hex");
  type Upload = {
    id: string;
    athleteId: string;
    storageKey: string;
    byteSize: number;
    checksum: string;
    expiresAt: Date;
    assetId?: string;
  };
  let row: Upload | null = null,
    stored: Awaited<ReturnType<typeof normalizeMilestoneImage>> | null = null;
  let deletions = 0;
  const database = {
    milestoneImageUpload: {
      create: async ({ data }: { data: Upload }) => {
        row = data;
        return data;
      },
      findFirst: async ({
        where,
      }: {
        where: { id: string; athleteId: string };
      }) =>
        row?.id === where.id && row.athleteId === where.athleteId ? row : null,
      update: async ({ data }: { data: { assetId: string } }) => {
        row!.assetId = data.assetId;
        return row;
      },
    },
  };
  const client = new S3Client({
    region: "auto",
    endpoint: "https://r2.example.invalid",
    credentials: {
      accessKeyId: "synthetic-key",
      secretAccessKey: "synthetic-secret",
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  Object.defineProperty(client, "send", {
    value: async (command: { constructor: { name: string } }) => {
      switch (command.constructor.name) {
        case "HeadObjectCommand":
          return {
            ContentLength: png.length,
            Metadata: {
              "athlete-id": "a",
              "upload-id": row!.id,
              sha256: checksum,
            },
          };
        case "GetObjectCommand":
          return {
            Body: (async function* () {
              yield png;
            })(),
          };
        case "DeleteObjectCommand":
          deletions++;
          return {};
        default:
          throw new Error("Unexpected storage request");
      }
    },
  });
  const dependencies = {
    database: () =>
      database as unknown as ReturnType<
        typeof imageUploadDependencies.database
      >,
    staging: () => ({ bucket: "private-test-bucket", client }),
    store: async (
      _security: Parameters<typeof imageUploadDependencies.store>[0],
      asset: Awaited<ReturnType<typeof normalizeMilestoneImage>>,
    ) => {
      stored = asset;
    },
    read: async () => stored,
  };
  const security = {
    mode: "authenticated" as const,
    actor: buildActorContext({
      userId: "owner",
      permittedAthleteIds: ["a"],
      activeAthleteId: "a",
      requestId: "request",
      credentialKind: "session",
    }),
  };
  const upload = await initiateImageUpload(
    security,
    { byteSize: png.length, checksum, contentType: "image/png" },
    dependencies,
  );
  assert.equal(upload.mode, "cloud");
  if (upload.mode !== "cloud") throw new Error("Cloud staging required");
  assert.equal(
    new URL(upload.url).hostname,
    "private-test-bucket.r2.example.invalid",
  );
  assert.equal(stored, null);
  const complete = await finalizeImageUpload(security, upload.id, dependencies);
  assert.equal(complete.width, 96);
  assert.ok(stored);
  assert.equal(deletions, 1);
  await finalizeImageUpload(security, upload.id, dependencies);
  assert.equal(deletions, 1);
  const foreign = {
    ...security,
    actor: buildActorContext({
      userId: "other",
      permittedAthleteIds: ["b"],
      activeAthleteId: "b",
      requestId: "other-request",
      credentialKind: "session",
    }),
  };
  await assert.rejects(finalizeImageUpload(foreign, upload.id, dependencies), {
    status: 404,
  });
});

test('image edits reject stale timeline membership even after a remove/restore cycle preserves the entry ID',async()=>{
 const {saveLocalRaceHistory}=await import('../lib/server/race-history.ts');const {readMilestones,mutateMilestones}=await import('../lib/server/milestone-timeline.ts');const {readImages,saveImages}=await import('../lib/server/milestone-images.ts');
 const file=path.join(mkdtempSync(path.join(tmpdir(),'image-membership-')),'local.sqlite');const previous={database:process.env.RACEPREDICTOR_DATABASE_PATH,athlete:process.env.RACEPREDICTOR_ATHLETE_ID};process.env.RACEPREDICTOR_DATABASE_PATH=file;process.env.RACEPREDICTOR_ATHLETE_ID='a';
 try{saveLocalRaceHistory(file,'a',{record:{id:'pb',title:'Saved PB',confirmedBy:'user',achievement:'personal_best'},expectedRevision:0});const security={mode:'local' as const,actor:null};const initial=await readImages(security);const saved=await saveImages(security,{entryId:'achievement:pb',expectedRevision:initial.revision,sourceVersion:initial.sourceVersion,choice:{kind:'catalogue',id:'oldies'}});const view=await readMilestones(security);const removed=await mutateMilestones(security,{operation:'remove',entryId:'achievement:pb',expectedRevision:view.revision,sourceVersion:view.sourceVersion});const restored=await mutateMilestones(security,{operation:'restore',entryId:removed.removed[0].id,expectedRevision:removed.revision,sourceVersion:removed.sourceVersion});assert.equal(restored.entries[0].id,'achievement:pb');await assert.rejects(saveImages(security,{entryId:'achievement:pb',expectedRevision:saved.revision,sourceVersion:saved.sourceVersion,choice:{kind:'catalogue',id:'comrades'}}),{status:409});const latest=await readImages(security);assert.notEqual(latest.sourceVersion,saved.sourceVersion);assert.equal(latest.state.bindings[0].choice?.id,'oldies');}
 finally{if(previous.database===undefined)delete process.env.RACEPREDICTOR_DATABASE_PATH;else process.env.RACEPREDICTOR_DATABASE_PATH=previous.database;if(previous.athlete===undefined)delete process.env.RACEPREDICTOR_ATHLETE_ID;else process.env.RACEPREDICTOR_ATHLETE_ID=previous.athlete;}
});

test("training dates use saved timezone even without an active plan and remain unknown when sources fail", async () => {
  const history = async () => [{timezone:"America/Los_Angeles"}];
  assert.equal(await savedTrainingTimezone({status:"fulfilled",value:null}, history), "America/Los_Angeles");
  assert.equal(await savedTrainingTimezone({status:"rejected",reason:new Error("offline")}, history), "America/Los_Angeles");
  assert.equal(await savedTrainingTimezone({status:"fulfilled",value:{timezone:"Pacific/Auckland"}}, history), "Pacific/Auckland");
  assert.equal(await savedTrainingTimezone({status:"fulfilled",value:null}, async()=>[]), null);
  assert.equal(await savedTrainingTimezone({status:"rejected",reason:new Error("offline")}, async()=>{throw new Error("offline")}), null);
});
