import type { Member } from "./trip-data";

const MEMBER_COLORS = ["#ef6a54", "#f0a14a", "#5178b8", "#7d68ad", "#3f8f83", "#bf6682", "#4f8390", "#9a703b"];

export function createTripMember(members: Member[], inputName: string, id: string): Member {
  const name = inputName.trim();
  if (!name || name.length > 24) throw new Error("請輸入 1 至 24 字的團友姓名");
  const key = (value: string) => value.normalize("NFKC").trim().toLowerCase();
  if (members.some((member) => key(member.name) === key(name))) throw new Error("已有同名團友，請加入稱呼以便分辨");
  if (!id || members.some((member) => member.id === id)) throw new Error("未能建立團友，請再試一次");
  return { id, name, label: "同行", color: MEMBER_COLORS[members.length % MEMBER_COLORS.length], isLeader: false };
}
