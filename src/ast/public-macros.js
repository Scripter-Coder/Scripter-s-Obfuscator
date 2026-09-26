// Public macro contract for the supported LPH capability surface.
import { applyMBA } from '../transform/mba.js';

const MACROS = new Set([
  'LPH_ENCSTR', 'LPH_ENCBUF', 'LPH_ENCNUM', 'LPH_ENCFUNC',
  'LPH_PRECHECK', 'LPH_REWRITE', 'LPH_CRASH', 'LPH_LINE',
]);

export function isPublicMacro(name) {
  return typeof name === 'string' && MACROS.has(name.toUpperCase());
}

export function validatePublicMacro(name, node, target) {
  const macro = String(name || '').toUpperCase();
  const args = node.arguments || [];
  const literal = (type) => args[0] && args[0].type === type;
  const stringValue = (valueNode) => valueNode && valueNode.type === 'StringLiteral'
    ? String(valueNode.value ?? valueNode.raw ?? '').replace(/^['"]|['"]$/g, '')
    : '';
  const hasBoundKey = args.length === 3;
  const keyIsValid = (key) => key && (
    (key.type === 'NumericLiteral' && Number.isInteger(key.value)) ||
    (key.type === 'StringLiteral' && (/^[0-9a-fA-F]{64}$/.test(stringValue(key)) || /^\{[0-9a-fA-F]{64}\}$/.test(stringValue(key))))
  );
  if (!MACROS.has(macro)) return null;
  if (macro === 'LPH_ENCSTR' && !(args.length === 1 || hasBoundKey) || (macro === 'LPH_ENCSTR' && (!literal('StringLiteral') || (hasBoundKey && (!keyIsValid(args[1]) || !args[2]))))) throw new Error('LPH_ENCSTR expects a string literal, optionally followed by a constant key and runtime key expression');
  if (macro === 'LPH_ENCBUF') {
    if (target !== 'luau') throw new Error('LPH_ENCBUF is only supported for target luau 0.709');
    if (!(args.length === 1 || hasBoundKey) || !literal('StringLiteral') || (hasBoundKey && (!keyIsValid(args[1]) || !args[2]))) throw new Error('LPH_ENCBUF expects a string literal, optionally followed by a constant key and runtime key expression');
  }
  if (macro === 'LPH_ENCNUM') {
    if (!(args.length === 1 || args.length === 2) || !literal('NumericLiteral')) throw new Error('LPH_ENCNUM expects a numeric literal and an optional key table');
    if (args.length === 2) validateNumberKeyTable(args[1]);
  }
  if (macro === 'LPH_ENCFUNC' && !(args.length === 1 && args[0] && (args[0].type === 'FunctionExpression' || (args[0].type === 'FunctionDeclaration' && !args[0].identifier)))) throw new Error('LPH_ENCFUNC expects exactly one anonymous function expression');
  if (macro === 'LPH_REWRITE') {
    if (args.length < 1 || args.length > 2) throw new Error('LPH_REWRITE expects an expression and optional constant options');
    validateRewriteNode(args[0]);
    const identifiers = rewriteIdentifiers(args[0]);
    if (identifiers.length > 8) throw new Error('LPH_REWRITE accepts at most 8 distinct identifiers');
    if (args[1]) validateRewriteOptions(args[1]);
    if (!rewriteContainsIdentifier(args[0]) && (rewritePublicOptions(args[1]).contextCount || 0) < 2) throw new Error('LPH_REWRITE constant expressions require at least two context values');
  }
  if (macro === 'LPH_PRECHECK') {
    if (args.length !== 2 || !args[0] || !(args[0].type === 'FunctionExpression' || (args[0].type === 'FunctionDeclaration' && !args[0].identifier))) throw new Error('LPH_PRECHECK expects an anonymous function and an integer or integer array');
    if ((args[0].parameters || []).length !== 0) throw new Error('LPH_PRECHECK function must have zero parameters');
    validatePrecheckExpected(args[1]);
  }
  if (macro === 'LPH_CRASH' && args.length !== 0) throw new Error('LPH_CRASH expects no arguments');
  if (macro === 'LPH_LINE' && args.length > 1) throw new Error('LPH_LINE expects zero or one argument');
  return macro;
}

function rewriteContainsIdentifier(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'Identifier') return true;
  return Object.keys(node).some((key) => {
    const value = node[key];
    return Array.isArray(value) ? value.some(rewriteContainsIdentifier) : rewriteContainsIdentifier(value);
  });
}

function rewriteIdentifiers(node) {
  const found = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'Identifier') found.add(value.name);
    for (const key of Object.keys(value)) {
      const child = value[key];
      if (Array.isArray(child)) child.forEach(walk);
      else walk(child);
    }
  }
  walk(node);
  return Array.from(found);
}

function validatePrecheckExpected(node) {
  if (constantIntegerValue(node) !== null) return;
  if (node.type === 'TableConstructorExpression' && (node.fields || []).every((field) => field.type === 'TableValue' && constantIntegerValue(field.value) !== null)) return;
  throw new Error('LPH_PRECHECK expected return must be an integer or constant integer array');
}

function constantIntegerValue(node) {
  if (node && node.type === 'NumericLiteral' && Number.isInteger(node.value)) return Number(node.value);
  if (node && node.type === 'UnaryExpression' && node.operator === '-' && node.argument && node.argument.type === 'NumericLiteral' && Number.isInteger(node.argument.value)) return -Number(node.argument.value);
  return null;
}

function validateNumberKeyTable(node) {
  if (!node || node.type !== 'TableConstructorExpression' || (node.fields || []).length > 8) throw new Error('LPH_ENCNUM key table must contain at most 8 entries');
  for (const field of node.fields || []) {
    if (field.type !== 'TableKey' || !field.key || !field.value || constantIntegerValue(field.value) === null) throw new Error('LPH_ENCNUM key table entries must map runtime expressions to integer literals');
  }
}

function validateRewriteOptions(node) {
  if (node.type === 'StringLiteral') {
    if (!['fast', 'standard', 'strong', 'extreme'].includes(String(node.value ?? node.raw ?? '').replace(/^['"]|['"]$/g, '').toLowerCase())) throw new Error('LPH_REWRITE preset must be fast, standard, strong, or extreme');
    return;
  }
  if (node.type !== 'TableConstructorExpression') throw new Error('LPH_REWRITE options must be a preset string or constant table');
  for (const field of node.fields || []) {
    if (field.type !== 'TableKeyString' || !['preset', 'budget', 'context'].includes(String(field.key.name).toLowerCase())) throw new Error('LPH_REWRITE options contain an unknown field');
    const value = field.value && field.value.type === 'StringLiteral' ? String(field.value.value ?? field.value.raw ?? '').replace(/^['"]|['"]$/g, '').toLowerCase() : '';
    if (field.key.name.toLowerCase() === 'preset' && (!value || !['fast', 'standard', 'strong', 'extreme'].includes(value))) throw new Error('LPH_REWRITE preset is invalid');
    if (field.key.name.toLowerCase() === 'budget' && (!value || !['small', 'medium', 'large'].includes(value))) throw new Error('LPH_REWRITE budget is invalid');
    if (field.key.name.toLowerCase() === 'context') {
      if (field.value.type !== 'TableConstructorExpression') throw new Error('LPH_REWRITE context must be a table');
      const contextFields = field.value.fields || [];
      if (contextFields.length > 8) throw new Error('LPH_REWRITE context accepts at most 8 values');
      for (const contextField of contextFields) {
        const value = contextField && (contextField.type === 'TableValue' ? contextField.value : contextField);
        const identifier = value && value.type === 'Identifier';
        if (!identifier) throw new Error('LPH_REWRITE context values must be identifier names');
      }
    }
  }
}

export function precheckExpectedValues(node) {
  validatePrecheckExpected(node);
  const scalar = constantIntegerValue(node);
  if (scalar !== null) return [scalar];
  return (node.fields || []).map((field) => constantIntegerValue(field.value));
}

const REWRITE_NODES = new Set([
  'NumericLiteral', 'Identifier', 'UnaryExpression', 'BinaryExpression',
]);

function rewriteContainsBitwiseOperator(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'UnaryExpression' && node.operator === '~') return true;
  if (node.type === 'BinaryExpression' && ['&', '|', '~', '<<', '>>'].includes(node.operator)) return true;
  for (const key of ['argument', 'left', 'right', 'base', 'index', 'identifier']) {
    if (rewriteContainsBitwiseOperator(node[key])) return true;
  }
  for (const value of node.arguments || []) if (rewriteContainsBitwiseOperator(value)) return true;
  return false;
}

function validateRewriteNode(node) {
  if (!node || !REWRITE_NODES.has(node.type)) throw new Error(`LPH_REWRITE does not support ${node?.type || 'missing expression'}`);
  if (node.type === 'UnaryExpression' && !['-', '~'].includes(node.operator)) throw new Error(`LPH_REWRITE does not support unary ${node.operator}`);
  if (node.type === 'BinaryExpression' && !['+', '-', '*', '&', '|', '~', '<<', '>>'].includes(node.operator)) throw new Error(`LPH_REWRITE does not support binary ${node.operator}`);
  for (const key of ['argument', 'left', 'right', 'base', 'index', 'identifier']) {
    if (node[key] && node[key].type) validateRewriteNode(node[key]);
  }
  for (const arg of node.arguments || []) validateRewriteNode(arg);
  if (node.argument && node.argument.type) validateRewriteNode(node.argument);
}

export function rewritePublicExpression(node, { seed = 0, profileName = 'BALANCED', target = 'lua51', budget = null, strength = null } = {}) {
  validateRewriteNode(node);
  const wrapper = { body: [{ type: 'ReturnStatement', arguments: [node] }] };
  const stats = applyMBA(wrapper, { seed, profileName, target, budget, strength, macro: true });
  return { node, stats };
}

export function rewritePublicOptions(node) {
  if (!node) return {};
  validateRewriteOptions(node);
  const valueOf = (value) => String(value.value ?? value.raw ?? '').replace(/^['"]|['"]$/g, '').toUpperCase();
  if (node.type === 'StringLiteral') return { preset: valueOf(node) };
  const options = {};
  for (const field of node.fields || []) {
    const key = field.key.name.toLowerCase();
    if (key === 'preset' || key === 'budget') options[key] = valueOf(field.value);
    if (key === 'context') {
      options.contextCount = (field.value.fields || []).length;
      options.contextValues = (field.value.fields || [])
        .map((entry) => entry && entry.type === 'TableValue' ? entry.value : entry)
        .map((value) => {
          if (value && value.type === 'NumericLiteral') return Number(value.value);
          if (value && value.type === 'UnaryExpression' && value.operator === '-' && value.argument && value.argument.type === 'NumericLiteral') return -Number(value.argument.value);
          return null;
        })
        .filter((value) => value !== null);
    }
  }
  return options;
}

export function publicMacroNames() {
  return Array.from(MACROS);
}
