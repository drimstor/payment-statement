import { getDb } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

type TransactionType = "interest" | "payment";

type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  date: string;
  balanceAfter: number;
};

type LoanState = {
  totalDebt: number;
  lastInterestMonth?: string;
};

type LoanStateDoc = LoanState & { _id: string };
type TransactionDoc = Transaction & { _id: string };

async function getLoanStateAndDb() {
  const db = await getDb();
  const collection = db.collection<LoanStateDoc>("loanState");

  let stateDoc = await collection.findOne({ _id: "state" });

  if (!stateDoc) {
    const initialDebtEnv = process.env.INITIAL_LOAN_DEBT;
    const initialDebt = initialDebtEnv ? Number(initialDebtEnv) : 0;

    stateDoc = {
      _id: "state",
      totalDebt: initialDebt,
    };

    await collection.insertOne(stateDoc);
  }

  return { db, stateDoc };
}

async function saveLoanState(
  db: Awaited<ReturnType<typeof getDb>>,
  state: LoanState,
) {
  const collection = db.collection<LoanStateDoc>("loanState");

  await collection.updateOne(
    { _id: "state" },
    {
      $set: {
        totalDebt: state.totalDebt,
        lastInterestMonth: state.lastInterestMonth,
      },
    },
    { upsert: true },
  );
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const authHeader = request.headers.get("authorization");
    const bearerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : null;

    const header = request.headers.get("x-cron-secret");

    const valid = bearerToken === secret || header === secret;

    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const day = now.getDate();

  if (day !== 28) {
    return NextResponse.json({
      applied: false,
      reason: "Not the 28th day of month",
    });
  }

  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}`;

  const { db, stateDoc } = await getLoanStateAndDb();

  if (stateDoc.lastInterestMonth === monthKey) {
    return NextResponse.json({
      applied: false,
      reason: "Interest already applied for this month",
    });
  }

  const interestRaw = stateDoc.totalDebt * 0.05;
  const interest = Math.round(interestRaw * 100) / 100;

  const newTotalDebt = stateDoc.totalDebt + interest;

  const updatedState: LoanState = {
    totalDebt: newTotalDebt,
    lastInterestMonth: monthKey,
  };

  const transaction: Transaction = {
    id: crypto.randomUUID(),
    type: "interest",
    amount: interest,
    date: now.toISOString(),
    balanceAfter: newTotalDebt,
  };

  const transactionsCollection = db.collection<TransactionDoc>("transactions");

  await Promise.all([
    saveLoanState(db, updatedState),
    transactionsCollection.insertOne({
      _id: transaction.id,
      ...transaction,
    }),
  ]);

  return NextResponse.json({
    applied: true,
    state: updatedState,
    transaction,
  });
}
