const DECORATIVE_RE = /[─━═╌╍■□▪▫✓✗✦★☆⚡🔥💡⚠️❌✅🚀]/u;

const localRules = {
  'no-separator-comments': {
    create(context) {
      return {
        Program() {
          for (const comment of context.sourceCode.getAllComments()) {
            if (DECORATIVE_RE.test(comment.value)) {
              context.report({ node: comment, message: 'Decorative symbols in comments are not allowed.' });
            }
          }
        },
      };
    },
  },
  'no-console-log-padding': {
    create(context) {
      function check(node, raw) {
        if (/\t/.test(raw))
          context.report({ node, message: 'Tabs in console.log strings are not allowed.' });
        if (/ {2,}/.test(raw))
          context.report({ node, message: 'Multiple spaces in console.log strings are not allowed — use padEnd() or repeat().' });
      }
      return {
        CallExpression(node) {
          if (node.callee.type !== 'MemberExpression') return;
          if (node.callee.object.name !== 'console') return;
          if (node.callee.property.name !== 'log') return;
          for (const arg of node.arguments) {
            if (arg.type === 'Literal' && typeof arg.value === 'string') check(arg, arg.value);
            if (arg.type === 'TemplateLiteral') {
              for (const q of arg.quasis) check(q, q.value.raw);
            }
          }
        },
      };
    },
  },
  'no-decorative-symbols': {
    create(context) {
      function check(node, value) {
        if (DECORATIVE_RE.test(value)) {
          context.report({ node, message: 'Decorative symbols in strings are not allowed.' });
        }
      }
      return {
        Literal(node) {
          if (typeof node.value === 'string') check(node, node.value);
        },
        TemplateLiteral(node) {
          for (const q of node.quasis) check(q, q.value.raw);
        },
      };
    },
  },
};

export default [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'infra/**'],
    plugins: { local: { rules: localRules } },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        structuredClone: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-multi-spaces': ['error', { exceptions: { Property: false } }],
      'local/no-console-log-padding': 'error',
      'local/no-separator-comments': 'error',
      'local/no-decorative-symbols': 'error',
    },
  },
  {
    // Browser assets served to the client (published to the CDN), not Node code.
    files: ['**/client/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        document: 'readonly',
        navigator: 'readonly',
        window: 'readonly',
        fetch: 'readonly',
        Image: 'readonly',
      },
    },
    rules: {
      'no-var': 'off',
      'no-unused-vars': 'off',
    },
  },
];
