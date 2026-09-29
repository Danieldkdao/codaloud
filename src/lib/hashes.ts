import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** Lowercase hex SHA-256 of a UTF-8 string; the workspace revision token the native layer expects. */
export const sha256Hex = (value: string) =>
  bytesToHex(sha256(new TextEncoder().encode(value)));

export const sha256Bytes = (value: Uint8Array) => bytesToHex(sha256(value));

export const utf8ByteLength = (value: string) =>
  new TextEncoder().encode(value).length;
