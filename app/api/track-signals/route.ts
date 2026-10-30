import type { NextRequest } from "next/server";

export const dynamic = "force-static";
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true, message: 'clean build' });
}

export async function POST() {
  return GET();
}