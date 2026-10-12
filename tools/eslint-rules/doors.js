// ESLint rule "doors": a file imports another folder's code only through that folder's door, its
// index.js (see www/js/*/**/index.js). Files of its own folder it imports directly.
'use strict';

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: "import another folder only through its door, index.js" },
    schema: [],
    messages: { door: "Import '{{path}}' through its folder's door: {{door}}" }
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const path = node.source.value;
        if (!path.startsWith('../') || path.endsWith('/index.js')) return;
        context.report({ node: node.source, messageId: 'door', data: { path, door: path.replace(/[^/]+$/, 'index.js') } });
      }
    };
  }
};
