import { SignJWT, importPKCS8 } from "jose";

/**
 * Helper function: Sometimes when pasting RSA keys into .env, the required
 * PEM headers get stripped. This ensures 'jose' can read the key properly.
 */
const formatPrivateKey = (key: string) => {
  if (key.includes("BEGIN PRIVATE KEY")) return key;
  return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
};

/**
 * Generates a highly secure RS256 Access Token.
 * * @param userId The database ID of the user
 * @param role The RBAC role (e.g., 'ADMIN', 'OPERATOR')
 * @param email The user's email
 * @returns A signed JWT string
 */
export async function generateAccessToken(
  userId: string,
  role: string,
  email: string,
) {
  // 1. Grab the private key from your .env file
  const secretKey = process.env.GUARDIAN_JWT_PRIVATE_KEY;

  if (!secretKey) {
    throw new Error(
      "Critical Security Error: GUARDIAN_JWT_PRIVATE_KEY is missing.",
    );
  }

  // 2. Format it and convert it into a cryptographic key object
  const formattedKey = formatPrivateKey(secretKey);
  const privateKey = await importPKCS8(formattedKey, "RS256");

  // 3. Mint the token using the 'jose' library
  const jwt = await new SignJWT({ userId, role, email })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("15m") // Strictly enforces the 15-minute JIT window
    .sign(privateKey);

  return jwt;
}
