import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { ed25519 } from "@noble/curves/ed25519.js";
import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

type Keys = {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  seed: Uint8Array;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\//g, "_")
    .replace(/\+/g, "-")
    .replace(/=+$/, "");
}

export function base64ToBuffer(data: string): Uint8Array {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function importAesKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    secret as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seedFromMnemonic(mnemonic: string): Promise<Uint8Array> {
  return pbkdf2Async(sha256, mnemonic, "mnemonic", {
    c: 2048,
    dkLen: 32,
  });
}

export function verifyValidMnemonic(mnemonic: string): boolean {
  // First try to validate as BIP39 mnemonic
  if (validateMnemonic(mnemonic, wordlist)) {
    return true;
  }

  // If not a valid BIP39 mnemonic, check if it's a valid custom passphrase
  const validPassphraseRegex =
    /^[a-zA-Z0-9\s\-_.,!?@#$%^&*()+=:;"'<>[\]{}|\\/`~]+$/;
  return mnemonic.length >= 8 && validPassphraseRegex.test(mnemonic);
}

export async function keysFromSeed(seed: Uint8Array): Promise<Keys> {
  const { secretKey, publicKey } = ed25519.keygen(seed);

  return {
    privateKey: secretKey,
    publicKey,
    seed,
  };
}

export async function keysFromMnemonic(mnemonic: string): Promise<Keys> {
  const seed = await seedFromMnemonic(mnemonic);

  return keysFromSeed(seed);
}

export function genMnemonic(): string {
  return generateMnemonic(wordlist);
}

export async function signCode(
  code: string,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  return ed25519.sign(encoder.encode(code), privateKey);
}

export async function signChallenge(keys: Keys, challengeCode: string) {
  const signature = await signCode(challengeCode, keys.privateKey);
  return bytesToBase64Url(signature);
}

export async function encryptData(data: string, secret: Uint8Array) {
  if (secret.byteLength !== 32) {
    throw new Error("Secret must be at least 256-bit");
  }

  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await importAesKey(secret);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 },
      key,
      encoder.encode(data),
    ),
  );

  const tag = ciphertext.slice(-16);
  const encrypted = ciphertext.slice(0, -16);

  return `${bytesToBase64(iv)}.${bytesToBase64(encrypted)}.${bytesToBase64(
    tag,
  )}` as const;
}

export async function decryptData(data: string, secret: Uint8Array) {
  if (secret.byteLength !== 32) {
    throw new Error("Secret must be 256-bit");
  }

  const [ivB64, encryptedB64, tagB64] = data.split(".");

  const iv = base64ToBuffer(ivB64);
  const encrypted = base64ToBuffer(encryptedB64);
  const tag = base64ToBuffer(tagB64);
  const ciphertext = new Uint8Array(encrypted.length + tag.length);
  ciphertext.set(encrypted, 0);
  ciphertext.set(tag, encrypted.length);

  const key = await importAesKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 },
    key,
    ciphertext as BufferSource,
  );

  return decoder.decode(decrypted);
}

// Passkey/WebAuthn utilities

export function isPasskeySupported(): boolean {
  // Passkeys require HTTPS
  const isSecureContext =
    typeof window !== "undefined" && window.location.protocol === "https:";

  return (
    isSecureContext &&
    typeof navigator !== "undefined" &&
    "credentials" in navigator &&
    "create" in navigator.credentials &&
    "get" in navigator.credentials &&
    typeof PublicKeyCredential !== "undefined"
  );
}

function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  if (typeof base64Url !== "string") {
    throw new Error(
      `Invalid credential ID: expected string, got ${typeof base64Url}`,
    );
  }
  // Convert base64url to base64
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface PasskeyCredential {
  id: string;
  rawId: ArrayBuffer;
  response: AuthenticatorAttestationResponse;
}

export interface PasskeyAssertion {
  id: string;
  rawId: ArrayBuffer;
  response: AuthenticatorAssertionResponse;
}

export async function createPasskey(
  userId: string,
  userName: string,
): Promise<PasskeyCredential> {
  if (!isPasskeySupported()) {
    throw new Error("Passkeys are not supported in this browser");
  }

  // Generate a random user ID (8 bytes)
  const userIdBuffer = new Uint8Array(8);
  crypto.getRandomValues(userIdBuffer);

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions =
    {
      challenge,
      rp: {
        name: "oko",
        id: window.location.hostname,
      },
      user: {
        id: userIdBuffer,
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    };

  try {
    const credential = (await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error("Failed to create passkey");
    }

    return {
      id: credential.id,
      rawId: credential.rawId,
      response: credential.response as AuthenticatorAttestationResponse,
    };
  } catch (error) {
    throw new Error(
      `Failed to create passkey: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function authenticatePasskey(
  credentialId?: string,
): Promise<PasskeyAssertion> {
  if (!isPasskeySupported()) {
    throw new Error("Passkeys are not supported in this browser");
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const allowCredentials: PublicKeyCredentialDescriptor[] | undefined =
    credentialId && typeof credentialId === "string" && credentialId.length > 0
      ? [
          {
            id: base64UrlToArrayBuffer(credentialId),
            type: "public-key",
          },
        ]
      : undefined;

  const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    timeout: 60000,
    userVerification: "preferred",
    allowCredentials,
    rpId: window.location.hostname,
  };

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error("Failed to authenticate with passkey");
    }

    return {
      id: assertion.id,
      rawId: assertion.rawId,
      response: assertion.response as AuthenticatorAssertionResponse,
    };
  } catch (error) {
    throw new Error(
      `Failed to authenticate with passkey: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function seedFromCredentialId(credentialId: string): Promise<Uint8Array> {
  // Hash credential ID the same way we hash mnemonics
  return pbkdf2Async(sha256, credentialId, "mnemonic", {
    c: 2048,
    dkLen: 32,
  });
}

export async function keysFromCredentialId(
  credentialId: string,
): Promise<Keys> {
  const seed = await seedFromCredentialId(credentialId);
  return keysFromSeed(seed);
}

// Storage helpers for credential mappings
const STORAGE_PREFIX = "__MW::passkey::";

function getStorageKey(backendUrl: string, publicKey: string): string {
  return `${STORAGE_PREFIX}${backendUrl}::${publicKey}`;
}

export function storeCredentialMapping(
  backendUrl: string,
  publicKey: string,
  credentialId: string,
): void {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("localStorage is not available");
  }
  const key = getStorageKey(backendUrl, publicKey);
  localStorage.setItem(key, credentialId);
}

export function getCredentialId(
  backendUrl: string,
  publicKey: string,
): string | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  const key = getStorageKey(backendUrl, publicKey);
  return localStorage.getItem(key);
}

export function removeCredentialMapping(
  backendUrl: string,
  publicKey: string,
): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  const key = getStorageKey(backendUrl, publicKey);
  localStorage.removeItem(key);
}
