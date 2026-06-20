import { useState } from 'react';

export function useColumnVisibility<T extends string>(
  storageKey: string,
  defaultVisible: T[],
) {
  const [visible, setVisible] = useState<T[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as T[];
    } catch { /* ignore */ }
    return defaultVisible;
  });

  function toggle(col: T) {
    setVisible(prev => {
      const next = prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  const col = (key: T) => visible.includes(key);

  return { visible, toggle, col };
}
