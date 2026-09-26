// src/compression/compress.js — VM Compression (Phase 6, §22)
// Real pipeline: VM image -> serialize -> compress -> encrypt -> embed, and runtime decrypt->decompress->validate->decode->execute
// Compression independent from crypto, size optimization not security.

export function compressBytes(bytes) {
  // Byte-safe RLE. 0xFF is the escape marker; count=1 is a literal
  // 0xFF, so every byte value round-trips without ambiguity.
  const out=[];
  let i=0;
  while(i<bytes.length){
    const v=bytes[i] & 0xFF;
    let run=1;
    while(i+run<bytes.length && (bytes[i+run]&0xFF)===v && run<255) run++;
    if(v===0xFF || run>3){
      out.push(0xFF,v,run);
      i+=run;
    } else {
      out.push(v);
      i++;
    }
  }
  return out;
}

export function decompressBytes(bytes) {
  const out=[];
  for(let i=0;i<bytes.length;i++){
    const b=bytes[i]&0xFF;
    if(b===0xFF){
      if(i+2>=bytes.length) throw new Error('truncated RLE marker');
      const v=bytes[++i]&0xFF, n=bytes[++i]&0xFF;
      if(n<1) throw new Error('invalid RLE count');
      for(let k=0;k<n;k++) out.push(v);
    } else out.push(b);
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
