import { NextResponse } from "next/server";
import { readSessionFromCookies } from "@/lib/auth";

export async function GET() {
  const session = await readSessionFromCookies();
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: session });
}
