// src/workers/polyfill-buffer.js
import { Buffer } from 'buffer';
if (!globalThis.Buffer) globalThis.Buffer = Buffer;