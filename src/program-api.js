import { auth, rpc } from "./store.js";

export const cueKinds = {
  chronicle: "Chronique",
  opening: "Prise d’antenne",
  transition: "Transition",
  closing: "Remise d’antenne",
  music: "Musique",
  jingle: "Jingle",
};

const recentKey = "radioscribe.recent-programs";
export function recentPrograms() {
  return JSON.parse(localStorage.getItem(recentKey) || "[]");
}

export async function readProgram(id) {
  await auth();
  const program = await rpc("program_read", { p_show: id });
  if (!program)
    throw Error(
      "Cette émission est accessible par un code de groupe ou un lien de gestion.",
    );
  const entry = { id, title: program.title, manager: program.manager };
  const recent = recentPrograms();
  if (JSON.stringify(recent[0]) !== JSON.stringify(entry)) {
    localStorage.setItem(
      recentKey,
      JSON.stringify(
        [entry, ...recent.filter((item) => item.id !== id)].slice(0, 12),
      ),
    );
  }
  return program;
}

export async function createProgram(title, count, animated) {
  await auth();
  return rpc("program_create", {
    p_title: title,
    p_count: count,
    p_animated: animated,
  });
}

export async function claimProgram(invitation) {
  const [id, key, extra] = invitation.split(".");
  const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
  if (extra || !uuid.test(id) || !uuid.test(key))
    throw Error("Le lien de gestion est incomplet.");
  await auth();
  if (!(await rpc("program_claim", { p_show: id, p_key: key })))
    throw Error("Ce lien de gestion est invalide.");
  return id;
}
