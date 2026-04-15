import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "Service role key not configured" },
      { status: 500 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  // Try to check if table exists by querying it
  const { error } = await supabase
    .from("albert_documents")
    .select("id")
    .limit(1);

  if (error) {
    return NextResponse.json({
      status: "table_missing",
      message:
        "Run the SQL migration in Supabase dashboard. See /setup page for instructions.",
    });
  }

  return NextResponse.json({ status: "ok", message: "Table exists" });
}
