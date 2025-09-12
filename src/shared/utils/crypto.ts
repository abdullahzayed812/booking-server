import crypto from "crypto";
import bcrypt from "bcryptjs";

// Password hashing utilities
export const hashPassword = async (password: string, saltRounds: number = 12): Promise<string> => {
  return bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// Generate secure random tokens
export const generateSecureToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString("hex");
};

export const generateNumericToken = (length: number = 6): string => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
};

// Generate UUID v4
export const generateUUID = (): string => {
  return crypto.randomUUID();
};

// Hash sensitive data for lookup (one-way)
export const hashForLookup = (data: string): string => {
  return crypto.createHash("sha256").update(data).digest("hex");
};

// Generate verification codes
export const generateVerificationCode = (): string => {
  return generateNumericToken(6);
};

// Generate API keys
export const generateApiKey = (): string => {
  const prefix = "dka_"; // Doctor App Key
  const key = generateSecureToken(32);
  return `${prefix}${key}`;
};

// Encrypt/decrypt sensitive data (for storing reversible data)
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
// const TAG_LENGTH = 16;

export const encrypt = (text: string, key: string): { encrypted: string; iv: string; tag: string } => {
  const keyBuffer = crypto.scryptSync(key, "salt", KEY_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, keyBuffer);
  cipher.setAAD(Buffer.from("additional_data"));

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
};

export const decrypt = (encryptedData: { encrypted: string; iv: string; tag: string }, key: string): string => {
  const keyBuffer = crypto.scryptSync(key, "salt", KEY_LENGTH);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, keyBuffer);

  decipher.setAAD(Buffer.from("additional_data"));
  decipher.setAuthTag(Buffer.from(encryptedData.tag, "hex"));

  let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

// Generate HMAC signature for webhook verification
export const generateHMACSignature = (payload: string, secret: string): string => {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
};

export const verifyHMACSignature = (payload: string, signature: string, secret: string): boolean => {
  const expectedSignature = generateHMACSignature(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};

// Generate session ID
export const generateSessionId = (): string => {
  return generateUUID();
};

// Generate correlation ID
export const generateCorrelationId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substr(2, 9);
  return `${timestamp}-${randomPart}`;
};
