// Dev aid: prints the context packet Chiron would send for a session's next question.
//   npx tsx --conditions=react-server scripts/print-packet.ts <sessionId> "your question"
import { targetFor } from "../src/lib/depth";
import { getProfile, getSession } from "../src/lib/store";
import { buildChironPacket } from "../src/lib/tutor/packet";

async function main() {
  const [id, question = "Why is that zero?"] = process.argv.slice(2);
  const session = await getSession(id);
  if (!session) throw new Error(`no session ${id}`);
  const profile = (await getProfile(session.profileId))!;
  const target = targetFor(session, profile);
  const parts = await buildChironPacket({ session, profile, target, question });
  for (const p of parts) console.log(p.type === "text" ? p.text : `[image ${p.mediaType}, ${Math.round(p.base64.length / 1024)} KB base64]`);
}

void main();
