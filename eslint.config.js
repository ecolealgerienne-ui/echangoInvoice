// @ts-check
const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

/**
 * Configuration « flat », obligatoire depuis ESLint 9 (R032).
 *
 * Jusqu'au 2026-08-07 ce fichier n'existait pas : `npm run lint` échouait sur
 * « ESLint couldn't find an eslint.config.js », donc aucun lint n'avait jamais
 * tourné sur ce dépôt.
 *
 * On n'ajoute aucune dépendance : `@eslint/js` est livré avec ESLint 9, et le
 * parser comme le plugin TypeScript sont déjà en devDependencies. Passer par
 * le méta-paquet `typescript-eslint` tirerait `@eslint/js@10`, qui exige
 * ESLint 10 et casse la résolution.
 *
 * Le script `lint` ne porte volontairement pas `--fix` : un outil qui réécrit
 * le dépôt fabrique le diff qu'il devrait signaler et ne peut pas servir de
 * barrière. `lint:fix` existe séparément, pour quand on veut réellement écrire.
 */
module.exports = [
  {
    // Le backend seul. client/ et mobile/ ont leur propre tsconfig et leur
    // propre build ; shared/ est compilé par Vite des deux côtés.
    ignores: [
      'dist/**', 'node_modules/**', 'client/**', 'mobile/**',
      'shared/**', 'e2e/**', 'coverage/**', 'eslint.config.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
      globals: {
        process: 'readonly', console: 'readonly', Buffer: 'readonly',
        __dirname: 'readonly', __filename: 'readonly',
        require: 'readonly', module: 'writable', exports: 'writable',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      // R004 — Logger NestJS uniquement côté backend.
      'no-console': 'error',

      // Le code existant utilise `any` à de nombreux endroits (résultats de
      // requêtes brutes, DTO d'entrée). Signalé sans bloquer, pour ne pas
      // rendre la barrière inutilisable dès son premier jour.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Les décorateurs TypeORM et NestJS reposent sur des classes vides
      // et des interfaces de marquage.
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
    },
  },
  {
    // Les seeds et migrations sont des scripts : la sortie standard est leur
    // seule interface, `no-console` n'y a pas de sens.
    files: ['src/database/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];
