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

async function getLoanState() {
  const db = await getDb();
  const collection = db.collection<LoanStateDoc>("loanState");

  let state = await collection.findOne({ _id: "state" });

  if (!state) {
    const initialDebtEnv = process.env.INITIAL_LOAN_DEBT;
    const initialDebt = initialDebtEnv ? Number(initialDebtEnv) : 0;

    state = {
      _id: "state",
      totalDebt: initialDebt,
    };

    await collection.insertOne(state);
  }

  return { db, state };
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

async function addTransaction(
  type: TransactionType,
  amount: number,
): Promise<{ state: LoanState; transaction: Transaction }> {
  const { db, state } = await getLoanState();

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

  const transactionsCollection = db.collection<TransactionDoc>("transactions");

  await Promise.all([
    saveLoanState(db, updatedState),
    transactionsCollection.insertOne({
      _id: id,
      ...transaction,
    }),
  ]);

  return { state: updatedState, transaction };
}

export async function GET() {
  const db = await getDb();

  const stateCollection = db.collection<LoanStateDoc>("loanState");
  const transactionsCollection = db.collection<TransactionDoc>("transactions");

  let stateDoc = await stateCollection.findOne({ _id: "state" });

  if (!stateDoc) {
    const initialDebtEnv = process.env.INITIAL_LOAN_DEBT;
    const initialDebt = initialDebtEnv ? Number(initialDebtEnv) : 0;

    stateDoc = {
      _id: "state",
      totalDebt: initialDebt,
    };

    await stateCollection.insertOne(stateDoc);
  }

  const transactionsDocs = await transactionsCollection
    .find({})
    .sort({ date: -1 })
    .toArray();

  const transactions: Transaction[] = transactionsDocs.map((doc) => ({
    id: doc.id,
    type: doc.type,
    amount: doc.amount,
    date: doc.date,
    balanceAfter: doc.balanceAfter,
  }));

  const state: LoanState = {
    totalDebt: stateDoc.totalDebt,
    lastInterestMonth: stateDoc.lastInterestMonth,
  };

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
