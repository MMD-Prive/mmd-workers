import { File } from "node:buffer";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.File) globalThis.File = File;
