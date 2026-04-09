const STORAGE_KEY = "citechain.mockArticleStakes";

interface ArticleStakeEntry {
  total: number;
  mine: number;
}

type ArticleStakeMap = Record<string, ArticleStakeEntry>;

function readMap(): ArticleStakeMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ArticleStakeMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeMap(map: ArticleStakeMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getArticleStake(articleId: string): ArticleStakeEntry {
  const map = readMap();
  return map[articleId] ?? { total: 0, mine: 0 };
}

export function addArticleStake(articleId: string, amount = 1): ArticleStakeEntry {
  const map = readMap();
  const current = map[articleId] ?? { total: 0, mine: 0 };
  const next = { total: current.total + amount, mine: current.mine + amount };
  map[articleId] = next;
  writeMap(map);
  return next;
}
