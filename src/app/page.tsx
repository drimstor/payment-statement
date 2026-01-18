import { getDb } from "@/lib/mongodb";
import Link from "next/link";
import styles from "./page.module.css";

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
};

type Data = {
  state: LoanState;
  transactions: Transaction[];
};

async function getData(): Promise<Data> {
  const db = await getDb();

  const stateCollection = db.collection<LoanState & { _id: string }>(
    "loanState",
  );
  const transactionsCollection = db.collection<Transaction & { _id: string }>(
    "transactions",
  );

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
  };

  return { state, transactions };
}

function formatCurrency(value: number) {
  return value.toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function Home() {
  const { state, transactions } = await getData();

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Кредит</h1>
            <p className={styles.subtitle}>История платежей и процентов</p>
          </div>
          <Link href="/pay" className={styles.payButton}>
            Внести платёж
          </Link>
        </header>

        <section className={styles.summary}>
          <p className={styles.summaryLabel}>Общий долг</p>
          <p className={styles.summaryValue}>
            {formatCurrency(state.totalDebt)}
          </p>
        </section>

        <section className={styles.transactions}>
          <h2 className={styles.transactionsTitle}>Транзакции</h2>
          {transactions.length === 0 ? (
            <p className={styles.empty}>Пока нет ни одной транзакции.</p>
          ) : (
            <ul className={styles.transactionsList}>
              {transactions.map((transaction) => (
                <li key={transaction.id} className={styles.transactionItem}>
                  <div
                    className={
                      transaction.type === "interest"
                        ? styles.iconInterest
                        : styles.iconPayment
                    }
                  >
                    {transaction.type === "interest" ? "%" : "₽"}
                  </div>
                  <div className={styles.transactionMain}>
                    <div className={styles.transactionRow}>
                      <span className={styles.transactionTitle}>
                        {transaction.type === "interest"
                          ? "Проценты по кредиту"
                          : "Платёж по кредиту"}
                      </span>
                      <span
                        className={
                          transaction.type === "interest"
                            ? styles.amountNegative
                            : styles.amountPositive
                        }
                      >
                        {transaction.type === "interest" ? "+" : "−"}
                        {formatCurrency(transaction.amount)}
                      </span>
                    </div>
                    <div className={styles.transactionRow}>
                      <span className={styles.transactionDate}>
                        {formatDate(transaction.date)}
                      </span>
                      <span className={styles.transactionBalance}>
                        Остаток: {formatCurrency(transaction.balanceAfter)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
