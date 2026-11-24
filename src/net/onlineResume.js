const KEY = "mahjong-online-resume-v1";
const MAX_AGE = 6 * 60 * 60 * 1000;

// 同じタブの F5 に備える。トークンをログ/URLへ出さず、終了・明示退出・対局不在で削除。
export function createOnlineResumeStore(storage = () => sessionStorage, now = () => Date.now()) {
  const clear = () => { try { storage().removeItem(KEY); } catch { /* 保存不可でも対局は続ける */ } };
  return {
    clear,
    save(url, token) {
      if (!url || !token) return;
      try { storage().setItem(KEY, JSON.stringify({ url, token, savedAt: now() })); } catch { /* 保存不可 */ }
    },
    load(baseUrl) {
      try {
        const data = JSON.parse(storage().getItem(KEY));
        if (!data) return null;
        const url = new URL(data.url), base = new URL(baseUrl);
        if (!/^wss?:$/.test(url.protocol) || url.origin !== base.origin || url.pathname !== base.pathname ||
            url.username || url.password || typeof data.token !== "string" || !/^[a-f0-9]{32}$/.test(data.token) ||
            !Number.isFinite(data.savedAt) || now() - data.savedAt > MAX_AGE || data.savedAt > now()) {
          clear(); return null;
        }
        return data;
      } catch { clear(); return null; }
    },
  };
}
