export function progression(xp) {
  let level = 1,
    base = 0;
  while (xp >= base + level * 100) {
    base += level * 100;
    level++;
  }
  return { level, current: xp - base, needed: level * 100 };
}
