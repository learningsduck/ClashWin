export const DEVELOPER_SESSION_KEY = "clash_verge_developer_unlocked";

export function isDeveloperModeUnlocked(): boolean {
  return sessionStorage.getItem(DEVELOPER_SESSION_KEY) === "1";
}

export function setDeveloperModeUnlocked(unlocked: boolean): void {
  if (unlocked) {
    sessionStorage.setItem(DEVELOPER_SESSION_KEY, "1");
  } else {
    sessionStorage.removeItem(DEVELOPER_SESSION_KEY);
  }
}
