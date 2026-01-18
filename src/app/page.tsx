import { kv } from "@vercel/kv";
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
  const stateKey = "loan:state";
  const transactionsKey = "loan:transactions";
  let state = await kv.get<LoanState>(stateKey);

  if (!state) {
    const initialDebtEnv = process.env.INITIAL_LOAN_DEBT;
    const initialDebt = initialDebtEnv ? Number(initialDebtEnv) : 0;
    state = { totalDebt: initialDebt };
    await kv.set(stateKey, state);
  }

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

  return {
    state,
    transactions,
  };
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
