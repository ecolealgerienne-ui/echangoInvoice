import type { RegisterOptions } from 'react-hook-form';

// ── Primitives ────────────────────────────────────────────────────────────────

export const rules = {
  required: (label: string): RegisterOptions => ({
    required: `${label} est requis`,
  }),

  positiveInt: (label: string, min = 1): RegisterOptions => ({
    required: `${label} est requis`,
    valueAsNumber: true,
    validate: (v) => {
      if (!Number.isInteger(Number(v)) || Number(v) < min)
        return `${label} doit être un entier ≥ ${min}`;
      return true;
    },
  }),

  positiveNumber: (label: string, min = 0): RegisterOptions => ({
    required: `${label} est requis`,
    valueAsNumber: true,
    min: { value: min, message: `${label} doit être ≥ ${min}` },
  }),

  percentage: (label = 'Taux'): RegisterOptions => ({
    required: `${label} est requis`,
    valueAsNumber: true,
    min: { value: 0, message: `${label} doit être ≥ 0` },
    max: { value: 100, message: `${label} doit être ≤ 100` },
  }),

  phone: (label = 'Téléphone'): RegisterOptions => ({
    pattern: {
      value: /^[+0-9\s\-().]{6,20}$/,
      message: `${label} invalide (ex : +213 555 12 34 56)`,
    },
  }),

  email: (label = 'Email'): RegisterOptions => ({
    pattern: {
      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: `${label} invalide`,
    },
  }),

  numberFormat: (label: string): RegisterOptions => ({
    required: `${label} est requis`,
    pattern: {
      value: /#{3,4}/,
      message: `${label} doit contenir ### ou ####`,
    },
  }),

  maxLength: (label: string, max: number): RegisterOptions => ({
    maxLength: { value: max, message: `${label} ne doit pas dépasser ${max} caractères` },
  }),

  optionalEmail: (): RegisterOptions => ({
    pattern: {
      value: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: 'Email invalide',
    },
  }),

  optionalPhone: (): RegisterOptions => ({
    pattern: {
      value: /^$|^[+0-9\s\-().]{6,20}$/,
      message: 'Téléphone invalide (ex : +213 555 12 34 56)',
    },
  }),
} as const;

// ── Standalone validators (for non-hook-form contexts) ────────────────────────

export const validate = {
  isPositiveInt: (v: unknown) => Number.isInteger(Number(v)) && Number(v) > 0,
  isPercentage: (v: unknown) => Number(v) >= 0 && Number(v) <= 100,
  isPhone: (v: string) => /^[+0-9\s\-().]{6,20}$/.test(v.trim()),
  isEmail: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
};
