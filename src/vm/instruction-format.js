// Profile-specific instruction-word encoding. The scheduler consumes only the
// decoded logical words; serialized representation is selected per architecture.
export function instructionFormat(architecture, seed) {
  const arch = String(architecture || 'OPAL').toUpperCase();
  return {
    name: arch === 'ONYX' ? 'tagged-additive-u32' : 'compact-u32',
    architecture: arch,
    seed: seed >>> 0,
  };
}

function key(format, chunkIndex, wordIndex) {
  return ((format.seed % 1000003) + (chunkIndex + 1) * 65537 + (wordIndex + 1) * 257) % 4294967296;
}

export function encodeWord(format, word, chunkIndex, wordIndex) {
  if (format.architecture !== 'ONYX') return word >>> 0;
  return (word + key(format, chunkIndex, wordIndex)) % 4294967296;
}

export function decodeWord(format, word, chunkIndex, wordIndex) {
  if (format.architecture !== 'ONYX') return word >>> 0;
  const value = (word - key(format, chunkIndex, wordIndex)) % 4294967296;
  return value < 0 ? value + 4294967296 : value;
}

export function encodeChunkWords(format, words, chunkIndex) {
  return words.map((word, index) => encodeWord(format, word, chunkIndex, index));
}

export function decodeChunkWords(format, words, chunkIndex) {
  return words.map((word, index) => decodeWord(format, word, chunkIndex, index));
}
