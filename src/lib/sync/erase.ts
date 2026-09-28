import { useAppStore } from "@/lib/store";
import { startSync, stopSync } from "./engine.ts";
import { clearPairs } from "./identity.ts";
import { clearQueue } from "./queue.ts";
import { eraseEverything } from "./repository.ts";

/**
 * Erase a signed-in reader's data from their account and from this device.
 *
 * The privacy page has always promised this — "erasing removes it from your
 * account and from this device" — and the account page only ever did the
 * second half. `eraseEverything` existed and nothing called it, so a reader who
 * erased everything watched it all come back on the next pull.
 *
 * The order matters:
 *
 *  1. **Stop syncing and drop the queue.** A pending write is data the reader
 *     has just asked to be rid of, and a flush mid-erase would put a book back.
 *  2. **Erase the account.** If this fails nothing local has been touched yet,
 *     so the reader is left exactly where they were and can try again — never
 *     with a device wiped and an account still full.
 *  3. **Erase the device**, and forget which local book was which remote one.
 *  4. **Resume syncing**, so the empty state is what both sides agree on.
 */
export async function eraseAccountAndDevice(userId: string): Promise<void> {
  stopSync();
  clearQueue();
  try {
    await eraseEverything(userId);
  } catch (error) {
    void startSync(userId);
    throw error;
  }
  clearPairs();
  useAppStore.getState().clearData();
  void startSync(userId);
}
