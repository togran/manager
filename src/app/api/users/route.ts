import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createUser, deleteUserById, getUserByUsername, listUsers, type UserRole } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request, "admin");
  if (auth.error) return auth.error;
  return NextResponse.json({ users: listUsers() });
}

export async function POST(request: NextRequest) {
  const auth = await requireSession(request, "admin");
  if (auth.error) return auth.error;

  try {
    const { username, password, role } = (await request.json()) as {
      username?: string;
      password?: string;
      role?: UserRole;
    };

    if (!username || !password || !role || !["admin", "user"].includes(role)) {
      return NextResponse.json({ error: "username, password and role are required" }, { status: 400 });
    }

    if (getUserByUsername(username)) {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }

    const created = createUser(username, password, role);
    return NextResponse.json({ user: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSession(request, "admin");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
  }

  if (id === auth.session?.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const result = deleteUserById(id);
  if (result.changes === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
