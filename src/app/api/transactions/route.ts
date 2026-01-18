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

async function addTransaction(
  type: TransactionType,
  amount: number,
): Promise<{ state: LoanState; transaction: Transaction }> {
  const state = await getLoanState();

  const normalizedAmount = Number(amount);

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("Invalid amount");
  }

  const now = new Date();
  const id = crypto.randomUUID();

  let newTotalDebt = state.totalDebt;

  if (type === "interest") {
    newTotalDebt = state.totalDebt + normalizedAmount;
  } else {
    newTotalDebt = state.totalDebt - normalizedAmount;

    if (newTotalDebt < 0) {
      newTotalDebt = 0;
    }
  }

  const updatedState: LoanState = {
    ...state,
    totalDebt: newTotalDebt,
  };

  const transaction: Transaction = {
    id,
    type,
    amount: normalizedAmount,
    date: now.toISOString(),
    balanceAfter: newTotalDebt,
  };

  await Promise.all([
    saveLoanState(updatedState),
    kv.lpush(transactionsKey, JSON.stringify(transaction)),
  ]);

  return { state: updatedState, transaction };
}

export async function GET() {
  const state = await getLoanState();

  const rawTransactions = await kv.lrange<string>(transactionsKey, 0, -1);
  const transactions = rawTransactions
    .map((item) => {
      try {
        return JSON.parse(item) as Transaction;
      } catch {
        return undefined;
      }
    })
    .filter((item): item is Transaction => Boolean(item));

  return NextResponse.json({
    state,
    transactions,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const type = body.type as TransactionType;
    const amount = Number(body.amount);

    if (type !== "interest" && type !== "payment") {
      return NextResponse.json(
        { error: "Invalid transaction type" },
        { status: 400 },
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const { state, transaction } = await addTransaction(type, amount);

    return NextResponse.json(
      {
        state,
        transaction,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to add transaction" },
      { status: 500 },
    );
  }
}
