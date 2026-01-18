import { kv } from "@vercel/kv";
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

const stateKey = "loan:state";
const transactionsKey = "loan:transactions";

async function getLoanState(): Promise<LoanState> {
  let state = await kv.get<LoanState>(stateKey);

  if (!state) {
    const initialDebtEnv = process.env.INITIAL_LOAN_DEBT;
    const initialDebt = initialDebtEnv ? Number(initialDebtEnv) : 0;
    state = { totalDebt: initialDebt };
    await kv.set(stateKey, state);
  }

  return state;
}

async function saveLoanState(state: LoanState) {
  await kv.set(stateKey, state);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const header = request.headers.get("x-cron-secret");

    if (!header || header !== secret) {
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

  const monthKey = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;

  const state = await getLoanState();

  if (state.lastInterestMonth === monthKey) {
    return NextResponse.json({
      applied: false,
      reason: "Interest already applied for this month",
    });
  }

  const interestRaw = state.totalDebt * 0.05;
  const interest = Math.round(interestRaw * 100) / 100;

  const newTotalDebt = state.totalDebt + interest;

  const updatedState: LoanState = {
    ...state,
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

  await Promise.all([
    saveLoanState(updatedState),
    kv.lpush(transactionsKey, JSON.stringify(transaction)),
  ]);

  return NextResponse.json({
    applied: true,
    state: updatedState,
    transaction,
  });
}

