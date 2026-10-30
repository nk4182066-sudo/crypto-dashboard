import { db } from "@/src/lib/firebase";
import { addDoc, collection } from "firebase/firestore";



export async function GET() {
  const results: Record<string, unknown> = {
    dbInitialized: !!db,
    timestamp: new Date().toISOString(),
  };

  if (!db) {
    results.error = "db is null â€” Firebase not configured";
    return Response.json(results, { status: 500 });
  }

  try {
    console.log("[test-save] Attempting to save to signals collection: TEST-DUMMY");
    const docRef = await addDoc(collection(db, "signals"), {
      symbol: "TEST-DUMMY",
      price: 1,
      market: "test",
      score: 65,
      badge: "WEAK SETUP",
      createdAt: Date.now(),
      test: true,
    });
    console.log("[test-save] Saved to signals:", docRef.id);
    results.saved = true;
    results.docId = docRef.id;
    results.collection = "signals";
    return Response.json(results, { status: 200 });
  } catch (error) {
    console.error("[test-save] addDoc FAILED:", error instanceof Error ? error.message : error);
    results.saved = false;
    results.error = error instanceof Error ? error.message : String(error);
    return Response.json(results, { status: 500 });
  }
}

export async function POST() {
  return GET();
}


