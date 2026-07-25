// Realtime channel naming.
//
// supabase-js keys channels by topic. If two mounted components subscribe to
// the SAME topic string — e.g. Account and Messages both opening an "inbox"
// channel, or a screen remounting before its old channel is torn down — the
// second subscribe collides with the first and can take the app down.
//
// Every channel created inside an effect must therefore get a unique topic.
// Callers still remove their own channel on unmount, so nothing leaks.
let seq = 0;

/** A collision-proof channel topic, e.g. `inbox:7:1784977…`. */
export function liveChannel(prefix: string): string {
  seq += 1;
  return `${prefix}:${seq}:${Date.now()}`;
}
