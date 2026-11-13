// 在 renderer 模块读取偏好之前搬迁旧 localStorage 键；原始 userData 副本仍保留。
for (const key of Object.keys(localStorage)) {
  if (!/^zcode([:._-]|$)/i.test(key)) continue;
  const target = key.replace(/^zcode/i, "aibuddy7se");
  if (localStorage.getItem(target) === null)
    localStorage.setItem(target, localStorage.getItem(key));
  localStorage.removeItem(key);
}
