"use client";

import { useEffect } from "react";

export default function PayPage() {
  useEffect(() => {
    const amountInput = window.prompt("Введите сумму платежа");

    if (!amountInput) {
      return;
    }

    const normalized = amountInput.replace(",", ".");
    const amount = Number(normalized);

    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert("Некорректная сумма");
      return;
    }

    const send = async () => {
      try {
        const response = await fetch("/api/transactions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "payment",
            amount,
          }),
        });

        if (!response.ok) {
          let message = "Не удалось сохранить платёж";

          try {
            const data = await response.json();
            if (data && typeof data.error === "string") {
              message = data.error;
            }
          } catch {
          }

          window.alert(message);
          return;
        }

        window.alert("Платёж сохранён");
        window.location.href = "/";
      } catch {
        window.alert("Ошибка сети при сохранении платежа");
      }
    };

    void send();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <p>Окно ввода суммы платежа должно быть открыто браузером.</p>
    </main>
  );
}

