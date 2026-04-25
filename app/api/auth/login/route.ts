import { NextResponse } from "next/server";
// We will import bcrypt and jose here later

// In Next.js, the function name dictates the HTTP method (POST, GET, etc.)
export async function POST(request: Request) {
  try {
    // 1. Parse the incoming JSON from the frontend
    const body = await request.json();
    const { email, password } = body;

    // 2. Validate input exists
    if (!email || !password) {
      return NextResponse.json(
        { message: "Invalid credentials" },
        { status: 401 },
      );
    }

    // [TODO]: Connect to Database
    // [TODO]: Verify bcrypt hash
    // [TODO]: Generate RS256 JWT via jose

    // 3. Return success for now so we can test the connection
    return NextResponse.json({
      message: "Endpoint reached successfully",
      email,
    });
  } catch (error) {
    console.error("Login Error:", error);
    // Strict Error Handling: Never leak database state on failure
    return NextResponse.json(
      { message: "Invalid credentials" },
      { status: 401 },
    );
  }
}
