import { NextResponse } from "next/server";

// Public healthcheck for the container (wget -qO- http://127.0.0.1:3000/api/health).
export function GET() {
  return NextResponse.json({ status: "ok" });
}
