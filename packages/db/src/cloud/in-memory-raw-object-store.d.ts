import type { AthleteScope } from "../../../core/src/contracts/auth.ts";
import type { RawObjectMetadata, RawObjectStore } from "../../../core/src/ports/cloud-sync.ts";

export interface InMemoryRawObjectStoreOptions {
  now?: () => Date;
}

export class InMemoryRawObjectStore implements RawObjectStore {
  constructor(options?: InMemoryRawObjectStoreOptions);
  put(scope: AthleteScope, input: { metadata: RawObjectMetadata; body: Uint8Array }): Promise<RawObjectMetadata>;
  head(scope: AthleteScope, key: string): Promise<RawObjectMetadata | null>;
  createPresignedGet(scope: AthleteScope, input: { key: string; expiresInSeconds: number }): Promise<string>;
  readImmutableForReplay(scope: AthleteScope, key: string): Promise<Uint8Array | null>;
}

export function rawObjectKeyPrefix(athleteId: string, provider: string): string;
