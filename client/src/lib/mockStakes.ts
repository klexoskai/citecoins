const STORAGE_KEY = "citechain.mockTopicStakes";

type StakeMap = Record<string, number>;

function readStakeMap(): StakeMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StakeMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeStakeMap(map: StakeMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getTopicStake(topicId: string): number {
  const map = readStakeMap();
  return map[topicId] ?? 0;
}

export function addTopicStake(topicId: string, amount = 1): number {
  const map = readStakeMap();
  const next = (map[topicId] ?? 0) + amount;
  map[topicId] = next;
  writeStakeMap(map);
  return next;
}
