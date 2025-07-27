import { NextRequest, NextResponse } from "next/server";

interface Params {
  key: string[];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { key: keyArr } = await params;
    const key = keyArr.join("/");

    // TODO: Implement Convex file serving once file storage is migrated
    // For now, return not implemented
    return NextResponse.json(
      { error: "File serving not yet implemented in Convex migration" },
      { status: 501 },
    );
  } catch (err) {
    console.error("File proxy error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
