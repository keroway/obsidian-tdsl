// Type declaration for .wasm files loaded as binary by esbuild.
// esbuild's `loader: { '.wasm': 'binary' }` produces a Uint8Array,
// which wasm-bindgen's init() accepts as a BufferSource.
declare module '*.wasm' {
  const bytes: ArrayBuffer;
  export default bytes;
}
