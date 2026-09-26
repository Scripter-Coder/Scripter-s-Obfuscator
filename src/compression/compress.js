// src/compression/compress.js — VM Compression (Phase 6, §22)
// Real pipeline: VM image -> serialize -> compress -> encrypt -> embed, and runtime decrypt->decompress->validate->decode->execute
// Compression independent from crypto, size optimization not security.

export function compressBytes(bytes) {
  // Simple RLE-like for demo (real would use lz-string / pako)
  // For bytes, we do delta + run-length where beneficial
  const out=[];
  let i=0;
  while(i<bytes.length){
    let run=1;
    while(i+run<bytes.length && bytes[i+run]===bytes[i] && run<255) run++;
    if(run>3){
      out.push(0xFF, bytes[i], run);
      i+=run;
    } else {
      out.push(bytes[i]);
      i++;
    }
  }
  return out;
}

export function decompressBytes(bytes) {
  const out=[];
  let i=0;
  while(i<bytes.length){
    if(bytes[i]===0xFF){
      const v=bytes[i+1], n=bytes[i+2];
      for(let k=0;k<n;k++) out.push(v);
      i+=3;
    } else {
      out.push(bytes[i]);
      i++;
    }
  }
  return out;
}

export function benchmarkCompression(original, compressed) {
  return {
    original: original.length,
    compressed: compressed.length,
    ratio: (compressed.length/original.length).toFixed(3),
  };
}

// Size optimization is separate from security — documented
export const NOTE = 'VM Compression is size optimization, not security feature (Luraph docs).';
