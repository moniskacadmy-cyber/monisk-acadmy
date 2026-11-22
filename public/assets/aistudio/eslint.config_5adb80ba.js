import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'src/**/*', 'api/**/*', 'scripts/**/*', 'tests/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
