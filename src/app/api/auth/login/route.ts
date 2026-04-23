import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { getUserByUsername } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { username, password } = (await request.json()) as {
      username?: string;
      password?: string;
    };
    const sanitizedUsername = username?.trim();
    const sanitizedPassword = password?.trim();

    if (!sanitizedUsername || !sanitizedPassword) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const user = getUserByUsername(sanitizedUsername);
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const ok = bcrypt.compareSync(sanitizedPassword, user.password);
    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await createSessionToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    const response = NextResponse.json({
      user: { id: user.id, username: user.username, role: user.role },
    });
    setSessionCookie(response, token);
    return response;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
